import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { generateApiToken, initSchema, runMigrations } from "@issuectl/core";

const WEB_ROOT = join(import.meta.dirname, "..");
const REPO_ROOT = join(WEB_ROOT, "..", "..");
const NEXT_BIN = join(WEB_ROOT, "node_modules", "next", "dist", "bin", "next");
const SERVER_MARKER = `workbench-e2e-${process.pid}-${Date.now()}`;
const DIRECTORY_SYMLINK_TYPE = process.platform === "win32" ? "junction" : "dir";
const ISOLATED_WEB_ROOT_LINKS = [
  "middleware.ts",
  "instrumentation.ts",
  "instrumentation-client.ts",
  "next-env.d.ts",
  "app",
  "components",
  "hooks",
  "lib",
  "public",
];

test.describe.configure({ retries: 1 });

let server: ChildProcess | undefined;
let tmpDir: string | undefined;
let testPort = 0;
let baseUrl = "";
let dbPath = "";
let apiToken = "";
let isolatedWebRoot = "";
let serverOutput = "";

type FixtureIssue = {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: Array<{ name: string; color: string; description: string | null }>;
  assignees: [];
  user: { login: string; avatarUrl: string };
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  htmlUrl: string;
  priority: "low" | "normal" | "high";
};

type FixtureRepo = ReturnType<typeof repo>;

async function findFreePort(): Promise<number> {
  const { createServer } = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address?.port) resolve(address.port);
        else reject(new Error("Unable to allocate free port"));
      });
    });
  });
}

function appendServerOutput(chunk: Buffer): void {
  serverOutput = `${serverOutput}${chunk.toString("utf-8")}`.slice(-8_000);
}

function serverTimeoutError(): Error {
  return new Error(`Server timeout\n${serverOutput.trim()}`);
}

function linkDirectory(target: string, path: string): void {
  symlinkSync(target, path, DIRECTORY_SYMLINK_TYPE);
}

function linkWebRootEntry(root: string, entry: string): void {
  const target = join(WEB_ROOT, entry);
  if (!existsSync(target)) return;

  if (entry === "app") {
    // Next's app router route discovery does not reliably index a symlinked app directory in this harness.
    cpSync(target, join(root, entry), { recursive: true });
    return;
  }

  if (lstatSync(target).isDirectory()) {
    symlinkSync(target, join(root, entry), DIRECTORY_SYMLINK_TYPE);
    return;
  }

  copyFileSync(target, join(root, entry));
}

function waitForServer(url: string, token: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      fetch(`${url}/api/v1/workbench`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) return null;
          return res.json() as Promise<{ health?: { version?: string } }>;
        })
        .then((payload) => {
          if (payload?.health?.version === SERVER_MARKER) {
            resolve();
          } else if (Date.now() > deadline) {
            reject(serverTimeoutError());
          } else {
            setTimeout(check, 500);
          }
        })
        .catch(() => {
          if (Date.now() > deadline) reject(serverTimeoutError());
          else setTimeout(check, 500);
        });
    };
    check();
  });
}

function createIsolatedWebRoot(path: string): string {
  const root = join(path, "web");
  mkdirSync(root);
  linkDirectory(join(REPO_ROOT, "node_modules"), join(path, "node_modules"));

  for (const file of ["next.config.ts", "package.json"]) {
    copyFileSync(join(WEB_ROOT, file), join(root, file));
  }
  writeFileSync(
    join(root, "tsconfig.json"),
    readFileSync(join(WEB_ROOT, "tsconfig.json"), "utf-8").replace(
      '"extends": "../../tsconfig.base.json"',
      `"extends": "${join(REPO_ROOT, "tsconfig.base.json")}"`,
    ),
  );

  linkDirectory(join(WEB_ROOT, "node_modules"), join(root, "node_modules"));
  // Keep the isolated app root small while still exposing common Next runtime entrypoints when they exist.
  for (const entry of ISOLATED_WEB_ROOT_LINKS) {
    linkWebRootEntry(root, entry);
  }

  return root;
}

test.beforeAll(async () => {
  serverOutput = "";
  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-workbench-"));
  isolatedWebRoot = createIsolatedWebRoot(tmpDir);
  testPort = await findFreePort();
  baseUrl = `http://localhost:${testPort}`;
  dbPath = join(tmpDir, "test.db");
  apiToken = createTestDb(dbPath);
  const fakeGh = join(tmpDir, "gh");
  writeFileSync(
    fakeGh,
    [
      "#!/bin/sh",
      "if [ \"$1\" = \"auth\" ] && [ \"$2\" = \"status\" ]; then",
      "  echo 'Logged in to github.com as jeremy'",
      "  exit 0",
      "fi",
      "if [ \"$1\" = \"auth\" ] && [ \"$2\" = \"token\" ]; then",
      "  echo 'workbench-test-token'",
      "  exit 0",
      "fi",
      "echo \"unexpected gh args: $*\" >&2",
      "exit 1",
      "",
    ].join("\n"),
  );
  chmodSync(fakeGh, 0o755);
  const fakeTmux = join(tmpDir, "tmux");
  writeFileSync(
    fakeTmux,
    [
      "#!/bin/sh",
      "case \"$*\" in",
      "  *issuectl-issuectl-447*) echo 'running tests'; exit 0 ;;",
      "  *issuectl-issuectl-486*) echo 'Error: preview failed'; exit 0 ;;",
      "  *issuectl-issuectl-498*) exit 0 ;;",
      "  *issuectl-bugdrop-440*) echo 'running bugdrop checks'; exit 0 ;;",
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(fakeTmux, 0o755);

  server = spawn(process.execPath, [NEXT_BIN, "dev", "--port", String(testPort)], {
    cwd: isolatedWebRoot,
    env: {
      ...process.env,
      ISSUECTL_DB_PATH: dbPath,
      ISSUECTL_E2E_MARKER: SERVER_MARKER,
      NEXT_PUBLIC_APP_VERSION: SERVER_MARKER,
      NEXT_DIST_DIR: join(isolatedWebRoot, ".next"),
      NEXT_PRIVATE_SKIP_SETUP: "1",
      PATH: `${tmpDir}:${process.env.PATH ?? ""}`,
    },
    stdio: "pipe",
    detached: true,
  });
  server.stdout?.on("data", appendServerOutput);
  server.stderr?.on("data", appendServerOutput);

  await waitForServer(baseUrl, apiToken, 60_000);
});

test.beforeEach(async ({ page }) => {
  seedWorkbenchRepos(dbPath);
  await page.addInitScript((token) => {
    window.localStorage.setItem("issuectl.apiToken", token);
  }, apiToken);
});

function createTestDb(path: string): string {
  const db = new Database(path);
  try {
    initSchema(db);
    runMigrations(db);
    return generateApiToken(db);
  } finally {
    db.close();
  }
}

function seedWorkbenchRepos(path: string, repos: FixtureRepo[] = workbenchPayload().repos): void {
  const db = new Database(path);
  try {
    db.prepare("DELETE FROM deployments").run();
    db.prepare("DELETE FROM issue_metadata").run();
    db.prepare("DELETE FROM repos").run();
    db.prepare("DELETE FROM cache").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("cache_ttl", "99999");
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("branch_pattern", "issue-{number}-{slug}");
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("launch_agent", "codex");

    for (const item of repos) {
      db.prepare(
        "INSERT INTO repos (id, owner, name, local_path, branch_pattern) VALUES (?, ?, ?, ?, ?)",
      ).run(item.id, item.owner, item.name, item.localPath, item.branchPattern);
      db.prepare("INSERT INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now'))")
        .run(`issues:${item.owner}/${item.name}`, JSON.stringify(item.issues));
      for (const deployment of item.deployments) {
        db.prepare(
          `INSERT INTO deployments
           (id, repo_id, issue_number, agent, branch_name, workspace_mode, workspace_path, state, launched_at, ended_at, ttyd_port, ttyd_pid, idle_since)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          deployment.id,
          item.id,
          deployment.issueNumber,
          deployment.agent,
          deployment.branchName,
          deployment.workspaceMode,
          deployment.workspacePath,
          deployment.state,
          deployment.launchedAt,
          deployment.endedAt,
          deployment.ttydPort,
          deployment.ttydPid,
          deployment.idleSince,
        );
      }
      for (const issue of item.issues) {
        db.prepare(
          "INSERT INTO issue_metadata (repo_id, issue_number, priority, updated_at) VALUES (?, ?, ?, ?)",
        ).run(item.id, issue.number, issue.priority, Date.now());
      }
    }
  } finally {
    db.close();
  }
}

test.afterAll(async () => {
  if (server?.pid) {
    const waitForClose = new Promise<void>((resolve) => {
      if (server?.exitCode !== null) {
        resolve();
        return;
      }
      server?.once("close", () => resolve());
    });
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
    const killTimeout = setTimeout(() => {
      if (server?.pid && server.exitCode === null) {
        try {
          process.kill(-server.pid, "SIGKILL");
        } catch {
          server.kill("SIGKILL");
        }
      }
    }, 5_000);
    await waitForClose;
    clearTimeout(killTimeout);
  }
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("renders the production shell without prototype controls", async ({ page }) => {
  await gotoWorkbenchWithRetry(page);

  await expect(page.getByRole("link", { name: "issuectl workbench" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Workbench navigation" });
  await expect(nav.getByRole("button")).toHaveText([
    "Issues",
    "Board",
    "PRs",
    "Workbench",
    "Quick Create",
    "Settings",
  ]);
  await expect(page.getByText("Mock state")).toHaveCount(0);
  await expect(page.getByText("Terminal selected")).toHaveCount(0);
  await expect(page.getByText("Issue selected")).toHaveCount(0);
  await expect(page.getByText("Repo selected")).toHaveCount(0);
  await expect(page.getByText("Repo setup")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New shell", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Repositories")).toBeVisible();
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expect(page.getByRole("button", { name: "mean-weasel/issuectl" })).toContainText("IC");
  await expect(page.getByRole("button", { name: "mean-weasel/bugdrop" })).toContainText("BD");
  await expect(page.getByRole("button", { name: "mean-weasel/api" })).toContainText("API");
  await expect(page.getByRole("button", { name: "mean-weasel/web" })).toContainText("WEB");
});

test("bootstraps the API token for first-load workbench issue detail requests", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();

  await page.route("**/api/v1/worktrees/status?**", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ exists: false, dirty: false, path: "/tmp/worktree" }),
    });
  });
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });

  try {
    await gotoWorkbenchWithRetry(page);
    await page.getByLabel("Issue #512").click();

    await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
    await expect(page.getByText("Issue detail failed to load")).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("issuectl.apiToken")))
      .toBe(apiToken);
  } finally {
    await context.close();
  }
});

test("direct-load workbench settings bootstraps the API token before client actions", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const seen = { settingsGet: false, settingsPatch: false, health: false, user: false };

  await page.route("**/api/v1/settings", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    if (route.request().method() === "GET") {
      seen.settingsGet = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          settings: {
            branch_pattern: "issue-{number}-{slug}",
            cache_ttl: "99999",
            worktree_dir: "/tmp/worktrees",
            launch_agent: "codex",
            claude_extra_args: "--verbose",
            codex_extra_args: "",
            idle_grace_period: "300",
            idle_threshold: "300",
          },
        }),
      });
      return;
    }

    seen.settingsPatch = true;
    expect(route.request().method()).toBe("PATCH");
    expect(await route.request().postDataJSON()).toEqual({
      branch_pattern: "issue-{number}-{slug}",
      cache_ttl: "120",
      worktree_dir: "/tmp/worktrees",
      launch_agent: "codex",
      claude_extra_args: "--verbose",
      codex_extra_args: "",
      idle_grace_period: "300",
      idle_threshold: "300",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/v1/health", async (route) => {
    seen.health = true;
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, version: "test-version", timestamp: "2026-05-16T16:00:00.000Z" }),
    });
  });
  await page.route("**/api/v1/user", async (route) => {
    seen.user = true;
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ login: "jeremy" }),
    });
  });

  try {
    await page.goto(`${baseUrl}/workbench/settings`);
    await expect(page.getByRole("heading", { name: "Workbench settings" })).toBeVisible();
    await expect(page.getByLabel("Health summary")).toContainText("jeremy");
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("issuectl.apiToken")))
      .toBe(apiToken);
    await page.getByLabel("Cache TTL").fill("120");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
    expect(seen).toEqual({ settingsGet: true, settingsPatch: true, health: true, user: true });
  } finally {
    await context.close();
  }
});

test("keeps rail width stable across loading and loaded states", async ({ page }) => {
  await gotoWorkbenchWithRetry(page);
  const rail = page.getByLabel("Repositories");
  await expect(rail).toBeVisible();
  const before = await rail.boundingBox();
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  const after = await rail.boundingBox();

  expect(before?.width).toBeGreaterThanOrEqual(68);
  expect(before?.width).toBeLessThanOrEqual(76);
  expect(after?.width).toBe(before?.width);
});

test("sets the compact rail width at 1100px", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 850 });

  await gotoWorkbenchWithRetry(page);
  const rail = page.getByLabel("Repositories");
  await expect(rail).toBeVisible();
  const box = await rail.boundingBox();

  expect(box?.width).toBe(68);
});

test("resizes workbench columns, persists widths, and resets them", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoWorkbenchWithRetry(page);

  await assertVisibleWorkbenchLayout(page);
  const leftHandle = page.getByRole("separator", { name: "Resize instances column" });
  const rightHandle = page.getByRole("separator", { name: "Resize issues column" });
  await expect(leftHandle).toHaveAttribute("aria-valuemin", "220");
  await expect(rightHandle).toHaveAttribute("aria-valuemax", "420");

  const leftBox = await leftHandle.boundingBox();
  expect(leftBox).not.toBeNull();
  expect(leftBox!.height).toBeGreaterThan(100);
  await expect.poll(async () => page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("aria-label"),
    { x: leftBox!.x + leftBox!.width / 2, y: leftBox!.y + leftBox!.height / 2 },
  )).toBe("Resize instances column");
  await page.mouse.move(leftBox!.x + leftBox!.width / 2, leftBox!.y + leftBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(leftBox!.x + leftBox!.width / 2 + 92, leftBox!.y + leftBox!.height / 2);
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");

  const rightBox = await rightHandle.boundingBox();
  expect(rightBox).not.toBeNull();
  expect(rightBox!.height).toBeGreaterThan(100);
  await page.mouse.move(rightBox!.x + rightBox!.width / 2, rightBox!.y + rightBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rightBox!.x + rightBox!.width / 2 - 96, rightBox!.y + rightBox!.height / 2);
  await page.mouse.up();

  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("issuectl.workbench.columnWidths")))
    .toBe(JSON.stringify({ instances: 360, issues: 420 }));
  await assertVisibleWorkbenchLayout(page);

  await page.getByRole("button", { name: "Reset column widths" }).click();
  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("issuectl.workbench.columnWidths")))
    .toBeNull();

  await page.evaluate(() => {
    window.localStorage.setItem(
      "issuectl.workbench.columnWidths",
      JSON.stringify({ instances: 284, issues: 348 }),
    );
  });
  await page.getByRole("button", { name: "Reset column widths" }).click();
  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("issuectl.workbench.columnWidths")))
    .toBeNull();
  const noOpResetLeftBox = await leftHandle.boundingBox();
  expect(noOpResetLeftBox).not.toBeNull();
  await page.mouse.move(
    noOpResetLeftBox!.x + noOpResetLeftBox!.width / 2,
    noOpResetLeftBox!.y + noOpResetLeftBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    noOpResetLeftBox!.x + noOpResetLeftBox!.width / 2 + 92,
    noOpResetLeftBox!.y + noOpResetLeftBox!.height / 2,
  );
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("issuectl.workbench.columnWidths")))
    .toBe(JSON.stringify({ instances: 360, issues: 348 }));
  await page.getByRole("button", { name: "Reset column widths" }).click();
  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("issuectl.workbench.columnWidths")))
    .toBeNull();

  await page.evaluate(() => {
    window.localStorage.setItem(
      "issuectl.workbench.columnWidths",
      JSON.stringify({ instances: 284, issues: 348 }),
    );
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await assertVisibleWorkbenchLayout(page);
  await page.getByRole("button", { name: "Reset column widths" }).click();
  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("issuectl.workbench.columnWidths")))
    .toBeNull();

  await page.getByRole("button", { name: "Reset column widths" }).click();
  const resetLeftBox = await leftHandle.boundingBox();
  expect(resetLeftBox).not.toBeNull();
  await page.mouse.move(resetLeftBox!.x + resetLeftBox!.width / 2, resetLeftBox!.y + resetLeftBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(resetLeftBox!.x + resetLeftBox!.width / 2 + 92, resetLeftBox!.y + resetLeftBox!.height / 2);
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("issuectl.workbench.columnWidths")))
    .toBe(JSON.stringify({ instances: 360, issues: 348 }));

  await page.getByRole("button", { name: "Reset column widths" }).click();
  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("issuectl.workbench.columnWidths")))
    .toBeNull();

  await page.setViewportSize({ width: 1100, height: 850 });
  await assertVisibleWorkbenchLayout(page);
});

test("passes the responsive QA layout matrix", async ({ page }) => {
  const matrix = [
    { width: 1440, height: 1000 },
    { width: 1280, height: 900 },
    { width: 1100, height: 850 },
  ];

  for (const viewport of matrix) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/workbench`);
    await expectNavOneRowAndClickable(page);
    await assertVisibleWorkbenchLayout(page);

    await clickNavAndExpect(page, "Issues", "/workbench/issues", true);
    await expectNoHorizontalPageScroll(page);
    await clickNavAndExpect(page, "Settings", "/workbench/settings", true);
    await expectNoHorizontalPageScroll(page);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    window.localStorage.setItem(
      "issuectl.workbench.columnWidths",
      JSON.stringify({ instances: 360, issues: 420 }),
    );
  });
  await page.goto(`${baseUrl}/workbench`);
  await assertVisibleWorkbenchLayout(page);
  await expectNoHorizontalPageScroll(page);
  await page.evaluate(() => window.localStorage.removeItem("issuectl.workbench.columnWidths"));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/workbench/board`);
  await expectBoardColumnWidths(page, 240);
  await expectNoHorizontalPageScroll(page);

  await page.setViewportSize({ width: 1100, height: 850 });
  await page.goto(`${baseUrl}/workbench/board`);
  await expectBoardColumnWidths(page, 220);
  await expectNoHorizontalPageScroll(page);
});

test("keeps compact workbench layouts usable on tablet and mobile", async ({ page }) => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 768, height: 850 },
    { width: 393, height: 852 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/workbench`);

    const nav = page.getByRole("navigation", { name: "Workbench navigation" });

    await expect(page.getByRole("link", { name: "issuectl workbench" })).toBeVisible();
    await expect(page.getByLabel("Workbench layout controls")).toHaveCount(0);
    await expect(nav).toBeVisible();
    await expectNoHorizontalPageScroll(page);
    await expectWorkbenchFitsViewport(page);

    await nav.getByRole("button", { name: "Settings" }).click();
    await expect(page).toHaveURL(new RegExp("/workbench/settings"));
    await expectNoHorizontalPageScroll(page);
    await expectWorkbenchFitsViewport(page);
    await expect(page.getByLabel("Cache TTL")).toBeVisible();

    await nav.getByRole("button", { name: "Quick Create" }).click();
    await page.getByLabel("Parse text").fill("Fix compact workbench layout");
    await expect(page.getByLabel("Parse text")).toHaveValue("Fix compact workbench layout");
    await expectNoHorizontalPageScroll(page);
    await expectWorkbenchFitsViewport(page);

    await nav.getByRole("button", { name: "Board" }).click();
    await expect(page).toHaveURL(new RegExp("/workbench/board"));
    await expect(page.getByRole("heading", { name: "Cross-repo board" })).toBeVisible();
    await expect(page.getByLabel("Cross-repo board")).toBeVisible();
    await expectNoHorizontalPageScroll(page);
    await expectWorkbenchFitsViewport(page);
    await expectBoardScrollsHorizontally(page);
  }
});

test("keeps compact mode matrix primary actions reachable", async ({ page }) => {
  await page.route("**/api/v1/pulls/mean-weasel/issuectl?**", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pulls: [pullFixture(501, { title: "Compact workbench mode audit", checksStatus: "success" })],
        fromCache: false,
        cachedAt: null,
      }),
    });
  });

  const matrix = [
    {
      path: "/workbench",
      current: "Workbench",
      primary: async () => page.getByRole("button", { name: "Refresh" }),
      verify: async () => {
        await expect(page.getByLabel("Compact active sessions")).toBeVisible();
        await expect(page.getByLabel("Compact repo issues")).toBeVisible();
      },
    },
    {
      path: "/workbench/issues",
      current: "Issues",
      primary: async () =>
        page.getByLabel("mean-weasel/issuectl issue #512").getByRole("button", { name: "Open issue" }),
      verify: async () => {
        await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
        await expect(page.getByLabel("Global issues")).toBeVisible();
      },
    },
    {
      path: "/workbench/board",
      current: "Board",
      primary: async () => page.getByLabel("Board controls").getByRole("button", { name: "Show running only" }),
      verify: async () => {
        await expect(page.getByRole("heading", { name: "Cross-repo board" })).toBeVisible();
        await expect(page.getByLabel("Cross-repo board")).toBeVisible();
        await expectBoardScrollsHorizontally(page);
      },
    },
    {
      path: "/workbench/prs",
      current: "PRs",
      primary: async () => page.getByRole("button", { name: "Refresh checks" }),
      verify: async () => {
        await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
        await expect(page.getByLabel("Pull requests for mean-weasel/issuectl")).toBeVisible();
      },
    },
    {
      path: "/workbench/quick-create",
      current: "Quick Create",
      primary: async () => page.getByRole("button", { name: "Parse", exact: true }),
      verify: async () => {
        await expect(page.getByRole("heading", { name: "Quick Create" })).toBeVisible();
        await page.getByLabel("Parse text").fill("Fix compact mode matrix");
        await expect(page.getByLabel("Parse text")).toHaveValue("Fix compact mode matrix");
      },
    },
    {
      path: "/workbench/settings",
      current: "Settings",
      primary: async () => page.getByRole("button", { name: "Save settings" }),
      verify: async () => {
        await expect(page.getByRole("heading", { name: "Workbench settings" })).toBeVisible();
        await expect(page.getByLabel("Cache TTL")).toBeVisible();
      },
    },
  ];

  for (const viewport of [
    { width: 393, height: 852 },
    { width: 360, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    for (const item of matrix) {
      await page.goto(`${baseUrl}${item.path}?repo=mean-weasel%2Fissuectl`);
      await expect(page.getByRole("link", { name: "issuectl workbench" })).toBeVisible();
      await expect(
        page
          .getByRole("navigation", { name: "Workbench navigation" })
          .getByRole("button", { name: item.current, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await item.verify();
      await expectNoHorizontalPageScroll(page);
      await expectWorkbenchFitsViewport(page);
      await expectLocatorWithinViewport(await item.primary(), viewport.width);
    }
  }
});

test("keeps compact state-changing workbench workflows inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const seen = {
    settings: false,
    parse: false,
    create: false,
    draftCreate: false,
    draftUpdate: false,
    draftAssign: false,
    listPulls: false,
    detailPull: false,
    reviewPull: false,
    mergePull: false,
    commentPull: false,
  };
  const draftId = "22222222-2222-4222-8222-222222222222";

  await page.route("**/api/v1/settings", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          settings: {
            branch_pattern: "issue-{number}-{slug}",
            cache_ttl: "99999",
            worktree_dir: "/tmp/worktrees",
            launch_agent: "codex",
            claude_extra_args: "--verbose",
            codex_extra_args: "",
            idle_grace_period: "300",
            idle_threshold: "300",
          },
        }),
      });
      return;
    }
    seen.settings = true;
    expect(route.request().method()).toBe("PATCH");
    expect(await route.request().postDataJSON()).toEqual({
      branch_pattern: "issue-{number}-{slug}",
      cache_ttl: "120",
      worktree_dir: "",
      launch_agent: "codex",
      claude_extra_args: "",
      codex_extra_args: "",
      idle_grace_period: "",
      idle_threshold: "",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/v1/pulls/mean-weasel/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.headers().authorization).toBe(`Bearer ${apiToken}`);

    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl" && request.method() === "GET") {
      seen.listPulls = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pulls: [pullFixture(501, {
            title: "Compact state-changing PR audit",
            body: "Fixes #512",
            checksStatus: "success",
          })],
          fromCache: false,
          cachedAt: null,
        }),
      });
      return;
    }
    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl/501" && request.method() === "GET") {
      seen.detailPull = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(pullDetailFixture()),
      });
      return;
    }
    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl/501/review") {
      seen.reviewPull = true;
      expect(request.method()).toBe("POST");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, reviewId: 7001 }),
      });
      return;
    }
    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl/501/merge") {
      seen.mergePull = true;
      expect(request.method()).toBe("POST");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, sha: "abc123" }),
      });
      return;
    }
    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl/501/comments") {
      seen.commentPull = true;
      expect(request.method()).toBe("POST");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, commentId: 8001 }),
      });
      return;
    }

    await route.fallback();
  });
  await page.route("**/api/v1/parse", async (route) => {
    seen.parse = true;
    expect(route.request().method()).toBe("POST");
    expect(await route.request().postDataJSON()).toEqual({
      input: "Fix compact workflow state changes",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        parsed: {
          suggestedOrder: ["compact-1", "compact-2"],
          issues: [
            {
              id: "compact-1",
              originalText: "Fix compact workflow state changes",
              title: "Fix compact workflow state changes",
              body: "State changes should stay reachable on compact workbench screens.",
              type: "bug",
              repoOwner: "mean-weasel",
              repoName: "issuectl",
              repoConfidence: 0.95,
              suggestedLabels: ["bug"],
              clarity: "clear",
            },
            {
              id: "compact-2",
              originalText: "Add compact workflow notes",
              title: "Add compact workflow notes",
              body: "Document the compact state-changing workflow audit.",
              type: "task",
              repoOwner: "mean-weasel",
              repoName: "issuectl",
              repoConfidence: 0.8,
              suggestedLabels: ["workbench"],
              clarity: "clear",
            },
          ],
        },
      }),
    });
  });
  await page.route("**/api/v1/parse/create", async (route) => {
    seen.create = true;
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        created: 1,
        drafted: 0,
        failed: 0,
        results: [{ id: "compact-1", success: true, issueNumber: 903, owner: "mean-weasel", repo: "issuectl" }],
      }),
    });
  });
  await page.route("**/api/v1/drafts/*/assign", async (route) => {
    seen.draftAssign = true;
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, issueNumber: 904, issueUrl: "https://github.com/mean-weasel/issuectl/904" }),
    });
  });
  await page.route("**/api/v1/drafts/*", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }
    seen.draftUpdate = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        draft: {
          id: draftId,
          title: "Compact draft follow-up",
          body: "Saved from compact state audit.",
          priority: "high",
        },
      }),
    });
  });
  await page.route("**/api/v1/drafts", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    seen.draftCreate = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, id: draftId }),
    });
  });

  await page.goto(`${baseUrl}/workbench/board?repo=mean-weasel%2Fissuectl`);
  await page.getByRole("button", { name: "Show running only" }).click();
  await expect(page.locator('article[aria-label^="Board issue"]')).toHaveCount(4);
  await expectCompactWorkbenchViewport(page);
  await page.getByRole("button", { name: "Sort by priority" }).click();
  await expect(page.getByLabel("Board column mean-weasel/issuectl").locator('article[aria-label^="Board issue"]').first())
    .toHaveAttribute("aria-label", "Board issue mean-weasel/issuectl #447");
  await expectCompactWorkbenchViewport(page);

  await page.goto(`${baseUrl}/workbench/prs?repo=mean-weasel%2Fissuectl`);
  await page.getByLabel("Pull request #501").getByRole("button", { name: "Open PR" }).click();
  await expect(page.getByLabel("Pull request detail")).toContainText("Linked issue #512");
  await expectCompactWorkbenchViewport(page);
  const pullDetail = page.getByLabel("Pull request detail");
  await pullDetail.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Review approved for #501");
  await expectCompactWorkbenchViewport(page);
  await pullDetail.getByRole("button", { name: "Merge squash", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("merged with squash");
  await expectCompactWorkbenchViewport(page);
  await pullDetail.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Comment added to #501");
  await expectCompactWorkbenchViewport(page);

  await page.goto(`${baseUrl}/workbench/settings?repo=mean-weasel%2Fissuectl`);
  await page.getByLabel("Cache TTL").fill("120");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await expectCompactWorkbenchViewport(page);

  await page.goto(`${baseUrl}/workbench/quick-create?repo=mean-weasel%2Fissuectl`);
  await page.getByLabel("Parse text").fill("Fix compact workflow state changes");
  await page.getByRole("button", { name: "Parse", exact: true }).click();
  await expect(page.getByLabel("Candidate issue 1")).toContainText("accepted");
  await expectCompactWorkbenchViewport(page);
  await page.getByLabel("Candidate issue 2").getByRole("button", { name: "Reject" }).click();
  await page.getByRole("button", { name: "Create accepted issues" }).click();
  await expect(page.getByLabel("Quick create results")).toContainText("1 created, 0 drafted, 0 failed");
  await expectCompactWorkbenchViewport(page);
  await page.getByLabel("Draft title").fill("Compact draft follow-up");
  await page.getByLabel("Draft body").fill("Saved from compact state audit.");
  await page.getByLabel("Draft priority").selectOption("high");
  await page.getByLabel("Draft labels").fill("bug, workbench");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await expectCompactWorkbenchViewport(page);
  await page.getByRole("button", { name: "Update draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft updated");
  await expectCompactWorkbenchViewport(page);
  await page.getByRole("button", { name: "Assign draft" }).click();
  await expect(page.getByRole("status")).toContainText("mean-weasel/issuectl#904");
  await expectCompactWorkbenchViewport(page);

  expect(seen).toEqual({
    settings: true,
    parse: true,
    create: true,
    draftCreate: true,
    draftUpdate: true,
    draftAssign: true,
    listPulls: true,
    detailPull: true,
    reviewPull: true,
    mergePull: true,
    commentPull: true,
  });
});

test("keeps compact issue action controls readable and ordered", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });

  await page.goto(`${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&issue=512`);
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await expectNoHorizontalPageScroll(page);
  await expectWorkbenchFitsViewport(page);

  const issueActions = page.getByLabel("Issue actions");
  await expect(issueActions.getByLabel("Metadata actions")).toBeVisible();
  const titleInput = issueActions.getByLabel("Issue title");
  const saveTitleButton = issueActions.getByRole("button", { name: "Save title" });
  await expect(titleInput).toHaveValue("Desktop instance manager workbench");
  await expect(saveTitleButton).toBeDisabled();
  await expectVerticallyBefore(titleInput, saveTitleButton);
  await titleInput.fill("Desktop instance manager workbench renamed");
  await expect(saveTitleButton).toBeEnabled();
  await expectNoHorizontalPageScroll(page);
  await expectWorkbenchFitsViewport(page);
});

test("keeps compact issue entry reachable from the workbench overview", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });

  await page.goto(`${baseUrl}/workbench`);
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Repo issues" })).toHaveCount(0);
  const compactIssues = page.getByLabel("Compact repo issues");
  await expect(compactIssues).toBeVisible();
  await expect(compactIssues.getByLabel("Issue #512")).toBeVisible();
  await compactIssues.getByLabel("Issue #512").getByRole("button", { name: "Open issue" }).click();
  await expect(page).toHaveURL(/issue=512/);
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  const issueActions = page.getByLabel("Issue actions");
  await expect(issueActions).toBeVisible();
  await expectNoHorizontalPageScroll(page);
  await expectWorkbenchFitsViewport(page);
});

test("keeps compact session entry reachable from the workbench overview", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");

  await page.goto(`${baseUrl}/workbench`);
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Active sessions" })).toHaveCount(0);
  const compactSessions = page.getByLabel("Compact active sessions");
  await expect(compactSessions).toBeVisible();
  await expect(compactSessions.getByLabel("Session #447")).toBeVisible();
  await compactSessions.getByLabel("Session #447").getByRole("button", { name: "Open terminal" }).click();
  await expect(page).toHaveURL(/deployment=101/);
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Terminal for issue 447"]').getByText("terminal ready")).toBeVisible();
  await expectNoHorizontalPageScroll(page);
  await expectWorkbenchFitsViewport(page);
});

test("keeps compact keyboard focus visible after issue and terminal shortcut activation", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");

  await page.goto(`${baseUrl}/workbench`);
  await expectFocusedWorkbenchPaneVisible(page);

  const issueShortcut = page.getByLabel("Compact repo issues")
    .getByLabel("Issue #512")
    .getByRole("button", { name: "Open issue" });
  await issueShortcut.focus();
  await expect(issueShortcut).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await expectFocusedWorkbenchPaneVisible(page);
  await expectCompactWorkbenchViewport(page);

  const workbenchNav = page
    .getByRole("navigation", { name: "Workbench navigation" })
    .getByRole("button", { name: "Workbench", exact: true });
  await workbenchNav.focus();
  await expect(workbenchNav).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expectFocusedWorkbenchPaneVisible(page);

  const terminalShortcut = page.getByLabel("Compact active sessions")
    .getByLabel("Session #447")
    .getByRole("button", { name: "Open terminal" });
  await terminalShortcut.focus();
  await expect(terminalShortcut).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toBeVisible();
  await expectFocusedWorkbenchPaneVisible(page);
  await expectCompactWorkbenchViewport(page);
});

test("restores compact overview scroll after opening an issue detail", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });

  await page.goto(`${baseUrl}/workbench`);
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  const focus = page.getByLabel("Workbench focus");
  await expect(focus).toBeFocused();
  await focus.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => focus.evaluate((element) => element.scrollTop)).toBeGreaterThan(150);

  const issueShortcut = page.getByLabel("Compact repo issues")
    .getByLabel("Issue #512")
    .getByRole("button", { name: "Open issue" });
  await issueShortcut.scrollIntoViewIfNeeded();
  const overviewScroll = await focus.evaluate((element) => element.scrollTop);
  expect(overviewScroll).toBeGreaterThan(150);

  await issueShortcut.click();
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await expectFocusedWorkbenchPaneVisible(page);
  await expect.poll(() => focus.evaluate((element) => element.scrollTop)).toBe(0);

  await page
    .getByRole("navigation", { name: "Workbench navigation" })
    .getByRole("button", { name: "Workbench", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expectFocusedWorkbenchPaneVisible(page);
  await expect.poll(() => focus.evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(overviewScroll - 2);
  await expect(page.getByLabel("Compact repo issues").getByLabel("Issue #512")).toBeVisible();
  await expectCompactWorkbenchViewport(page);
});

test("recovers compact unavailable terminal sessions without showing the sessions pane", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const unavailableRepos = workbenchPayload().repos;
  unavailableRepos[0] = {
    ...unavailableRepos[0],
    deployments: unavailableRepos[0].deployments.map((deployment) =>
      deployment.id === 101
        ? { ...deployment, ttydPort: null, ttydPid: null }
        : deployment,
    ),
  };
  seedWorkbenchRepos(dbPath, unavailableRepos);
  let ensureTtydCalls = 0;
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    ensureTtydCalls += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");

  await page.goto(`${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&deployment=101`);

  await expect(page.getByRole("heading", { name: "Terminal unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect session" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to overview" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Active sessions" })).toHaveCount(0);
  await expectNoHorizontalPageScroll(page);
  await expectWorkbenchFitsViewport(page);

  await page.getByRole("button", { name: "Reconnect session" }).click();

  await expect.poll(() => ensureTtydCalls).toBeGreaterThanOrEqual(1);
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Terminal for issue 447"]').getByText("terminal ready")).toBeVisible();
  await expectNoHorizontalPageScroll(page);
  await expectWorkbenchFitsViewport(page);
});

test("keeps compact failure empty and stale workbench states inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });

  seedWorkbenchRepos(dbPath, []);
  await page.goto(`${baseUrl}/workbench`);
  await expect(page.getByRole("heading", { name: "No tracked repositories" })).toBeVisible();
  await expect(page.getByLabel("Workbench focus").getByRole("button", { name: "Add repository" })).toBeVisible();
  await expectCompactWorkbenchViewport(page);

  seedWorkbenchRepos(dbPath);
  await page.goto(`${baseUrl}/workbench`);
  await page.getByRole("button", { name: "mean-weasel/web" }).click();
  await expect(page.getByRole("heading", { name: "mean-weasel/web" })).toBeVisible();
  await expect(page.getByText("Set up local path")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open repo setup" })).toBeVisible();
  await expectCompactWorkbenchViewport(page);

  await page.route("**/api/v1/pulls/mean-weasel/issuectl**", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "GitHub checks are temporarily unavailable for this repository." }),
    });
  });
  await page.goto(`${baseUrl}/workbench/prs?repo=mean-weasel%2Fissuectl`);
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expect(page.locator('[role="alert"]').filter({ hasText: "GitHub checks are temporarily unavailable" })).toBeVisible();
  await expect(page.getByText("Select a pull request to open details in this focus pane.")).toBeVisible();
  await expectCompactWorkbenchViewport(page);

  await page.route("**/api/v1/settings", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Settings service is temporarily unavailable." }),
    });
  });
  await page.route("**/api/v1/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, version: "test-version", timestamp: "2026-05-16T16:00:00.000Z" }),
    });
  });
  await page.route("**/api/v1/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ login: null, error: "GitHub user unavailable" }),
    });
  });
  await page.goto(`${baseUrl}/workbench/settings?repo=mean-weasel%2Fissuectl`);
  await expect(page.getByRole("heading", { name: "Workbench settings" })).toBeVisible();
  await expect(page.locator('[role="alert"]').filter({ hasText: "Settings service is temporarily unavailable" })).toBeVisible();
  await expectCompactWorkbenchViewport(page);

  await page.route("**/api/v1/parse", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Parser service is temporarily unavailable." }),
    });
  });
  await page.goto(`${baseUrl}/workbench/quick-create?repo=mean-weasel%2Fissuectl`);
  await page.getByLabel("Parse text").fill("Turn this outage note into an issue");
  await page.getByRole("button", { name: "Parse", exact: true }).click();
  await expect(page.locator('[role="alert"]').filter({ hasText: "Parser service is temporarily unavailable" })).toBeVisible();
  await expectCompactWorkbenchViewport(page);

  await page.unroute("**/api/v1/settings");
  await page.unroute("**/api/v1/health");
  await page.unroute("**/api/v1/user");
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ alive: false, error: "Terminal session has ended" }),
    });
  });
  await page.goto(`${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&deployment=101`);
  await expect(page.getByLabel("Session #447")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expectCompactWorkbenchViewport(page);
});

test("keeps compact workbench context visible while switching focus", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");

  await page.goto(`${baseUrl}/workbench`);
  await expect(page.getByLabel("Workbench context")).toContainText("mean-weasel/issuectl");

  await page.goto(`${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&issue=512`);
  await expect(page.getByLabel("Workbench context")).toContainText("mean-weasel/issuectl #512");

  await page.goto(`${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&deployment=101`);
  await expect(page.getByLabel("Workbench context")).toContainText("mean-weasel/issuectl #447 terminal");

  await page.getByRole("button", { name: "mean-weasel/bugdrop" }).click();
  await expect(page).toHaveURL(/\/workbench\?repo=mean-weasel%2Fbugdrop$/);
  await expect(page.getByLabel("Workbench context")).toContainText("mean-weasel/bugdrop");
  await expectNoHorizontalPageScroll(page);
  await expectWorkbenchFitsViewport(page);
});

test("preserves compact repo-scoped mode while switching repos from deep links", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.route("**/api/v1/pulls/mean-weasel/**", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ pulls: [], fromCache: false, cachedAt: null }),
    });
  });

  await page.goto(`${baseUrl}/workbench/prs?repo=mean-weasel%2Fissuectl`);
  await expect(page.getByLabel("Workbench context")).toContainText("mean-weasel/issuectl PRs");
  await page.getByRole("button", { name: "mean-weasel/bugdrop" }).click();
  await expect(page).toHaveURL(/\/workbench\/prs\?repo=mean-weasel%2Fbugdrop$/);
  await expect(page.getByLabel("Workbench context")).toContainText("mean-weasel/bugdrop PRs");
  await expect(
    page
      .getByRole("navigation", { name: "Workbench navigation" })
      .getByRole("button", { name: "PRs", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await page.goto(`${baseUrl}/workbench/settings?repoSetup=1&repo=mean-weasel%2Fissuectl`);
  await expect(page.getByLabel("Workbench context")).toContainText("mean-weasel/issuectl settings");
  await page.getByRole("button", { name: "mean-weasel/web" }).click();
  await expect(page).toHaveURL(/\/workbench\/settings\?repoSetup=1&repo=mean-weasel%2Fweb$/);
  await expect(page.getByLabel("Workbench context")).toContainText("mean-weasel/web settings");
  await expectNoHorizontalPageScroll(page);
  await expectWorkbenchFitsViewport(page);
});

test("keeps compact issue mutations and session navigation coherent end to end", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const requests: Array<{ method: string; url: string; body: unknown }> = [];

  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.fallback();
      return;
    }
    expect(request.headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });

  await page.route("**/api/v1/issues/mean-weasel/issuectl/512/priority", async (route) => {
    const request = route.request();
    const body = await request.postDataJSON();
    requests.push({ method: request.method(), url: request.url(), body });
    expect(request.headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(request.method()).toBe("PUT");
    expect(body).toEqual({ priority: "normal" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, priority: "normal" }),
    });
  });

  await page.route("**/api/v1/issues/mean-weasel/issuectl/512/comments", async (route) => {
    const request = route.request();
    const body = await request.postDataJSON();
    requests.push({ method: request.method(), url: request.url(), body });
    expect(request.headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(request.method()).toBe("POST");
    expect(body).toEqual({ body: "Compact workflow comment" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, commentId: 9901 }),
    });
  });

  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    const request = route.request();
    requests.push({ method: request.method(), url: request.url(), body: request.postData() });
    expect(request.headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(request.method()).toBe("POST");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");

  await page.goto(`${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&issue=512`);
  await expect(page.getByLabel("Workbench context")).toContainText("mean-weasel/issuectl #512");
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Repo issues" })).toHaveCount(0);

  const issueActions = page.getByLabel("Issue actions");
  await expect(issueActions).toBeVisible();
  await issueActions.getByLabel("Priority").selectOption("normal");
  await expect(page.getByRole("status")).toContainText("Priority updated");
  await expect(page.getByLabel("Workbench focus")).toContainText("#512 Desktop instance manager workbench");
  await expect(page.getByLabel("Workbench focus")).toContainText("normal");

  await issueActions.getByLabel("Comment", { exact: true }).fill("Compact workflow comment");
  await issueActions.getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByRole("status")).toContainText("Comment added");
  await expect(issueActions.getByLabel("Comment", { exact: true })).toHaveValue("");

  await page.getByLabel("Issue detail metadata").getByRole("button", { name: "Jump to session" }).click();
  await expect(page).toHaveURL(/\/workbench\?repo=mean-weasel%2Fissuectl&deployment=101$/);
  await expect(page.getByLabel("Workbench context")).toContainText("mean-weasel/issuectl #447 terminal");
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Terminal for issue 447"]').getByText("terminal ready")).toBeVisible();

  await page.getByRole("button", { name: "Back to overview" }).click();
  await expect(page).toHaveURL(/\/workbench\?repo=mean-weasel%2Fissuectl$/);
  await expect(page.getByLabel("Compact active sessions")).toBeVisible();
  await expect(page.getByLabel("Compact repo issues")).toBeVisible();
  await expect(page.getByLabel("Issue #512")).toContainText("normal");
  await expectNoHorizontalPageScroll(page);
  await expectWorkbenchFitsViewport(page);

  expect(requests.some((item) => item.url.includes("/priority") && item.method === "PUT")).toBe(true);
  expect(requests.some((item) => item.url.includes("/comments") && item.method === "POST")).toBe(true);
  expect(requests.some((item) => item.url.includes("/deployments/101/ensure-ttyd") && item.method === "POST")).toBe(true);
});

test("returns compact issue and terminal focus to the workbench overview", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");

  await page.goto(`${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&issue=512`);
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await page.getByRole("navigation", { name: "Workbench navigation" }).getByRole("button", { name: "Workbench" }).click();
  await expect(page).toHaveURL(/\/workbench\?repo=mean-weasel%2Fissuectl$/);
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expect(page.getByLabel("Compact repo issues")).toBeVisible();
  await expect(page.getByLabel("Compact active sessions")).toBeVisible();
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toHaveCount(0);
  await expectNoHorizontalPageScroll(page);
  await expectWorkbenchFitsViewport(page);

  await page.goto(`${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&deployment=101`);
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Workbench navigation" }).getByRole("button", { name: "Workbench" }).click();
  await expect(page).toHaveURL(/\/workbench\?repo=mean-weasel%2Fissuectl$/);
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expect(page.getByLabel("Compact active sessions")).toBeVisible();
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toHaveCount(0);
  await expectNoHorizontalPageScroll(page);
  await expectWorkbenchFitsViewport(page);
});

test("captures workbench QA screenshots", async ({ browser }) => {
  if (!tmpDir) throw new Error("Expected workbench e2e tmpDir to be initialized");
  const artifactDir = join(tmpDir, "workbench-artifacts");
  mkdirSync(artifactDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript((token) => {
    window.localStorage.setItem("issuectl.apiToken", token);
  }, apiToken);
  const page = await context.newPage();

  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });
  await page.route("**/api/v1/worktrees/status?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ exists: false, dirty: false, path: null }),
    });
  });
  await page.route("**/api/v1/repos/github?refresh=true", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        repos: Array.from({ length: 24 }, (_, index) => ({
          owner: "mean-weasel",
          name: `candidate-${String(index + 1).padStart(2, "0")}`,
          private: index % 3 === 0,
        })),
        syncedAt: 1_779_000_000,
        isStale: false,
      }),
    });
  });

  try {
    await page.goto(`${baseUrl}/workbench`);
    await expectNoWorkbenchSplash(page);
    await page.getByLabel("Session #447").getByRole("button").first().click();
    await expect(page.locator('iframe[title="Terminal for issue 447"]')).toBeVisible();
    await expect(page.frameLocator('iframe[title="Terminal for issue 447"]').getByText("terminal ready")).toBeVisible();
    await page.screenshot({ path: join(artifactDir, "workbench-terminal-1440.png"), fullPage: true });

    await page.getByRole("button", { name: "Workbench" }).click();
    await page.getByLabel("Issue #512").click();
    await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
    await expect(page.getByLabel("Issue labels")).toContainText("high");
    await expectNoWorkbenchSplash(page);
    await page.screenshot({ path: join(artifactDir, "workbench-issue-1440.png"), fullPage: true });

    await page.goto(`${baseUrl}/workbench/settings?repoSetup=1`);
    await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
    await expect(page.getByLabel("Repository picker")).toBeVisible();
    await expectNoWorkbenchSplash(page);
    await page.screenshot({ path: join(artifactDir, "workbench-settings-1440.png"), fullPage: true });

    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto(`${baseUrl}/workbench/board`);
    await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();
    await expect(page.getByLabel("Cross-repo board")).toBeVisible();
    await expect(page.getByLabel("Board issue mean-weasel/issuectl #512")).toBeVisible();
    await expectNoWorkbenchSplash(page);
    await page.screenshot({ path: join(artifactDir, "workbench-board-1440.png"), fullPage: true });

    await page.setViewportSize({ width: 1100, height: 850 });
    await page.goto(`${baseUrl}/workbench`);
    await page.getByLabel("Session #447").getByRole("button").first().click();
    await expect(page.locator('iframe[title="Terminal for issue 447"]')).toBeVisible();
    await expect(page.frameLocator('iframe[title="Terminal for issue 447"]').getByText("terminal ready")).toBeVisible();
    await expectNoWorkbenchSplash(page);
    await page.screenshot({ path: join(artifactDir, "workbench-terminal-1100.png"), fullPage: true });
  } finally {
    await context.close();
  }
});

test("collapses workbench drawers and flattens active sessions", async ({ page }) => {
  await gotoWorkbenchWithRetry(page);

  const workbench = page.getByRole("main", { name: "Workbench" });
  await expect(page.getByLabel("Issue-backed sessions").getByRole("article")).toHaveCount(3);
  await expect(page.getByLabel("Named shells")).toContainText("Not available yet.");
  await expect(page.getByRole("button", { name: "Toggle sessions section" })).toHaveCount(0);

  await page.getByRole("complementary", { name: "Active sessions" }).getByRole("button", { name: "Collapse running sessions" }).click();
  await expect(workbench).toHaveAttribute("data-instances-pane", "collapsed");
  await expect(page.getByLabel("Active sessions")).toHaveCount(0);
  await expect(page.getByLabel("Repo issues")).toBeVisible();

  await page.getByRole("button", { name: "Expand running sessions" }).click();
  await expect(workbench).toHaveAttribute("data-instances-pane", "visible");
  await expect(page.getByLabel("Active sessions")).toBeVisible();

  await page.getByRole("complementary", { name: "Repo issues" }).getByRole("button", { name: "Collapse issues drawer" }).click();
  await expect(workbench).toHaveAttribute("data-issues-pane", "collapsed");
  await expect(page.getByLabel("Repo issues")).toHaveCount(0);
  await expect(page.getByLabel("Active sessions")).toBeVisible();

  await page.getByRole("button", { name: "Expand issues drawer" }).click();
  await expect(workbench).toHaveAttribute("data-issues-pane", "visible");
  await expect(page.getByLabel("Repo issues")).toBeVisible();
});

test("keeps drawer restore controls out of issue and terminal headers", async ({ page }) => {
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1100, height: 850 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&issue=512`);
    await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Expand running sessions" })).toBeVisible();
    await expectNoBoxOverlap(
      page.getByRole("button", { name: "Expand running sessions" }),
      page.getByRole("heading", { name: "#512 Desktop instance manager workbench" }),
    );

    await page.goto(`${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&deployment=101`);
    await expect(page.getByRole("heading", { name: /#447/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Expand issues drawer" })).toBeVisible();
    await expectNoBoxOverlap(
      page.getByRole("button", { name: "Expand issues drawer" }),
      page.getByRole("heading", { name: /#447/ }),
    );
  }
});

test("refreshes server-loaded workbench content", async ({ page }) => {
  await gotoWorkbenchWithRetry(page);
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
});

test("supports top nav modes and collapses side panes for global modes", async ({ page }) => {
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");

  await page.goto(`${baseUrl}/workbench`);

  await clickNavAndExpect(page, "Issues", "/workbench/issues", true);
  await clickNavAndExpect(page, "Board", "/workbench/board", true);
  await clickNavAndExpect(page, "Settings", "/workbench/settings", true);
  await clickNavAndExpect(page, "PRs", "/workbench/prs", false);
  await clickNavAndExpect(page, "Quick Create", "/workbench/quick-create", false);
  await page.getByLabel("Session #447").getByRole("button").first().click();
  await expect(page).toHaveURL(new RegExp("/workbench\\?repo=mean-weasel%2Fissuectl&deployment=101$"));
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toHaveAttribute(
    "src",
    /\/api\/terminal\/7701\/\?terminalToken=terminal-token-101$/,
  );
  await clickNavAndExpect(page, "Workbench", "/workbench", false);
});

test("preserves selected repo across global mode reloads", async ({ page }) => {
  await gotoWorkbenchWithRetry(page);
  const bugdropRepo = page.getByRole("button", { name: "mean-weasel/bugdrop" });
  await expect(bugdropRepo).toBeVisible();
  await expect(async () => {
    await bugdropRepo.click();
    await expect(page).toHaveURL(/repo=mean-weasel%2Fbugdrop/, { timeout: 1_000 });
  }).toPass();
  const nav = page.getByRole("navigation", { name: "Workbench navigation" });

  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/workbench\/settings\?repo=mean-weasel%2Fbugdrop$/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "mean-weasel/bugdrop" })).toHaveAttribute("data-selected", "true");

  await nav.getByRole("button", { name: "PRs", exact: true }).click();
  await expect(page).toHaveURL(/\/workbench\/prs\?repo=mean-weasel%2Fbugdrop$/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "mean-weasel/bugdrop" })).toHaveAttribute("data-selected", "true");
});

test("restores URL focus for repo issue and deployment across reload and back forward", async ({ page }) => {
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");

  const issueUrl = `${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&issue=512`;
  const deploymentUrl = `${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&deployment=101`;

  await page.goto(issueUrl);
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await expect(page.getByRole("main", { name: "Workbench" })).toHaveAttribute("data-instances-pane", "collapsed");
  await expect(page.getByLabel("Repo issues")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();

  await page.goto(deploymentUrl);
  await expect(page.getByRole("heading", { name: /#447/ })).toBeVisible();
  await expect(page.getByRole("main", { name: "Workbench" })).toHaveAttribute("data-issues-pane", "collapsed");
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toHaveAttribute(
    "src",
    /\/api\/terminal\/7701\/\?terminalToken=terminal-token-101$/,
  );

  await page.goBack();
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await page.goForward();
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toBeVisible();

  await page.goto(`${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&issue=9999`);
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
});

test("quick create parses, creates accepted issues, and uses draft endpoints", async ({ page }) => {
  const draftId = "11111111-1111-4111-8111-111111111111";
  const seen = {
    parse: false,
    create: false,
    draftCreate: false,
    draftUpdate: false,
    draftAssign: false,
  };

  await page.route("**/api/v1/parse", async (route) => {
    seen.parse = true;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({
      input: "Fix login timeout and add workbench keyboard shortcuts",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        parsed: {
          suggestedOrder: ["parsed-1", "parsed-2"],
          issues: [
            {
              id: "parsed-1",
              originalText: "Fix login timeout",
              title: "Fix login timeout",
              body: "Sessions should not expire too early.",
              type: "bug",
              repoOwner: null,
              repoName: null,
              repoConfidence: 0.42,
              suggestedLabels: ["bug"],
              clarity: "unknown_repo",
            },
            {
              id: "parsed-2",
              originalText: "Add workbench keyboard shortcuts",
              title: "Add workbench keyboard shortcuts",
              body: "Add shortcuts for common workbench actions.",
              type: "feature",
              repoOwner: "mean-weasel",
              repoName: "issuectl",
              repoConfidence: 0.92,
              suggestedLabels: [],
              clarity: "clear",
            },
          ],
        },
      }),
    });
  });
  await page.route("**/api/v1/parse/create", async (route) => {
    seen.create = true;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({
      issues: [
        {
          id: "parsed-1",
          title: "Fix login timeout",
          body: "Sessions should not expire too early.",
          owner: "mean-weasel",
          repo: "issuectl",
          labels: ["bug"],
          accepted: true,
        },
        {
          id: "parsed-2",
          title: "Add workbench keyboard shortcuts",
          body: "Add shortcuts for common workbench actions.",
          owner: "mean-weasel",
          repo: "issuectl",
          labels: [],
          accepted: false,
        },
      ],
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        created: 1,
        drafted: 0,
        failed: 0,
        results: [{ id: "parsed-1", success: true, issueNumber: 901, owner: "mean-weasel", repo: "issuectl" }],
      }),
    });
  });
  await page.route("**/api/v1/drafts/*/assign", async (route) => {
    seen.draftAssign = true;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({ repoId: 1, labels: ["bug", "workbench"] });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, issueNumber: 902, issueUrl: "https://github.com/mean-weasel/issuectl/902" }),
    });
  });
  await page.route("**/api/v1/drafts/*", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }
    seen.draftUpdate = true;
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({
      title: "Clarify flaky login timeout",
      body: "Saved from the workbench draft fallback.",
      priority: "high",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        draft: {
          id: draftId,
          title: "Clarify flaky login timeout",
          body: "Saved from the workbench draft fallback.",
          priority: "high",
        },
      }),
    });
  });
  await page.route("**/api/v1/drafts", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    seen.draftCreate = true;
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({
      title: "Clarify flaky login timeout",
      body: "Saved from the workbench draft fallback.",
      priority: "high",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, id: draftId }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");

  await page.goto(`${baseUrl}/workbench`);
  await page
    .getByRole("navigation", { name: "Workbench navigation" })
    .getByRole("button", { name: "Quick Create", exact: true })
    .click();

  await expect(page).toHaveURL(new RegExp("/workbench/quick-create\\?repo=mean-weasel%2Fissuectl$"));
  await expect(page.getByRole("heading", { name: "Quick Create" })).toBeVisible();
  await expect(page.getByLabel("Active sessions")).toBeVisible();
  await expect(page.getByLabel("Repo issues")).toBeVisible();
  await page.getByLabel("Parse text").fill("Fix login timeout and add workbench keyboard shortcuts");
  await page.getByRole("button", { name: "Parse", exact: true }).click();
  await expect(page.getByLabel("Candidate issue 1")).toContainText("accepted");
  await expect(page.getByLabel("Candidate issue 2")).toContainText("accepted");
  await expect(page.getByLabel("Candidate 1 repository")).toHaveValue("mean-weasel/issuectl");
  await page.getByLabel("Candidate issue 2").getByRole("button", { name: "Reject" }).click();
  await expect(page.getByLabel("Candidate issue 2")).toHaveAttribute("data-state", "rejected");
  await page.getByRole("button", { name: "Create accepted issues" }).click();
  await expect(page.getByLabel("Quick create results")).toContainText("1 created, 0 drafted, 0 failed");
  await expect(page.getByLabel("Quick create results")).toContainText("#901");

  await page.getByLabel("Draft title").fill("Clarify flaky login timeout");
  await page.getByLabel("Draft body").fill("Saved from the workbench draft fallback.");
  await page.getByLabel("Draft priority").selectOption("high");
  await page.getByLabel("Draft labels").fill("bug, workbench");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.getByRole("button", { name: "Update draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft updated");
  await page.getByRole("button", { name: "Assign draft" }).click();
  await expect(page.getByRole("status")).toContainText("mean-weasel/issuectl#902");

  expect(seen).toEqual({
    parse: true,
    create: true,
    draftCreate: true,
    draftUpdate: true,
    draftAssign: true,
  });
});

test("pull requests mode loads repo PRs and calls detail review merge comment endpoints", async ({ page }) => {
  const seen = {
    list: false,
    detail: false,
    review: false,
    merge: false,
    comment: false,
    empty: false,
  };

  await page.route("**/api/v1/pulls/mean-weasel/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.headers().authorization).toBe(`Bearer ${apiToken}`);

    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl" && request.method() === "GET") {
      seen.list = true;
      expect(url.searchParams.get("checks")).toBe("true");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pulls: [
            pullFixture(501, {
              title: "Add workbench PR review surface",
              body: "Fixes #512",
              checksStatus: "success",
            }),
            pullFixture(502, {
              title: "Polish session preview copy",
              body: null,
              checksStatus: "pending",
            }),
          ],
          fromCache: false,
          cachedAt: null,
        }),
      });
      return;
    }

    if (url.pathname === "/api/v1/pulls/mean-weasel/web" && request.method() === "GET") {
      seen.empty = true;
      expect(url.searchParams.get("checks")).toBe("true");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ pulls: [], fromCache: false, cachedAt: null }),
      });
      return;
    }

    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl/501" && request.method() === "GET") {
      seen.detail = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(pullDetailFixture()),
      });
      return;
    }

    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl/501/review") {
      seen.review = true;
      expect(request.method()).toBe("POST");
      expect(await request.postDataJSON()).toEqual({ event: "APPROVE", body: "Looks good" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, reviewId: 7001 }),
      });
      return;
    }

    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl/501/merge") {
      seen.merge = true;
      expect(request.method()).toBe("POST");
      expect(await request.postDataJSON()).toEqual({ mergeMethod: "squash" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, sha: "abc123" }),
      });
      return;
    }

    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl/501/comments") {
      seen.comment = true;
      expect(request.method()).toBe("POST");
      expect(await request.postDataJSON()).toEqual({ body: "Workbench PR comment" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, commentId: 8001 }),
      });
      return;
    }

    await route.fallback();
  });

  await page.goto(`${baseUrl}/workbench`);
  await page
    .getByRole("navigation", { name: "Workbench navigation" })
    .getByRole("button", { name: "PRs", exact: true })
    .click();

  await expect(page).toHaveURL(new RegExp("/workbench/prs\\?repo=mean-weasel%2Fissuectl$"));
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expect(page.getByLabel("Pull requests for mean-weasel/issuectl")).toContainText("Checks success");
  await expect(page.getByLabel("Pull request #501")).toContainText("Linked issue #512");
  await expect(page.getByLabel("Pull request #501")).toContainText("Needs review");
  await expect(page.getByLabel("Pull request #502")).toContainText("Checks pending");

  await page.getByLabel("Pull request #501").getByRole("button", { name: "Open PR" }).click();
  await expect(page.getByRole("heading", { name: "#501 Add workbench PR review surface" })).toBeVisible();
  await expect(page.getByLabel("Pull request detail")).toContainText("Linked issue #512");
  await expect(page.getByLabel("Pull request detail")).toContainText("Checks: success");

  const pullDetail = page.getByLabel("Pull request detail");
  await pullDetail.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Review approved for #501");
  await pullDetail.getByRole("button", { name: "Merge squash", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("merged with squash");
  await expect(page.getByLabel("Pull request #501")).toContainText("merged");
  await pullDetail.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Comment added to #501");

  await page.getByRole("button", { name: "mean-weasel/web" }).click();
  await page
    .getByRole("navigation", { name: "Workbench navigation" })
    .getByRole("button", { name: "PRs", exact: true })
    .click();
  await expect(page.getByText("No open pull requests in mean-weasel/web.")).toBeVisible();

  expect(seen).toEqual({
    list: true,
    detail: true,
    review: true,
    merge: true,
    comment: true,
    empty: true,
  });
});

test("shows global issues by repo and opens the selected repo issue", async ({ page }) => {
  await page.goto(`${baseUrl}/workbench`);

  await clickNavAndExpect(page, "Issues", "/workbench/issues", true);
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "mean-weasel/bugdrop" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "mean-weasel/api" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "mean-weasel/web" })).toBeVisible();
  await expect(page.getByLabel("mean-weasel/issuectl issue #447")).toHaveAttribute("data-status", "running");
  await expect(page.getByLabel("mean-weasel/issuectl issue #447")).toContainText("running");
  await expect(page.getByLabel("mean-weasel/issuectl issue #447").locator("[data-card-chip]")).toHaveCount(2);

  await page.getByLabel("mean-weasel/bugdrop issue #440").getByRole("button", { name: "Open issue" }).click();

  await expect(page).toHaveURL(new RegExp("/workbench\\?repo=mean-weasel%2Fbugdrop&issue=440$"));
  await expect(page.getByLabel("Active sessions")).toBeVisible();
  await expect(page.getByLabel("Repo issues")).toBeVisible();
  await expect(page.getByRole("button", { name: "mean-weasel/bugdrop" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "#440 bugdrop issue 1" })).toBeVisible();
});

test("shows cross-repo board columns and reversible running filter", async ({ page }) => {
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });
  await page.route("**/api/v1/worktrees/status?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ exists: false, dirty: false, path: null }),
    });
  });

  await page.goto(`${baseUrl}/workbench`);
  await clickNavAndExpect(page, "Board", "/workbench/board", true);

  await expect(page.getByLabel("Repositories")).toBeVisible();
  const board = page.getByLabel("Cross-repo board");
  await expect(board).toBeVisible();
  await expect(board.getByRole("region")).toHaveCount(4);
  await expect(page.getByLabel("Board column mean-weasel/issuectl")).toBeVisible();
  await expect(page.getByLabel("Board column mean-weasel/bugdrop")).toBeVisible();
  await expect(page.getByLabel("Board column mean-weasel/api")).toBeVisible();
  await expect(page.getByLabel("Board column mean-weasel/web")).toBeVisible();
  await expect(page.locator('article[aria-label^="Board issue"]')).toHaveCount(7);

  await page.getByRole("button", { name: "Show running only" }).click();
  await expect(page.locator('article[aria-label^="Board issue"]')).toHaveCount(4);
  await expect(page.getByText("No matching issues.")).toHaveCount(2);
  await expect(board.getByRole("region")).toHaveCount(4);

  await page.getByRole("button", { name: "Show running only" }).click();
  await expect(page.locator('article[aria-label^="Board issue"]')).toHaveCount(7);

  await page.getByRole("button", { name: "Sort by priority" }).click();
  const issuectlCards = page.getByLabel("Board column mean-weasel/issuectl")
    .locator('article[aria-label^="Board issue"]');
  await expect(issuectlCards.first()).toHaveAttribute("aria-label", "Board issue mean-weasel/issuectl #512");
  await expect(issuectlCards.first().locator("[data-card-chip]")).toHaveCount(2);

  await page.getByLabel("Board issue mean-weasel/issuectl #512")
    .getByRole("button", { name: "Open issue" })
    .click();
  await expect(page).toHaveURL(new RegExp("/workbench\\?repo=mean-weasel%2Fissuectl&issue=512$"));
  await expect(page.getByLabel("Active sessions")).toBeVisible();
  await expect(page.getByLabel("Repo issues")).toBeVisible();
  await expect(page.getByRole("button", { name: "mean-weasel/issuectl" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
});

test("deep links workbench subpaths without a 404", async ({ page }) => {
  await page.goto(`${baseUrl}/workbench/settings`);
  await expect(page.getByRole("link", { name: "issuectl workbench" })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Workbench navigation" })
      .getByRole("button", { name: "Settings", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Active sessions")).toHaveCount(0);
  await expect(page.getByLabel("Repo issues")).toHaveCount(0);
});

test("renders settings mode with health and saves settings through APIs", async ({ page }) => {
  await page.route("**/api/v1/settings", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          settings: {
            branch_pattern: "issue-{number}-{slug}",
            cache_ttl: "99999",
            worktree_dir: "/tmp/worktrees",
            launch_agent: "codex",
            claude_extra_args: "--verbose",
            codex_extra_args: "",
            idle_grace_period: "300",
            idle_threshold: "300",
          },
        }),
      });
      return;
    }
    expect(route.request().method()).toBe("PATCH");
    expect(await route.request().postDataJSON()).toEqual({
      branch_pattern: "issue-{number}-{slug}",
      cache_ttl: "120",
      worktree_dir: "/tmp/worktrees",
      launch_agent: "codex",
      claude_extra_args: "--verbose",
      codex_extra_args: "",
      idle_grace_period: "300",
      idle_threshold: "300",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/v1/health", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, version: "test-version", timestamp: "2026-05-16T16:00:00.000Z" }),
    });
  });
  await page.route("**/api/v1/user", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ login: "jeremy" }),
    });
  });

  await page.goto(`${baseUrl}/workbench/settings`);

  const workbench = page.getByRole("main", { name: "Workbench" });
  await expect(workbench).toHaveAttribute("data-side-panes", "collapsed");
  await expect(page.getByLabel("Active sessions")).toHaveCount(0);
  await expect(page.getByLabel("Repo issues")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Workbench settings" })).toBeVisible();
  await expect(page.getByLabel("Health summary")).toContainText("ok");
  await expect(page.getByLabel("Health summary")).toContainText("jeremy");
  await expect(page.getByLabel("Health summary")).toContainText("4");
  await page.getByRole("button", { name: "Toggle settings health" }).click();
  await expect(page.getByRole("button", { name: "Toggle settings health" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Health summary")).toBeHidden();
  await page.getByRole("button", { name: "Toggle settings health" }).click();
  await page.getByLabel("Cache TTL").fill("120");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await expect(page).toHaveURL(new RegExp("/workbench/settings$"));
  await expect(workbench).toHaveAttribute("data-side-panes", "collapsed");
});

test("opens repo setup and calls add patch delete repo endpoints", async ({ page }) => {
  await page.route("**/api/v1/repos/github?refresh=true", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        repos: [
          { owner: "mean-weasel", name: "web", private: false },
          { owner: "mean-weasel", name: "new-tool", private: false },
          { owner: "mean-weasel", name: "issuectl-test-repo-2", private: false },
        ],
        syncedAt: 1_779_000_000,
        isStale: false,
      }),
    });
  });
  await page.route("**/api/v1/repos/mean-weasel/web", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    if (route.request().method() === "PATCH") {
      expect(await route.request().postDataJSON()).toEqual({
        localPath: "/workspace/web",
        branchPattern: "task-{number}",
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          repo: { ...repo(4, "web", 0), localPath: "/workspace/web", branchPattern: "task-{number}" },
        }),
      });
      return;
    }
    expect(route.request().method()).toBe("DELETE");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/v1/repos", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({ owner: "mean-weasel", name: "web" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, repo: { ...repo(4, "web", 0), localPath: null } }),
    });
  });
  page.on("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Remove mean-weasel/web?");
    await dialog.accept();
  });

  await page.goto(`${baseUrl}/workbench`);
  await page.getByRole("button", { name: "mean-weasel/web" }).click();
  await page.getByRole("button", { name: "Open repo setup" }).click();
  await expect(page).toHaveURL(new RegExp("/workbench/settings\\?repoSetup=1&repo=mean-weasel%2Fweb$"));
  await expect(page.getByRole("heading", { name: "mean-weasel/web" })).toBeVisible();
  await expect(page.getByLabel("Active sessions")).toHaveCount(0);
  await expect(page.getByLabel("Repo issues")).toHaveCount(0);

  await page.getByLabel("Local path").fill("/workspace/web");
  await page.getByLabel("Branch pattern").fill("task-{number}");
  await page.getByRole("button", { name: "Save repo setup" }).click();
  await expect(page.getByText("Repo setup saved")).toBeVisible();

  await page.getByRole("button", { name: "Refresh GitHub repos" }).click();
  await page.getByRole("button", { name: "Remove repository" }).click();
  await expect(page.getByText("mean-weasel/web removed")).toBeVisible();
  await expect(page.getByRole("button", { name: "mean-weasel/web" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Workbench navigation" })
    .getByRole("button", { name: "Workbench" })
    .click();
  await expect(page).toHaveURL(new RegExp("/workbench\\?repo=mean-weasel%2Fissuectl$"));
  await expect(page.getByRole("button", { name: "mean-weasel/issuectl" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();

  await page.getByLabel("Repositories").getByRole("button", { name: "Add repository" }).click();
  await expect(page).toHaveURL(new RegExp("/workbench/settings\\?repoSetup=1&repo=mean-weasel%2Fissuectl$"));
  await expect(page.getByLabel("Repository picker")).toContainText("mean-weasel/issuectl-test-repo-2");

  await page.getByLabel("Repository picker").selectOption("mean-weasel/web");
  await page.getByRole("button", { name: "Add selected repo" }).click();
  await expect(page.getByText("mean-weasel/web added")).toBeVisible();
  await expect(page.getByRole("button", { name: "mean-weasel/web" })).toBeVisible();
});

test("selects repos, updates overview focus, and preserves selection across modes", async ({ page }) => {
  await page.goto(`${baseUrl}/workbench`);
  await page.getByRole("button", { name: "mean-weasel/bugdrop" }).click();
  await expect(page.getByRole("heading", { name: "mean-weasel/bugdrop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "mean-weasel/bugdrop" })).toHaveAttribute("aria-pressed", "true");

  await clickNavAndExpect(page, "Settings", "/workbench/settings", true);
  await clickNavAndExpect(page, "Board", "/workbench/board", true);
  await clickNavAndExpect(page, "Workbench", "/workbench", false);
  await expect(page.getByRole("heading", { name: "mean-weasel/bugdrop" })).toBeVisible();

  await page.getByRole("button", { name: "mean-weasel/api" }).click();
  await expect(page.getByRole("heading", { name: "mean-weasel/api" })).toBeVisible();

  await page.getByRole("button", { name: "mean-weasel/web" }).click();
  await expect(page.getByRole("heading", { name: "mean-weasel/web" })).toBeVisible();
  await expect(page.getByText("Set up local path")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open repo setup" })).toBeVisible();
});

test("removes a stale session when reconnect reports the deployment already ended", async ({ page }) => {
  let ensureCount = 0;
  await page.route("**/api/v1/deployments/103/ensure-ttyd", async (route) => {
    ensureCount += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ alive: false, error: "Deployment not found or already ended" }),
    });
  });

  await gotoWorkbenchWithRetry(page);
  await expect(page.getByLabel("Session #486")).toBeVisible();
  await page.getByLabel("Session #486").getByRole("button", { name: "Reconnect" }).click();

  await expect.poll(() => Promise.resolve(ensureCount)).toBe(1);
  await expect(page.getByLabel("Session #486")).toHaveCount(0);
  await page.getByRole("group", { name: "Issue filters" }).getByRole("button", { name: /Running/ }).click();
  await expect(page.getByLabel("Issue #486")).toHaveCount(0);
});

test("removes a stale selected session when terminal focus reports the session ended", async ({ page }) => {
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ alive: false, error: "Terminal session has ended" }),
    });
  });

  await page.goto(`${baseUrl}/workbench`);
  await expect(page.getByLabel("Session #447")).toBeVisible();
  await page.getByLabel("Session #447").getByRole("button").first().click();

  await expect(page.getByLabel("Session #447")).toHaveCount(0);
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
});

test("ends a session through the deployment endpoint and removes its row", async ({ page }) => {
  await page.route("**/api/v1/deployments/102/end", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({
      owner: "mean-weasel",
      repo: "issuectl",
      issueNumber: 498,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  await page.goto(`${baseUrl}/workbench`);
  const session = page.getByLabel("Session #498");
  await session.getByText("End", { exact: true }).click();
  await expect(session.getByText("End session?")).toBeVisible();
  await session.getByRole("button", { name: "End session" }).click();

  await expect(page.getByLabel("Session #498")).toHaveCount(0);
  await expect(page.getByLabel("Issue-backed sessions").getByRole("article")).toHaveCount(2);
  await page.getByRole("group", { name: "Issue filters" }).getByRole("button", { name: "Running 2" }).click();
  await expect(page.getByLabel("Issue #498")).toHaveCount(0);
});

test("canceling end session is local-only and does not navigate or call the end endpoint", async ({ page }) => {
  let endCount = 0;
  const navigations: string[] = [];
  await page.route("**/api/v1/deployments/102/end", async (route) => {
    endCount += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Cancel should not call end" }),
    });
  });

  await page.goto(`${baseUrl}/workbench`);
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });

  const session = page.getByLabel("Session #498");
  await session.getByText("End", { exact: true }).click();
  await expect(session.getByText("End session?")).toBeVisible();
  await session.getByRole("button", { name: "Cancel" }).click();

  await expect(session.getByText("End session?")).toBeHidden();
  await expect(page.getByLabel("Session #498")).toBeVisible();
  expect(endCount).toBe(0);
  expect(navigations).toEqual([]);
});

test("exposes issue queue actions with semantic controls", async ({ page }) => {
  await gotoWorkbenchWithRetry(page);

  const filters = page.getByRole("group", { name: "Issue filters" });
  await expect(filters.getByRole("button", { name: "Open work 4" })).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: "Running 3" }).click();
  await expect(filters.getByRole("button", { name: "Running 3" })).toHaveAttribute("aria-pressed", "true");

  await filters.getByRole("button", { name: "Open work 4" }).click();
  const issueAction = page
    .getByLabel("Issue #512")
    .getByRole("button", { name: "Open #512: Desktop instance manager workbench" });
  await expect(page.getByRole("button", { name: "Open issue", exact: true })).toHaveCount(0);
  await issueAction.focus();
  await expect(issueAction).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
});

test("filters repo issues and links details and running sessions", async ({ page }) => {
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");

  await page.goto(`${baseUrl}/workbench`);

  await expect(page.getByText("open work 4", { exact: true })).toBeVisible();
  const issueRows = page.getByLabel("Repo issue queue").getByRole("article");
  await expect(issueRows).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    const box = await issueRows.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(118);
  }

  await page.getByRole("group", { name: "Issue filters" }).getByRole("button", { name: "Running 3" }).click();
  await expect(page.getByLabel("Repo issue queue").getByRole("article")).toHaveCount(3);
  await expect(page.getByLabel("Issue #512")).toHaveCount(0);

  await page.getByRole("group", { name: "Issue filters" }).getByRole("button", { name: "Closed 0" }).click();
  await expect(page.getByLabel("Repo issue queue").getByRole("article")).toHaveCount(0);

  await page.getByRole("group", { name: "Issue filters" }).getByRole("button", { name: "Open work 4" }).click();
  await expect(page.getByLabel("Issue #512").getByRole("button", { name: "Prepare launch" })).toBeVisible();
  await expect(page.getByLabel("Issue #512").getByRole("button", { name: "Launch", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Issue #512").locator("[data-card-chip]")).toHaveCount(2);
  await page.getByLabel("Issue #512").click();
  await expect(page.getByLabel("Issue #512").getByRole("button", { name: "Details" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await expect(page.getByLabel("Workbench focus").getByText("mean-weasel/issuectl")).toBeVisible();
  await expect(page.getByRole("main", { name: "Workbench" })).toHaveAttribute("data-instances-pane", "collapsed");
  await expect(page.getByLabel("Active sessions")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sessions hidden · Show sessions" })).toBeVisible();
  await page.getByRole("button", { name: "Sessions hidden · Show sessions" }).click();
  await expect(page.getByLabel("Active sessions")).toBeVisible();
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await expect(page.getByLabel("Repo issues")).toBeVisible();

  await page.getByLabel("Issue #447").getByRole("button", { name: "Jump to session" }).click();
  await expect(page.getByRole("heading", { name: /#447/ })).toBeVisible();
  await expect(page.getByLabel("Workbench focus").getByText("mean-weasel/issuectl")).toBeVisible();
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toHaveAttribute(
    "src",
    /\/api\/terminal\/7701\/\?terminalToken=terminal-token-101$/,
  );
});

test("loads issue detail and calls issue mutation endpoints", async ({ page }) => {
  const detailPath = "**/api/v1/issues/mean-weasel/issuectl/512";
  await page.route(detailPath, async (route) => {
    const method = route.request().method();
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    if (method === "GET") {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(issueDetailFixture()),
      });
      return;
    }
    if (method === "PATCH") {
      expect(await route.request().postDataJSON()).toEqual({
        title: "Desktop instance manager workbench renamed",
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      return;
    }
    await route.fallback();
  });
  await expectJsonRequest(page, "**/api/v1/issues/mean-weasel/issuectl/512/priority", "PUT", { priority: "normal" });
  await expectJsonRequest(page, "**/api/v1/issues/mean-weasel/issuectl/512/comments", "POST", { body: "Workbench comment" });
  await expectJsonRequest(page, "**/api/v1/issues/mean-weasel/issuectl/512/state", "POST", {
    state: "closed",
    comment: "Closing from workbench",
  });
  await expectJsonRequest(page, "**/api/v1/issues/mean-weasel/issuectl/512/labels", "POST", {
    label: "workbench",
    action: "add",
  });
  await expectJsonRequest(page, "**/api/v1/issues/mean-weasel/issuectl/512/assignees", "PUT", {
    assignees: ["jeremy"],
  });
  await expectJsonRequest(page, "**/api/v1/issues/mean-weasel/issuectl/512/reassign", "POST", {
    targetOwner: "mean-weasel",
    targetRepo: "bugdrop",
  }, { success: true, newOwner: "mean-weasel", newRepo: "bugdrop", newIssueNumber: 612 });
  await page.route("**/api/v1/issues/mean-weasel/bugdrop/612", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const detail = issueDetailFixture();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...detail,
        issue: {
          ...detail.issue,
          number: 612,
          title: "Reassigned issue #612",
          htmlUrl: "https://github.com/mean-weasel/bugdrop/issues/612",
        },
        comments: [],
        deployments: [],
        linkedPRs: [],
        referencedFiles: [],
      }),
    });
  });
  await page.route("**/api/v1/images/upload", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
    const body = route.request().postData() ?? "";
    expect(body).toContain("dogfood.png");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: "https://example.com/workbench.png" }),
    });
  });

  await gotoWorkbenchWithRetry(page);
  await page.getByLabel("Issue #512").getByRole("button", { name: "Prepare launch" }).click();
  await expect(page.getByText("Loading issue #512")).toBeVisible();
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await expect(page.locator("strong", { hasText: "bold" })).toBeVisible();
  await expect(page.getByRole("link", { name: "link" })).toHaveAttribute("href", "https://example.com");
  await expect(page.getByText("item")).toBeVisible();
  await expect(page.getByText("#501 terminal-reconnect-fix")).toBeVisible();
  await expect(page.getByText("Active session", { exact: true })).toBeVisible();
  await expect(page.getByText("Deployment 101 · issue-447")).toBeVisible();
  await expect(page.getByLabel("Issue detail metadata").getByRole("button", { name: "Jump to session" })).toBeVisible();
  await expect(page.getByText("Historical deployment")).toBeVisible();
  await expect(page.getByText("Deployment 99 · issue-512-ended")).toBeVisible();
  await expect(page.getByText(/ended /)).toBeVisible();
  await expect(page.getByText("Cached")).toBeVisible();
  await expect(page.getByLabel("Issue labels")).toContainText("high");
  await page.getByRole("button", { name: "Toggle comments section" }).click();
  await expect(page.getByRole("button", { name: "Toggle comments section" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Issue comments")).toBeHidden();
  await page.getByRole("button", { name: "Toggle comments section" }).click();

  const preamble = page.getByPlaceholder("Additional instructions for Codex...");
  await preamble.fill("Keep this launch context");
  const issueActions = page.getByLabel("Issue actions");
  await expect(issueActions.getByLabel("Metadata actions")).toBeVisible();
  await expect(issueActions.getByLabel("Comment actions")).toBeVisible();
  await expect(issueActions.getByText("State and labels")).toBeVisible();
  await expect(issueActions.getByText("Reassign and attachments")).toBeVisible();
  await expect(issueActions.getByLabel("Issue title")).toHaveValue("Desktop instance manager workbench");
  await expect(issueActions.getByRole("button", { name: "Save title" })).toBeDisabled();
  await issueActions.getByLabel("Issue title").fill("Desktop instance manager workbench renamed");
  await expect(issueActions.getByRole("button", { name: "Save title" })).toBeEnabled();
  await issueActions.getByRole("button", { name: "Save title" }).click();
  await expect(page.getByRole("status")).toContainText("Title saved");
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench renamed" })).toBeVisible();
  await issueActions.getByLabel("Priority").selectOption("normal");
  await expect(page.getByRole("status")).toContainText("Priority updated");
  await expect(page.getByLabel("Issue #512")).toContainText("normal");
  await expect(preamble).toHaveValue("Keep this launch context");
  await expect(issueActions.getByLabel("Comment", { exact: true })).toHaveValue("");
  await expect(issueActions.getByRole("button", { name: "Add comment" })).toBeDisabled();
  await issueActions.getByLabel("Comment", { exact: true }).fill("Workbench comment");
  await issueActions.getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByRole("status")).toContainText("Comment added");
  await expect(issueActions.getByLabel("Comment", { exact: true })).toHaveValue("");
  await issueActions.getByText("State and labels").click();
  await issueActions.getByRole("button", { name: "Close issue" }).click();
  await expect(page.getByRole("status")).toContainText("Issue state updated");
  await expect(page.getByLabel("Issue #512")).toHaveCount(0);
  await page.getByRole("group", { name: "Issue filters" }).getByRole("button", { name: "Closed 1" }).click();
  await expect(page.getByLabel("Issue #512")).toBeVisible();
  await issueActions.getByRole("button", { name: "Add label" }).click();
  await expect(page.getByRole("status")).toContainText("Label updated");
  await expect(page.getByLabel("Issue labels")).toContainText("workbench");
  await issueActions.getByRole("button", { name: "Assign me" }).click();
  await issueActions.getByText("Reassign and attachments").click();
  await expect(issueActions.getByRole("button", { name: "Attach image" })).toBeDisabled();
  await issueActions.locator('input[type="file"]').setInputFiles({
    name: "dogfood.png",
    mimeType: "image/png",
    buffer: Buffer.from("workbench"),
  });
  await issueActions.getByRole("button", { name: "Attach image" }).click();
  await expect(issueActions.getByRole("button", { name: "Reassign" })).toBeDisabled();
  await issueActions.getByLabel("Reassign target").selectOption("mean-weasel/bugdrop");
  await expect(issueActions.getByRole("button", { name: "Reassign" })).toBeEnabled();
  await issueActions.getByRole("button", { name: "Reassign" }).click();
  await expect(page.getByRole("heading", { name: "#612 Reassigned issue #612" })).toBeVisible();
  await page.getByRole("button", { name: "mean-weasel/issuectl" }).click();
  await page.getByRole("group", { name: "Issue filters" }).getByRole("button", { name: "Closed 1" }).click();
  await expect(page.getByRole("complementary", { name: "Repo issues" }).getByLabel("Issue #512")).toBeVisible();
});

test("empty repositories add action opens repo setup", async ({ page }) => {
  seedWorkbenchRepos(dbPath, []);

  await gotoWorkbenchWithRetry(page);
  await expect(page.getByRole("heading", { name: "No tracked repositories" })).toBeVisible();
  await expect(page.getByLabel("Workbench focus").getByRole("button", { name: "Open settings" })).toBeVisible();
  await page.getByLabel("Workbench focus").getByRole("button", { name: "Add repository" }).click();
  await expect(page).toHaveURL(new RegExp("/workbench/settings\\?repoSetup=1$"));
  await page.goto("about:blank");
});

test("checks worktree status and launches an issue with selected context", async ({ page }) => {
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });
  await page.route("**/api/v1/worktrees/status?**", async (route) => {
    const url = new URL(route.request().url());
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(url.searchParams.get("owner")).toBe("mean-weasel");
    expect(url.searchParams.get("repo")).toBe("issuectl");
    expect(url.searchParams.get("issueNumber")).toBe("512");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ exists: true, dirty: true, path: "/tmp/issuectl-512" }),
    });
  });
  await expectJsonRequest(page, "**/api/v1/worktrees/reset", "POST", {
    owner: "mean-weasel",
    repo: "issuectl",
    issueNumber: 512,
  });
  await page.route("**/api/v1/worktrees/cleanup", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, removed: 0 }),
    });
  });

  let launchCount = 0;
  await page.route("**/api/v1/deployments/409/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7790, terminalToken: "terminal-token-409" }),
    });
  });
  await mockTerminalPage(page, 7790, "terminal-token-409");
  await page.route("**/api/v1/launch/mean-weasel/issuectl/512", async (route) => {
    launchCount += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    const body = await route.request().postDataJSON();
    const { idempotencyKey, ...withoutNonce } = body;
    expect(withoutNonce).toEqual({
      agent: "codex",
      branchName: "issue-512-desktop-instance-manager-workbench",
      workspaceMode: "worktree",
      selectedCommentIndices: [0],
      selectedFilePaths: ["packages/web/app/workbench/page.tsx"],
      preamble: "Investigate workbench implementation",
      forceResume: false,
    });
    expect(typeof idempotencyKey).toBe("string");
    expect(idempotencyKey.length).toBeGreaterThanOrEqual(8);
    if (launchCount === 1) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "This launch is already in progress — please wait." }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, deploymentId: 409, ttydPort: 7790 }),
    });
  });

  await gotoWorkbenchWithRetry(page);
  await page.getByRole("complementary", { name: "Repo issues" }).getByLabel("Issue #512").click();
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await expect(page.getByLabel("Launch options").getByText("Codex", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Launch options").getByText("Claude Code", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Launch options").getByText("Existing repo")).toBeVisible();
  await expect(page.getByLabel("Launch options").getByText("Git worktree")).toBeVisible();
  await expect(page.getByLabel("Launch options").getByText("Fresh clone")).toBeVisible();
  await expect(page.getByLabel("Branch")).toHaveValue("issue-512-desktop-instance-manager-workbench");
  await expect(page.getByText("Dirty worktree warning")).toBeVisible();
  await page.getByRole("button", { name: "Reset worktree" }).click();
  await expect(page.getByText("Dirty worktree warning")).toHaveCount(0);
  await page.getByRole("button", { name: "Cleanup stale" }).click();

  await page.getByRole("button", { name: "Launch issue" }).click();
  await expect(
    page.getByLabel("Launch options").getByText("launch failed: This launch is already in progress"),
  ).toBeVisible();
  await expect(page.getByLabel("Session #512")).toHaveCount(0);
  await page.getByRole("button", { name: "Launch issue" }).click();
  await expect(page.getByRole("main", { name: "Workbench" })).toHaveAttribute("data-instances-pane", "visible");
  await expect(page.getByRole("main", { name: "Workbench" })).toHaveAttribute("data-issues-pane", "collapsed");
  await expect(page.getByLabel("Session #512")).toBeVisible();
  await expect(page.getByLabel("Session #512")).toContainText("codex");
  await expect(page.getByRole("heading", { name: /#512/ })).toBeVisible();
  await expect.poll(async () =>
    page.getByLabel("Workbench focus").evaluate((element) => element.scrollTop),
  ).toBe(0);
  await expect(page.locator('iframe[title="Terminal for issue 512"]')).toHaveAttribute(
    "src",
    /\/api\/terminal\/7790\/\?terminalToken=terminal-token-409$/,
  );
  await expect(page.locator('iframe[title="Terminal for issue 512"]')).toBeVisible();
  await expect.poll(async () => terminalFrameViewportState(page, "512")).toEqual("visible-in-viewport");
  await page.goto("about:blank");
});

test("defaults launches to fresh clone when a repo has no local path", async ({ page }) => {
  await page.route("**/api/v1/issues/mean-weasel/web/440", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });
  await page.route("**/api/v1/worktrees/status?**", async (route) => {
    const url = new URL(route.request().url());
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(url.searchParams.get("owner")).toBe("mean-weasel");
    expect(url.searchParams.get("repo")).toBe("web");
    expect(url.searchParams.get("issueNumber")).toBe("440");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ exists: false, dirty: false, path: "/tmp/web-440" }),
    });
  });
  await page.route("**/api/v1/launch/mean-weasel/web/440", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    const body = await route.request().postDataJSON();
    const { idempotencyKey, ...withoutNonce } = body;
    expect(withoutNonce).toEqual({
      agent: "codex",
      branchName: "issue-440-web-issue-1",
      workspaceMode: "clone",
      selectedCommentIndices: [0],
      selectedFilePaths: ["packages/web/app/workbench/page.tsx"],
      preamble: "Investigate workbench implementation",
      forceResume: false,
    });
    expect(typeof idempotencyKey).toBe("string");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, deploymentId: 4401, ttydPort: 7791 }),
    });
  });
  await page.route("**/api/v1/deployments/4401/ensure-ttyd", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7791, terminalToken: "terminal-token-4401" }),
    });
  });
  await mockTerminalPage(page, 7791, "terminal-token-4401");

  await gotoWorkbenchWithRetry(page);
  await page.getByRole("button", { name: "mean-weasel/web" }).click();
  await page.getByLabel("Issue #440").click();

  await expect(page.getByRole("radio", { name: /Existing repo/ })).toBeDisabled();
  await expect(page.getByRole("radio", { name: /Git worktree/ })).toBeDisabled();
  await expect(page.getByRole("radio", { name: /Fresh clone/ })).toBeChecked();

  await page.getByRole("button", { name: "Launch issue" }).click();
  await expect(page.getByRole("main", { name: "Workbench" })).toHaveAttribute("data-instances-pane", "visible");
  await expect(page.getByRole("main", { name: "Workbench" })).toHaveAttribute("data-issues-pane", "collapsed");
  await expect(page.getByLabel("Session #440")).toBeVisible();
  await expect(page.getByLabel("Session #440")).toContainText("codex");
  await expect.poll(async () =>
    page.getByLabel("Workbench focus").evaluate((element) => element.scrollTop),
  ).toBe(0);
  await expect(page.locator('iframe[title="Terminal for issue 440"]')).toHaveAttribute(
    "src",
    /\/api\/terminal\/7791\/\?terminalToken=terminal-token-4401$/,
  );
  await expect(page.locator('iframe[title="Terminal for issue 440"]')).toBeVisible();
  await expect.poll(async () => terminalFrameViewportState(page, "440")).toEqual("visible-in-viewport");
});

test("shows terminal reconnect after terminal auth failure", async ({ page }) => {
  let attempts = 0;
  let allowSuccess = false;
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    attempts += 1;
    if (!allowSuccess) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporary terminal failure" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");
  await page.goto(`${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&deployment=101`);
  await expect(page.getByRole("heading", { name: "Terminal unavailable" })).toBeVisible();
  expect(attempts).toBeGreaterThanOrEqual(1);
  allowSuccess = true;
  await page.getByRole("button", { name: "Reconnect session" }).click();
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toBeVisible();
});

test("reconnects a session and shows a Workbench terminal error when the proxy rejects the token", async ({ page }) => {
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101", {
    status: 401,
    body: "Unauthorized",
  });
  await page.route("**/api/v1/deployments/103/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7799, terminalToken: "terminal-token-103" }),
    });
  });
  await mockTerminalPage(page, 7799, "terminal-token-103");

  await gotoWorkbenchWithRetry(page);
  const sessions = page.getByLabel("Issue-backed sessions").getByRole("article");
  await expect(sessions).toHaveCount(3);
  await expect(sessions.nth(0)).toContainText("#447");
  await expect(sessions.nth(1)).toContainText("#486");
  await expect(sessions.nth(2)).toContainText("#498");
  await expect(sessions.nth(1)).toHaveAttribute("data-status", "error");
  await expect(sessions.nth(1)).toContainText("Error: preview failed");

  await sessions.nth(0).getByRole("button").first().click();

  await expect(page.getByRole("heading", { name: /#447/ })).toBeVisible();
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toHaveCount(0);
  const terminalAlert = page.getByRole("alert").filter({ hasText: "Terminal unavailable" });
  await expect(terminalAlert).toBeVisible();
  await expect(terminalAlert).toContainText("Terminal proxy returned 401: Unauthorized");
  await expect(page.getByRole("button", { name: "Reconnect session" })).toBeVisible();

  await sessions.nth(1).getByRole("button", { name: "Reconnect" }).click();
  await expect(page.getByRole("heading", { name: /#486/ })).toBeVisible();
  await expect(page.locator('iframe[title="Terminal for issue 486"]')).toHaveAttribute(
    "src",
    /\/api\/terminal\/7799\/\?terminalToken=terminal-token-103$/,
  );
});

test("moves focus into workbench focus after repo issue session and mode changes", async ({ page }) => {
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");

  await gotoWorkbenchWithRetry(page);
  await page.getByRole("button", { name: "mean-weasel/bugdrop" }).click();
  await expect(page.getByRole("heading", { name: "mean-weasel/bugdrop" })).toBeVisible();
  await expect(page.getByLabel("Workbench focus")).toBeFocused();

  await page.getByRole("button", { name: "mean-weasel/issuectl" }).click();
  await expect(page.getByLabel("Workbench focus")).toBeFocused();
  await page.getByRole("complementary", { name: "Repo issues" }).getByLabel("Issue #512").click();
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await expect(page.getByLabel("Workbench focus")).toBeFocused();

  await page.getByLabel("Issue #447").getByRole("button", { name: "Jump to session" }).click();
  await expect(page.getByRole("heading", { name: /#447/ })).toBeVisible();
  await expect(page.getByLabel("Workbench focus")).toBeFocused();

  await page.getByRole("navigation", { name: "Workbench navigation" })
    .getByRole("button", { name: "Board", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();
  await expect(page.getByLabel("Workbench focus")).toBeFocused();
});

async function clickNavAndExpect(page: import("@playwright/test").Page, label: string, path: string, collapsed: boolean) {
  const navButton = page
    .getByRole("navigation", { name: "Workbench navigation" })
    .getByRole("button", { name: label, exact: true });
  const selectedRepoLabel = await page
    .getByLabel("Repositories")
    .locator('button[data-selected="true"]')
    .getAttribute("aria-label")
    .catch(() => null);
  await navButton.click();
  const expectedPath = selectedRepoLabel
    ? `${path}\\?repo=${escapeRegExp(encodeURIComponent(selectedRepoLabel))}`
    : escapeRegExp(path);
  await expect(page).toHaveURL(new RegExp(`${expectedPath}$`));
  await expect(navButton).toHaveAttribute("aria-current", "page");
  const workbench = page.getByRole("main", { name: "Workbench" });
  if (collapsed) {
    await expect(workbench).toHaveAttribute("data-side-panes", "collapsed");
    await expect(page.getByRole("complementary", { name: "Active sessions" })).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "Repo issues" })).toHaveCount(0);
    const workbenchBox = await workbench.boundingBox();
    const repoRailBox = await page.getByLabel("Repositories").boundingBox();
    const focusBox = await page.getByLabel("Workbench focus").boundingBox();
    expect(workbenchBox).not.toBeNull();
    expect(repoRailBox).not.toBeNull();
    expect(focusBox).not.toBeNull();
    expect(Math.round(focusBox!.width)).toBeGreaterThanOrEqual(
      Math.round(workbenchBox!.width - repoRailBox!.width) - 1,
    );
  } else {
    await expect(workbench).toHaveAttribute("data-side-panes", "visible");
    await expect(page.getByRole("complementary", { name: "Active sessions" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Repo issues" })).toBeVisible();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function gotoWorkbenchWithRetry(page: import("@playwright/test").Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(`${baseUrl}/workbench`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      await page.waitForTimeout(500);
    }
  }
}

async function terminalFrameViewportState(page: import("@playwright/test").Page, issueNumber: string) {
  return page.locator(`iframe[title="Terminal for issue ${issueNumber}"]`).evaluate((iframe) => {
    const rect = iframe.getBoundingClientRect();
    return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth
      ? "visible-in-viewport"
      : `offscreen:${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.right)},${Math.round(rect.bottom)}`;
  });
}

async function expectNoBoxOverlap(
  first: import("@playwright/test").Locator,
  second: import("@playwright/test").Locator,
) {
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  const overlaps =
    firstBox!.x < secondBox!.x + secondBox!.width
    && firstBox!.x + firstBox!.width > secondBox!.x
    && firstBox!.y < secondBox!.y + secondBox!.height
    && firstBox!.y + firstBox!.height > secondBox!.y;
  expect(overlaps).toBe(false);
}

async function expectLocatorWithinViewport(locator: import("@playwright/test").Locator, viewportWidth: number) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
}

async function expectVerticallyBefore(
  first: import("@playwright/test").Locator,
  second: import("@playwright/test").Locator,
) {
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  expect(firstBox!.y + firstBox!.height).toBeLessThanOrEqual(secondBox!.y);
}

async function mockTerminalPage(
  page: import("@playwright/test").Page,
  port: number,
  token: string,
  response: { status?: number; body?: string } = {},
) {
  await page.route(new RegExp(`/api/terminal/${port}/\\?terminalToken=${token}$`), async (route) => {
    await route.fulfill({
      status: response.status ?? 200,
      contentType: "text/html",
      body: response.body ?? [
        "<!doctype html>",
        "<title>issuectl terminal</title>",
        "<main style=\"min-height:100vh;background:#101114;color:#f7f7f2;font:15px ui-monospace, SFMono-Regular, Menlo, monospace;padding:16px;\">terminal ready</main>",
      ].join(""),
    });
  });
}

async function expectNoWorkbenchSplash(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("splash-overlay")).toHaveCount(0);
  await expect(page.getByLabel("Loading workbench")).toHaveCount(0);
  await expect(page.getByText("Opening workbench")).toHaveCount(0);
  await expect(page.getByText("Preparing repositories, sessions, and issue queues.")).toHaveCount(0);
}

async function assertVisibleWorkbenchLayout(page: import("@playwright/test").Page) {
  const rail = page.getByLabel("Repositories");
  const instances = page.getByLabel("Active sessions");
  const focus = page.getByLabel("Workbench focus");
  const issues = page.getByLabel("Repo issues");
  await expect(rail).toBeVisible();
  await expect(instances).toBeVisible();
  await expect(focus).toBeVisible();
  await expect(issues).toBeVisible();
  const railBox = await rail.boundingBox();
  const instanceBox = await instances.boundingBox();
  const focusBox = await focus.boundingBox();
  const issueBox = await issues.boundingBox();

  expect(railBox).not.toBeNull();
  expect(instanceBox).not.toBeNull();
  expect(focusBox).not.toBeNull();
  expect(issueBox).not.toBeNull();
  expect(focusBox!.width).toBeGreaterThanOrEqual(440);
  expect(railBox!.x + railBox!.width).toBeLessThanOrEqual(instanceBox!.x + 1);
  expect(instanceBox!.x + instanceBox!.width).toBeLessThanOrEqual(focusBox!.x + 9);
  expect(focusBox!.x + focusBox!.width).toBeLessThanOrEqual(issueBox!.x + 9);
  for (const box of [railBox!, instanceBox!, focusBox!, issueBox!]) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
}

async function expectNavOneRowAndClickable(page: import("@playwright/test").Page) {
  const nav = page.getByRole("navigation", { name: "Workbench navigation" });
  const buttons = nav.getByRole("button");
  await expect(buttons).toHaveCount(6);
  const count = await buttons.count();
  const boxes = [];
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    boxes.push(box!);
  }
  const firstTop = Math.round(boxes[0].y);
  for (const box of boxes) {
    expect(Math.abs(Math.round(box.y) - firstTop)).toBeLessThanOrEqual(2);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index - 1].x + boxes[index - 1].width).toBeLessThanOrEqual(boxes[index].x + 2);
  }
}

async function expectBoardColumnWidths(page: import("@playwright/test").Page, minimumWidth: number) {
  await expect(page.getByLabel("Cross-repo board")).toBeVisible();
  const columns = page.locator('[aria-label^="Board column "]');
  await expect(columns).toHaveCount(4);
  const focusBox = await page.getByLabel("Workbench focus").boundingBox();
  expect(focusBox).not.toBeNull();
  for (let index = 0; index < 4; index += 1) {
    const box = await columns.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(minimumWidth);
    expect(box!.x).toBeGreaterThanOrEqual(focusBox!.x - 2);
  }
}

async function expectBoardScrollsHorizontally(page: import("@playwright/test").Page) {
  const board = page.getByLabel("Cross-repo board");
  await expect(board).toBeVisible();
  await expect(board).toHaveAttribute("role", "region");
  await expect.poll(async () => board.evaluate((element) => getComputedStyle(element).overflowX))
    .toBe("auto");
  await board.focus();
  await expect(board).toBeFocused();
  if ((page.viewportSize()?.width ?? 0) <= 768) {
    await expect.poll(async () => board.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeGreaterThan(0);
    await board.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await board.evaluate((element) => {
      element.scrollLeft = 96;
    });
    await expect.poll(async () => board.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
  }
}

async function expectNoHorizontalPageScroll(page: import("@playwright/test").Page) {
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(2);
}

async function expectCompactWorkbenchViewport(page: import("@playwright/test").Page) {
  await expectNoHorizontalPageScroll(page);
  await expectWorkbenchFitsViewport(page);
}

async function expectFocusedWorkbenchPaneVisible(page: import("@playwright/test").Page) {
  const focus = page.getByLabel("Workbench focus");
  await expect(focus).toBeFocused();
  const outline = await focus.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
}

async function expectWorkbenchFitsViewport(page: import("@playwright/test").Page) {
  const workbenchLocator = page.getByRole("main", { name: "Workbench" });
  const focusLocator = page.getByLabel("Workbench focus");
  await expect(workbenchLocator).toBeVisible();
  await expect(focusLocator).toBeVisible();
  const overflow = await page.evaluate(() => {
    const workbench = document.querySelector<HTMLElement>('main[aria-label="Workbench"]');
    const focus = document.querySelector<HTMLElement>('[aria-label="Workbench focus"]');
    if (!workbench || !focus) {
      throw new Error("Workbench viewport targets are missing");
    }
    const viewportWidth = window.innerWidth;
    const workbenchRect = workbench.getBoundingClientRect();
    const focusRect = focus.getBoundingClientRect();
    return {
      pageOverflow: document.documentElement.scrollWidth - viewportWidth,
      workbenchOverflow: workbench.scrollWidth - workbench.clientWidth,
      workbenchLeft: workbenchRect.left,
      workbenchRight: workbenchRect.right,
      focusLeft: focusRect.left,
      focusRight: focusRect.right,
    };
  });
  expect(overflow.pageOverflow).toBeLessThanOrEqual(1);
  expect(overflow.workbenchLeft).toBeGreaterThanOrEqual(0);
  expect(overflow.workbenchRight).toBeLessThanOrEqual((await page.viewportSize())!.width + 1);
  expect(overflow.focusLeft).toBeGreaterThanOrEqual(0);
  expect(overflow.focusRight).toBeLessThanOrEqual((await page.viewportSize())!.width + 1);
  expect(overflow.workbenchOverflow).toBeLessThanOrEqual(1);
}

async function expectJsonRequest(
  page: import("@playwright/test").Page,
  url: string,
  method: string,
  expectedBody: Record<string, unknown>,
  responseBody: Record<string, unknown> = { success: true },
) {
  await page.route(url, async (route) => {
    expect(route.request().method()).toBe(method);
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual(expectedBody);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responseBody),
    });
  });
}

function issueDetailFixture() {
  return {
    issue: {
      number: 512,
      title: "Desktop instance manager workbench",
      body: "**bold** [link](https://example.com)\\n\\n- item",
      state: "open",
      labels: [{ name: "high", color: "ffffff", description: null }],
      assignees: [],
      user: { login: "jeremy", avatarUrl: "" },
      commentCount: 1,
      createdAt: "2026-05-16T15:00:00.000Z",
      updatedAt: "2026-05-16T16:00:00.000Z",
      closedAt: null,
      htmlUrl: "https://github.com/mean-weasel/issuectl/issues/512",
    },
    comments: [{
      id: 9001,
      body: "Existing comment",
      user: { login: "jeremy", avatarUrl: "" },
      createdAt: "2026-05-16T16:10:00.000Z",
      updatedAt: "2026-05-16T16:10:00.000Z",
      htmlUrl: "https://github.com/mean-weasel/issuectl/issues/512#issuecomment-9001",
    }],
    deployments: [{
      id: 101,
      repoId: 1,
      issueNumber: 447,
      agent: "codex",
      branchName: "issue-447",
      workspaceMode: "worktree",
      workspacePath: "/workspace/issuectl",
      linkedPrNumber: 501,
      state: "active",
      launchedAt: "2026-05-16T15:00:00.000Z",
      endedAt: null,
      ttydPort: 7701,
      ttydPid: 1234,
      idleSince: null,
      owner: "mean-weasel",
      repoName: "issuectl",
    }, {
      id: 99,
      repoId: 1,
      issueNumber: 512,
      agent: "codex",
      branchName: "issue-512-ended",
      workspaceMode: "worktree",
      workspacePath: "/workspace/issuectl",
      linkedPrNumber: null,
      state: "active",
      launchedAt: "2026-05-15T15:00:00.000Z",
      endedAt: "2026-05-15T16:00:00.000Z",
      ttydPort: null,
      ttydPid: null,
      idleSince: null,
      owner: "mean-weasel",
      repoName: "issuectl",
    }],
    linkedPRs: [{
      number: 501,
      title: "terminal-reconnect-fix",
      state: "open",
      htmlUrl: "https://github.com/mean-weasel/issuectl/pull/501",
    }],
    referencedFiles: ["packages/web/app/workbench/page.tsx"],
    fromCache: true,
    cachedAt: "2026-05-16T16:05:00.000Z",
  };
}

function pullFixture(
  number: number,
  overrides: Partial<{
    title: string;
    body: string | null;
    checksStatus: "success" | "failure" | "pending" | null;
  }> = {},
) {
  return {
    number,
    title: overrides.title ?? `Pull request ${number}`,
    body: overrides.body ?? null,
    state: "open",
    draft: false,
    merged: false,
    user: { login: "jeremy", avatarUrl: "" },
    headRef: `issue-${number}`,
    baseRef: "main",
    additions: 12,
    deletions: 4,
    changedFiles: 3,
    createdAt: "2026-05-16T15:00:00.000Z",
    updatedAt: "2026-05-16T16:00:00.000Z",
    mergedAt: null,
    closedAt: null,
    htmlUrl: `https://github.com/mean-weasel/issuectl/pull/${number}`,
    checksStatus: overrides.checksStatus ?? null,
  };
}

function pullDetailFixture() {
  return {
    pull: pullFixture(501, {
      title: "Add workbench PR review surface",
      body: "Fixes #512",
      checksStatus: "success",
    }),
    checks: [{
      name: "desktop-chromium",
      status: "completed",
      conclusion: "success",
      startedAt: "2026-05-16T16:00:00.000Z",
      completedAt: "2026-05-16T16:02:00.000Z",
      htmlUrl: "https://github.com/mean-weasel/issuectl/actions/runs/1",
    }],
    files: [{
      filename: "packages/web/components/workbench/PullRequestsFocus.tsx",
      status: "added",
      additions: 120,
      deletions: 0,
    }],
    linkedIssue: {
      number: 512,
      title: "Desktop instance manager workbench",
      body: "Build the workbench.",
      state: "open",
      labels: [],
      assignees: [],
      user: { login: "jeremy", avatarUrl: "" },
      commentCount: 0,
      createdAt: "2026-05-16T15:00:00.000Z",
      updatedAt: "2026-05-16T16:00:00.000Z",
      closedAt: null,
      htmlUrl: "https://github.com/mean-weasel/issuectl/issues/512",
    },
    reviews: [],
    fromCache: false,
    cachedAt: null,
  };
}

function workbenchPayload() {
  return {
    repos: [
      repo(1, "issuectl", 3),
      repo(2, "bugdrop", 1),
      { ...repo(3, "api", 0), issueError: "GitHub unavailable for api" },
      { ...repo(4, "web", 0), localPath: null },
    ],
    deployments: [],
    previews: {},
    settings: {},
    health: { ok: true, version: "0.0.0", timestamp: "2026-05-16T16:00:00.000Z", error: null },
    user: { login: "jeremy", error: null },
    generatedAt: "2026-05-16T16:00:00.000Z",
  };
}

function repo(id: number, name: string, deploymentCount: number): {
  id: number;
  owner: string;
  name: string;
  localPath: string | null;
  branchPattern: string | null;
  badgeCount: number;
  deployedCount: number;
  launchAgent: "codex" | null;
  issueError: string | null;
  issuesFromCache: boolean;
  issuesCachedAt: string | null;
  priorities: [];
  deployments: Array<{
    id: number;
    repoId: number;
    issueNumber: number;
    agent: "codex";
    branchName: string;
    workspaceMode: "worktree";
    workspacePath: string;
    linkedPrNumber: null;
    state: "active";
    launchedAt: string;
    endedAt: null;
    ttydPort: number | null;
    ttydPid: number | null;
    idleSince: null;
    owner: string;
    repoName: string;
  }>;
  previews: {};
  issues: FixtureIssue[];
} {
  return {
    id,
    owner: "mean-weasel",
    name,
    localPath: `/workspace/${name}`,
    branchPattern: null,
    badgeCount: deploymentCount,
    deployedCount: deploymentCount,
    launchAgent: deploymentCount > 0 ? "codex" : null,
    issueError: null,
    issuesFromCache: false,
    issuesCachedAt: null,
    priorities: [],
    deployments: Array.from({ length: deploymentCount }, (_, index) => ({
      id: deploymentId(id, index),
      repoId: id,
      issueNumber: issueNumber(id, index),
      agent: "codex",
      branchName: `issue-${issueNumber(id, index)}`,
      workspaceMode: "worktree",
      workspacePath: `/workspace/${name}`,
      linkedPrNumber: null,
      state: "active",
      launchedAt: launchedAt(id, index),
      endedAt: null,
      ttydPort: ttydPort(id, index),
      ttydPid: 1234 + index,
      idleSince: null,
      owner: "mean-weasel",
      repoName: name,
    })),
    previews: {},
    issues: Array.from({ length: issueCount(id, deploymentCount) }, (_, index) => ({
      number: issueNumber(id, index),
      title: issueTitle(id, name, index),
      state: "open",
      labels: [],
      assignees: [],
      user: { login: "jeremy", avatarUrl: "" },
      commentCount: 0,
      createdAt: "2026-05-16T15:00:00.000Z",
      updatedAt: "2026-05-16T16:00:00.000Z",
      closedAt: null,
      htmlUrl: `https://github.com/mean-weasel/${name}/issues/${issueNumber(id, index)}`,
      priority: id === 1 && index === 3 ? "high" : "normal",
    })),
  };
}

function issueCount(repoId: number, deploymentCount: number): number {
  if (repoId === 1) return 4;
  return Math.max(1, deploymentCount);
}

function deploymentId(repoId: number, index: number): number {
  if (repoId === 1) return [101, 102, 103][index] ?? 100 + index;
  return repoId * 100 + index;
}

function issueNumber(repoId: number, index: number): number {
  if (repoId === 1) return [447, 498, 486, 512][index] ?? 440 + index;
  return 440 + index;
}

function ttydPort(repoId: number, index: number): number {
  if (repoId === 1) return [7701, 7702, 7703][index] ?? 7700 + index;
  return 7700 + index;
}

function launchedAt(repoId: number, index: number): string {
  if (repoId === 1) {
    return [
      "2026-05-16T15:00:00.000Z",
      "2026-05-16T16:00:00.000Z",
      "2026-05-16T17:00:00.000Z",
    ][index] ?? "2026-05-16T14:00:00.000Z";
  }
  return "2026-05-16T16:00:00.000Z";
}

function issueTitle(repoId: number, name: string, index: number): string {
  if (repoId === 1) {
    return [
      "Mac sidebar follow-up",
      "Terminal resize polish",
      "Preview error state",
      "Desktop instance manager workbench",
    ][index] ?? `${name} issue ${index + 1}`;
  }
  return `${name} issue ${index + 1}`;
}
