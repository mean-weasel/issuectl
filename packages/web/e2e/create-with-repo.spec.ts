import { test, expect } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { initSchema, runMigrations } from "@issuectl/core";

const execFileAsync = promisify(execFile);

// Distinct from other specs: quick-create (3848), audit-verification (3850),
// mobile-ux-patterns (3851), launch-ui (3852), pwa-offline (3853),
// action-sheets (3854).
const TEST_PORT = 3855;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";

// Use mobile viewport so the FAB and action-sheet handle are visible.
test.use({
  viewport: { width: 393, height: 852 },
  isMobile: true,
  hasTouch: true,
});

// ── Skip conditions ─────────────────────────────────────────────────

async function canRun(): Promise<{ ok: boolean; reason?: string }> {
  try {
    await execFileAsync("gh", ["auth", "token"]);
    return { ok: true };
  } catch {
    return { ok: false, reason: "gh auth not configured" };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

const DRAFT_ID = "cccccccc-dddd-eeee-ffff-000000000001";
const DRAFT_TITLE = "E2E test draft for assign flow";

function createTestDb(dbPath: string): void {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  try {
    initSchema(db);
    runMigrations(db);

    const defaults: Array<[string, string]> = [
      ["branch_pattern", "issue-{number}-{slug}"],
      ["terminal_app", "iterm2"],
      ["terminal_window_title", "issuectl"],
      ["terminal_tab_title_pattern", "#{number} — {title}"],
      ["cache_ttl", "300"],
      ["worktree_dir", "~/.issuectl/worktrees/"],
    ];
    const insertSetting = db.prepare(
      "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
    );
    for (const [key, value] of defaults) {
      insertSetting.run(key, value);
    }

    db.prepare("INSERT OR IGNORE INTO repos (owner, name) VALUES (?, ?)").run(
      TEST_OWNER,
      TEST_REPO,
    );

    // Seed a draft for the assign-to-repo test
    const now = Date.now();
    db.prepare(
      `INSERT INTO drafts (id, title, body, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(DRAFT_ID, DRAFT_TITLE, "Body for assign e2e test", "normal", now, now);

    // Seed empty issues cache so the index page renders without a live
    // GitHub fetch.
    db.prepare(
      "INSERT INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now'))",
    ).run(`issues:${TEST_OWNER}/${TEST_REPO}`, JSON.stringify([]));
  } finally {
    db.close();
  }
}

function waitForServer(url: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      fetch(url)
        .then((res) => {
          if (res.ok || res.status === 404) resolve();
          else if (Date.now() > deadline) reject(new Error("Server timeout"));
          else setTimeout(check, 500);
        })
        .catch(() => {
          if (Date.now() > deadline) reject(new Error("Server timeout"));
          else setTimeout(check, 500);
        });
    };
    check();
  });
}

// ── Test suite ──────────────────────────────────────────────────────

const STDERR_BUFFER_MAX_CHUNKS = 40;
const serverStderrChunks: string[] = [];

let tmpDir: string;
let dbPath: string;
let server: ChildProcess;
let skipReason: string | undefined;
const createdIssueNumbers: number[] = [];

test.beforeAll(async () => {
  const check = await canRun();
  if (!check.ok) {
    skipReason = check.reason;
    return;
  }

  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-create-with-repo-"));
  dbPath = join(tmpDir, "test.db");
  createTestDb(dbPath);

  const distDir = join(tmpDir, ".next-test");

  server = spawn("npx", ["next", "dev", "--port", String(TEST_PORT)], {
    cwd: join(import.meta.dirname, ".."),
    env: {
      ...process.env,
      ISSUECTL_DB_PATH: dbPath,
      NEXT_DIST_DIR: distDir,
      NEXT_PRIVATE_SKIP_SETUP: "1",
    },
    stdio: "pipe",
    detached: true,
  });

  server.stderr?.on("data", (chunk: Buffer) => {
    serverStderrChunks.push(chunk.toString());
    if (serverStderrChunks.length > STDERR_BUFFER_MAX_CHUNKS) {
      serverStderrChunks.shift();
    }
  });

  await waitForServer(BASE_URL, 60000).catch((err) => {
    throw new Error(
      `${err.message}. Server stderr: ${serverStderrChunks.join("").slice(-800)}`,
    );
  });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && serverStderrChunks.length > 0) {
    await testInfo.attach("server-stderr", {
      body: serverStderrChunks.join("").slice(-2000),
      contentType: "text/plain",
    });
  }
});

test.afterAll(async () => {
  // Clean up created GitHub issues
  for (const num of createdIssueNumbers) {
    try {
      await execFileAsync("gh", [
        "issue",
        "close",
        String(num),
        "--repo",
        `${TEST_OWNER}/${TEST_REPO}`,
        "--reason",
        "not planned",
      ]);
    } catch {
      // Best-effort cleanup
    }
  }

  if (server && server.pid) {
    const killGroup = (signal: NodeJS.Signals) => {
      try {
        process.kill(-server.pid!, signal);
      } catch {
        /* already dead or orphaned */
      }
    };

    const killTimeout = setTimeout(() => killGroup("SIGKILL"), 5000);
    killGroup("SIGTERM");
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) {
        resolve();
        return;
      }
      server.on("close", () => resolve());
    });
    clearTimeout(killTimeout);
  }

  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  // Restore any files that `next dev` with a custom distDir may have
  // modified (tsconfig.json, next-env.d.ts).
  await execFileAsync("git", [
    "checkout", "--", "packages/web/tsconfig.json", "packages/web/next-env.d.ts",
  ], { cwd: join(import.meta.dirname, "../../..") }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("did not match any")) {
      console.warn(`[create-with-repo afterAll] git checkout failed: ${msg}`);
    }
  });
});

// ── CreateDraftSheet: create with repo ──────────────────────────────

test.describe("CreateDraftSheet — create with repo", () => {
  test("creates issue on GitHub and navigates to it", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);

    await page.goto(BASE_URL);

    // Wait for the page to fully render
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15000,
    });

    // Click the FAB to open CreateDraftSheet
    await page.getByRole("button", { name: "Create a new draft" }).click();

    // Verify the sheet opened
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    // Type a title with a timestamp for uniqueness
    const timestamp = Date.now();
    const issueTitle = `E2E test — create with repo ${timestamp}`;
    await sheet.getByPlaceholder("What needs to be done?").fill(issueTitle);

    // Select the repo chip — wait for repos to load first
    const repoChip = sheet.getByRole("button", { name: TEST_REPO });
    await expect(repoChip).toBeVisible({ timeout: 10000 });
    await repoChip.click();

    // Verify button text changes to "create issue"
    const createBtn = sheet.getByRole("button", { name: "create issue" });
    await expect(createBtn).toBeVisible();
    await expect(createBtn).toBeEnabled();

    // Click "create issue"
    await createBtn.click();

    // Wait for navigation to the issue detail page. The GitHub API call
    // can take a few seconds, so allow a generous timeout.
    await page.waitForURL(
      (url) => {
        const path = new URL(url).pathname;
        return path.startsWith(`/issues/${TEST_OWNER}/${TEST_REPO}/`);
      },
      { timeout: 30000 },
    );

    // Extract the issue number from the URL for cleanup
    const issueNumber = Number(
      new URL(page.url()).pathname.split("/").pop(),
    );
    expect(issueNumber).toBeGreaterThan(0);
    createdIssueNumbers.push(issueNumber);

    // Verify the issue detail page rendered with the correct title.
    // The heading or title area should contain the issue title text.
    await expect(page.getByText(issueTitle)).toBeVisible({ timeout: 15000 });
  });

  test("no repo selected saves as local draft", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);

    await page.goto(BASE_URL);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15000,
    });

    // Click the FAB to open CreateDraftSheet
    await page.getByRole("button", { name: "Create a new draft" }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    // Type a title
    const timestamp = Date.now();
    const draftTitle = `E2E test — local draft ${timestamp}`;
    await sheet.getByPlaceholder("What needs to be done?").fill(draftTitle);

    // Wait for repos to finish loading so the state is stable — a
    // default repo from test 1 may auto-select, changing the button
    // from "save draft" to "create issue". Deselect it if needed.
    const repoChip = sheet.getByRole("button", { name: TEST_REPO });
    await expect(repoChip).toBeVisible({ timeout: 10000 });
    if ((await repoChip.getAttribute("aria-pressed")) === "true") {
      await repoChip.click();
    }

    const saveBtn = sheet.getByRole("button", { name: "save draft" });
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeEnabled();

    // Click "save draft"
    await saveBtn.click();

    // Verify the sheet closes
    await expect(sheet).not.toBeVisible({ timeout: 5000 });

    // Navigate to the drafts section to verify the draft appears.
    // Wait for networkidle so the Suspense streaming completes — the
    // dashboard fetches from GitHub via an async Server Component,
    // and the draft appears only after the stream resolves.
    await page.goto(`${BASE_URL}/?section=unassigned`);
    await page.waitForLoadState("networkidle");

    // The draft title should appear in the list
    await expect(page.getByText(draftTitle)).toBeVisible({ timeout: 30000 });
  });
});

// ── AssignSheet: assign draft to repo ───────────────────────────────

test.describe("AssignSheet — assign draft to repo", () => {
  test("assigning draft creates GitHub issue and navigates to it", async ({
    page,
  }) => {
    if (skipReason) test.skip(true, skipReason);

    // Navigate to the seeded draft's detail page
    await page.goto(`${BASE_URL}/drafts/${DRAFT_ID}`);

    // Verify the draft detail page rendered
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      DRAFT_TITLE,
      { timeout: 15000 },
    );

    // Open the action sheet via the bottom handle
    await page.getByRole("button", { name: /Open Actions/ }).click();

    // Sheet dialog opens — click the assign action
    const sheet = page.getByRole("dialog", { name: "draft actions" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Assign to repo" }).click();

    // AssignSheet opens with the repo list
    const assignSheet = page.getByRole("dialog", { name: "assign to repo" });
    await expect(assignSheet).toBeVisible({ timeout: 10000 });

    // Wait for repos to load, then click the test repo — opens ConfirmDialog
    const repoButton = assignSheet.getByText(TEST_REPO);
    await expect(repoButton).toBeVisible({ timeout: 10000 });
    await repoButton.click();

    // Confirm the assignment in the ConfirmDialog
    const confirmDialog = page.getByRole("dialog", { name: "Assign to Repo", exact: true });
    await expect(confirmDialog).toBeVisible({ timeout: 10000 });
    await confirmDialog.getByRole("button", { name: "Assign" }).click();

    // Wait for navigation to the created issue's detail page.
    // The GitHub API call can take a few seconds.
    await page.waitForURL(
      (url) => {
        const path = new URL(url).pathname;
        return path.startsWith(`/issues/${TEST_OWNER}/${TEST_REPO}/`);
      },
      { timeout: 30000 },
    );

    // Extract the issue number for cleanup
    const issueNumber = Number(
      new URL(page.url()).pathname.split("/").pop(),
    );
    expect(issueNumber).toBeGreaterThan(0);
    createdIssueNumbers.push(issueNumber);
  });
});
