import { expect, test } from "@playwright/test";
import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import {
  addRepo,
  generateApiToken,
  initSchema,
  runMigrations,
  tmuxSessionName,
} from "@issuectl/core";

const execFileAsync = promisify(execFile);

const WEB_ROOT = join(import.meta.dirname, "..");
const TEST_PORT = Number(process.env.ISSUECTL_LIVE_CODEX_WORKBENCH_PORT ?? 3862);
const BASE_URL = `http://localhost:${TEST_PORT}`;
const LIVE_ENABLED = process.env.ISSUECTL_LIVE_CODEX_WORKBENCH_E2E === "1";
const DEFAULT_REPO = "mean-weasel/issuectl-test-repo-2";
const TARGET_REPO_REF = process.env.ISSUECTL_LIVE_CODEX_WORKBENCH_REPO ?? DEFAULT_REPO;
const ALLOWED_E2E_REPOS = new Set([
  "mean-weasel/issuectl-test-repo",
  "mean-weasel/issuectl-test-repo-2",
]);
const ISSUE_TITLE_PREFIX = "[issuectl-e2e-live]";

type RepoRef = {
  owner: string;
  repo: string;
  ref: string;
};

type CreatedIssue = {
  number: number;
  title: string;
};

type DeploymentRow = {
  ended_at: string | null;
  ttyd_port: number | null;
  ttyd_pid: number | null;
};

let tmpDir: string | undefined;
let dbPath: string | undefined;
let apiToken = "";
let server: ChildProcess | undefined;
let skipReason: string | undefined;
let createdIssues: CreatedIssue[] = [];
let deploymentId: number | undefined;
let deploymentRepo: RepoRef | undefined;
let deploymentIssueNumber: number | undefined;

function parseRepoRef(raw: string): RepoRef {
  const [owner, repo, extra] = raw.split("/");
  if (!owner || !repo || extra) {
    throw new Error(
      `Invalid ISSUECTL_LIVE_CODEX_WORKBENCH_REPO: ${JSON.stringify(raw)}. Use owner/repo.`,
    );
  }
  return { owner, repo, ref: `${owner}/${repo}` };
}

function assertAllowedRepo(repoRef: RepoRef): void {
  if (!ALLOWED_E2E_REPOS.has(repoRef.ref)) {
    throw new Error(
      `Refusing live Codex workbench E2E side effects for ${repoRef.ref}. ` +
      `Allowed repos: ${[...ALLOWED_E2E_REPOS].join(", ")}`,
    );
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function canRun(repoRef: RepoRef): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!LIVE_ENABLED) {
    return {
      ok: false,
      reason: "Set ISSUECTL_LIVE_CODEX_WORKBENCH_E2E=1 to run live side-effecting coverage.",
    };
  }

  try {
    assertAllowedRepo(repoRef);
  } catch (err) {
    throw err;
  }

  for (const bin of ["gh", "git", "codex", "ttyd", "tmux"] as const) {
    try {
      await execFileAsync("which", [bin]);
    } catch {
      return { ok: false, reason: `${bin} is not installed` };
    }
  }

  try {
    await execFileAsync("gh", ["auth", "token"]);
  } catch {
    return { ok: false, reason: "gh auth not configured" };
  }

  try {
    await execFileAsync("gh", ["repo", "view", repoRef.ref, "--json", "name"]);
  } catch {
    return { ok: false, reason: `gh cannot access ${repoRef.ref}` };
  }

  return { ok: true };
}

function createTestDb(path: string, repoRef: RepoRef, worktreeDir: string): string {
  assertAllowedRepo(repoRef);
  const db = new Database(path);
  try {
    initSchema(db);
    runMigrations(db);
    const insertSetting = db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    );
    for (const [key, value] of [
      ["branch_pattern", "issue-{number}-{slug}"],
      ["cache_ttl", "0"],
      ["worktree_dir", worktreeDir],
      ["launch_agent", "codex"],
      ["codex_extra_args", "--sandbox danger-full-access --ask-for-approval never"],
    ] as const) {
      insertSetting.run(key, value);
    }
    addRepo(db, {
      owner: repoRef.owner,
      name: repoRef.repo,
      branchPattern: "issue-{number}-{slug}",
    });
    return generateApiToken(db);
  } finally {
    db.close();
  }
}

async function waitForServer(url: string, token: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/v1/workbench`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) return;
      lastError = new Error(`Server returned ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError instanceof Error ? lastError : new Error("Server timeout");
}

async function createMarkedIssue(repoRef: RepoRef, suffix: string): Promise<CreatedIssue> {
  assertAllowedRepo(repoRef);
  const title = `${ISSUE_TITLE_PREFIX} ${suffix} ${Date.now()}`;
  const { stdout } = await execFileAsync("gh", [
    "issue",
    "create",
    "--repo",
    repoRef.ref,
    "--title",
    title,
    "--body",
    [
      "Created by packages/web/e2e/codex-workbench-live.spec.ts.",
      "This issue is safe to close automatically.",
    ].join("\n\n"),
  ]);
  const match = stdout.match(/\/issues\/(\d+)/);
  if (!match) {
    throw new Error(`Could not parse issue number from gh output: ${stdout}`);
  }
  return { number: Number(match[1]), title };
}

async function closeMarkedIssue(repoRef: RepoRef, issue: CreatedIssue): Promise<void> {
  assertAllowedRepo(repoRef);
  let title = "";
  try {
    const result = await execFileAsync("gh", [
      "issue",
      "view",
      String(issue.number),
      "--repo",
      repoRef.ref,
      "--json",
      "title",
      "--jq",
      ".title",
    ]);
    title = result.stdout.trim();
  } catch {
    return;
  }
  if (!title.startsWith(ISSUE_TITLE_PREFIX)) return;
  await execFileAsync("gh", [
    "issue",
    "close",
    String(issue.number),
    "--repo",
    repoRef.ref,
    "--reason",
    "not planned",
  ]).catch(() => undefined);
}

async function apiPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function readDeployment(id: number): DeploymentRow | undefined {
  if (!dbPath) return undefined;
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare(
      "SELECT ended_at, ttyd_port, ttyd_pid FROM deployments WHERE id = ?",
    ).get(id) as DeploymentRow | undefined;
  } finally {
    db.close();
  }
}

async function cleanupDeployment(): Promise<void> {
  if (!deploymentRepo || !deploymentIssueNumber) return;
  assertAllowedRepo(deploymentRepo);

  if (deploymentId) {
    await apiPost(`/api/v1/deployments/${deploymentId}/end`, {
      owner: deploymentRepo.owner,
      repo: deploymentRepo.repo,
      issueNumber: deploymentIssueNumber,
    }).catch(() => undefined);
  }

  const row = deploymentId ? readDeployment(deploymentId) : undefined;
  if (row?.ttyd_pid) {
    try {
      process.kill(row.ttyd_pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }

  try {
    execFileSync("tmux", [
      "kill-session",
      "-t",
      tmuxSessionName(deploymentRepo.repo, deploymentIssueNumber),
    ], { stdio: "ignore" });
  } catch {
    // Already gone.
  }
}

async function stopServer(): Promise<void> {
  if (!server?.pid) return;
  const killGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-server!.pid!, signal);
    } catch {
      try {
        server?.kill(signal);
      } catch {
        // Already gone.
      }
    }
  };
  const killTimeout = setTimeout(() => killGroup("SIGKILL"), 5_000);
  killGroup("SIGTERM");
  await new Promise<void>((resolve) => {
    if (!server || server.exitCode !== null) {
      resolve();
      return;
    }
    server.once("close", () => resolve());
  });
  clearTimeout(killTimeout);
}

async function expectTerminalReady(
  page: import("@playwright/test").Page,
  issueNumber: number,
  seenConsoleMessages: string[],
): Promise<void> {
  const iframe = page.locator(`iframe[title="Terminal for issue ${issueNumber}"]`);
  try {
    await iframe.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    const reconnect = page.getByRole("button", { name: "Reconnect session" });
    if (await reconnect.isVisible().catch(() => false)) {
      await reconnect.click();
    }
  }
  await expect(iframe).toBeVisible({ timeout: 90_000 });
  await expect(iframe).toHaveAttribute("src", /\/api\/terminal\/\d+\/\?terminalToken=/);
  await expect.poll(
    async () => seenConsoleMessages.some((message) =>
      message.includes("[ttyd] websocket connection opened"),
    ),
    { timeout: 90_000, message: "ttyd websocket should open" },
  ).toBe(true);
}

test.beforeAll(async () => {
  const repoRef = parseRepoRef(TARGET_REPO_REF);
  if (LIVE_ENABLED) {
    assertAllowedRepo(repoRef);
  }

  const check = await canRun(repoRef);
  if (!check.ok) {
    skipReason = check.reason;
    return;
  }

  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-live-codex-workbench-"));
  dbPath = join(tmpDir, "issuectl.db");
  apiToken = createTestDb(dbPath, repoRef, join(tmpDir, "worktrees"));

  server = spawn(process.execPath, ["--import", "tsx", "server.ts", "--dev"], {
    cwd: WEB_ROOT,
    env: {
      ...process.env,
      ISSUECTL_DB_PATH: dbPath,
      NEXT_DIST_DIR: join(tmpDir, ".next"),
      NEXT_PRIVATE_SKIP_SETUP: "1",
      PORT: String(TEST_PORT),
    },
    stdio: "pipe",
    detached: true,
  });

  let serverOutput = "";
  server.stdout?.on("data", (chunk: Buffer) => {
    serverOutput = `${serverOutput}${chunk.toString()}`.slice(-4_000);
  });
  server.stderr?.on("data", (chunk: Buffer) => {
    serverOutput = `${serverOutput}${chunk.toString()}`.slice(-4_000);
  });

  await waitForServer(BASE_URL, apiToken, 90_000).catch((err) => {
    throw new Error(`${err.message}\n${serverOutput}`);
  });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await cleanupDeployment();
  }
});

test.afterAll(async () => {
  const repoRef = parseRepoRef(TARGET_REPO_REF);
  await cleanupDeployment();
  for (const issue of [...createdIssues].reverse()) {
    await closeMarkedIssue(repoRef, issue);
  }
  await stopServer();
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  deploymentId = undefined;
  deploymentRepo = undefined;
  deploymentIssueNumber = undefined;
  createdIssues = [];
});

test("allowlist rejects non-test repositories before side effects", () => {
  expect(() => assertAllowedRepo(parseRepoRef("mean-weasel/issuectl"))).toThrow(
    /Refusing live Codex workbench E2E side effects/,
  );
  for (const allowed of ALLOWED_E2E_REPOS) {
    expect(() => assertAllowedRepo(parseRepoRef(allowed))).not.toThrow();
  }
});

test("creates a test issue, launches Codex, returns to the running terminal, and cleans up", async ({ page }) => {
  test.setTimeout(300_000);
  if (skipReason) test.skip(true, skipReason);

  const repoRef = parseRepoRef(TARGET_REPO_REF);
  assertAllowedRepo(repoRef);
  deploymentRepo = repoRef;

  const primaryIssue = await createMarkedIssue(repoRef, "primary");
  createdIssues.push(primaryIssue);
  deploymentIssueNumber = primaryIssue.number;

  const otherIssue = await createMarkedIssue(repoRef, "navigation-target");
  createdIssues.push(otherIssue);

  const launchRes = await apiPost(
    `/api/v1/launch/${repoRef.owner}/${repoRef.repo}/${primaryIssue.number}`,
    {
      agent: "codex",
      branchName: `issue-${primaryIssue.number}-live-codex-workbench-e2e`,
      workspaceMode: "clone",
      selectedCommentIndices: [],
      selectedFilePaths: [],
      preamble: "Live E2E: keep the Codex terminal session open for workbench persistence verification.",
      forceResume: false,
      idempotencyKey: `live-codex-${Date.now()}`,
    },
  );
  expect(launchRes.status).toBe(200);
  const launchJson = await launchRes.json() as {
    success: boolean;
    deploymentId: number;
    ttydPort: number;
  };
  expect(launchJson.success).toBe(true);
  deploymentId = launchJson.deploymentId;
  expect(readDeployment(deploymentId)?.ttyd_pid).toBeGreaterThan(0);

  const consoleMessages: string[] = [];
  page.on("console", (message) => {
    consoleMessages.push(message.text());
  });
  await page.addInitScript((token) => {
    window.localStorage.setItem("issuectl.apiToken", token);
  }, apiToken);

  const repoParam = encodeURIComponent(repoRef.ref);
  const deploymentUrl = `${BASE_URL}/workbench?repo=${repoParam}&deployment=${deploymentId}`;
  await page.goto(deploymentUrl, { waitUntil: "networkidle" });
  await expect(page.getByLabel("Workbench context")).toContainText(
    `${repoRef.ref} #${primaryIssue.number} terminal`,
  );
  await expectTerminalReady(page, primaryIssue.number, consoleMessages);

  await page.goto(`${BASE_URL}/workbench?repo=${repoParam}`, { waitUntil: "networkidle" });
  await page
    .getByRole("complementary", { name: "Repo issues" })
    .getByLabel(`Issue #${otherIssue.number}`)
    .click();
  await expect(page.getByRole("heading", {
    name: new RegExp(`#${otherIssue.number}.*${escapeRegExp(otherIssue.title)}`),
  })).toBeVisible({ timeout: 30_000 });

  consoleMessages.length = 0;
  await page.goto(deploymentUrl, { waitUntil: "networkidle" });
  await expect(page).toHaveURL(new RegExp(`deployment=${deploymentId}$`));
  await expect(page.getByLabel("Workbench context")).toContainText(
    `${repoRef.ref} #${primaryIssue.number} terminal`,
  );
  await expectTerminalReady(page, primaryIssue.number, consoleMessages);

  const session = page.getByLabel(`Session #${primaryIssue.number}`);
  await session.getByText("End", { exact: true }).click();
  await expect(session.getByText("End session?")).toBeVisible();
  await session.getByRole("button", { name: "End session" }).click();
  await expect(page.getByLabel(`Session #${primaryIssue.number}`)).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => readDeployment(deploymentId!)?.ended_at ?? null, {
    timeout: 30_000,
  }).not.toBeNull();

  await closeMarkedIssue(repoRef, otherIssue);
  await closeMarkedIssue(repoRef, primaryIssue);
});
