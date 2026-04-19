import { test, expect } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { initSchema, runMigrations } from "@issuectl/core";

const execFileAsync = promisify(execFile);

const TEST_PORT = 3856;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";

// ── Skip conditions ─────────────────────────────────────────────────

async function canRun(): Promise<{ ok: boolean; reason?: string }> {
  try {
    await execFileAsync("gh", ["auth", "token"]);
  } catch {
    return { ok: false, reason: "gh auth not configured" };
  }

  return { ok: true };
}

// ── Helpers ─────────────────────────────────────────────────────────

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

    db.prepare(
      "INSERT OR IGNORE INTO repos (owner, name) VALUES (?, ?)",
    ).run(TEST_OWNER, TEST_REPO);
  } finally {
    db.close();
  }
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Server timeout");
}

// ── Test suite ──────────────────────────────────────────────────────

const STDERR_BUFFER_MAX_CHUNKS = 200;
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

  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-df-"));
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

  server.stdout?.on("data", (chunk: Buffer) => {
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
      body: serverStderrChunks.join("").slice(-8000),
      contentType: "text/plain",
    });
  }
});

test.afterAll(async () => {
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

  await execFileAsync("git", [
    "checkout", "--", "packages/web/tsconfig.json", "packages/web/next-env.d.ts",
  ], { cwd: join(import.meta.dirname, "../../..") }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("did not match any")) {
      console.warn(`[data-freshness afterAll] git checkout failed: ${msg}`);
    }
  });
});

// ── A1: Comment appears immediately after posting (#135, #131) ──────

test.describe("Data freshness — comment appears immediately (#135)", () => {
  test("comment is visible after posting without manual refresh", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);

    await page.goto(`${BASE_URL}/`);
    const issueLink = page.locator('a[href*="/issues/"]').first();
    await expect(issueLink).toBeVisible({ timeout: 15000 });
    await issueLink.click();

    const textarea = page.locator('textarea[aria-label="Comment body"]');
    await expect(textarea).toBeVisible({ timeout: 15000 });

    const commentText = `E2E test comment ${Date.now()}`;
    await textarea.fill(commentText);
    await page.click('button:has-text("comment")');

    // Comment should be visible WITHOUT a manual page refresh
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10000 });
  });
});

// ── A2: New issue visible on dashboard after creation (#128) ────────

test.describe("Data freshness — new issue visible on dashboard (#128)", () => {
  test("issue appears on index page after creation without manual refresh", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);

    await page.goto(`${BASE_URL}/new`);
    await expect(page.locator('input[type="text"]').first()).toBeVisible({ timeout: 15000 });

    const issueTitle = `E2E freshness test ${Date.now()}`;
    await page.locator('input[type="text"]').first().fill(issueTitle);
    await page.click('button:has-text("Create")');

    // After creation, the app navigates to the issue detail
    await expect(page).toHaveURL(/\/issues\//, { timeout: 15000 });

    // Track created issue for cleanup — URL is /issues/owner/repo/number
    const match = page.url().match(/\/issues\/[^/]+\/[^/]+\/(\d+)/);
    if (match) createdIssueNumbers.push(Number(match[1]));

    // Navigate to dashboard. Wait for networkidle so the Suspense
    // streaming completes — the dashboard fetches from GitHub via an
    // async Server Component.
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // Wait for the Suspense content to stream in (an issue link proves
    // DashboardContent resolved, not just the skeleton fallback).
    await expect(page.locator('a[href*="/issues/"]').first()).toBeVisible({ timeout: 15000 });

    // GitHub's list endpoint has brief eventual consistency after
    // writes — the new issue may not appear in the first response.
    // If it's missing, the stale response gets re-cached locally, so
    // we must clear the SQLite cache between retries to force a fresh
    // API call on each reload.
    for (let attempt = 0; attempt < 3; attempt++) {
      const found = await page.getByText(issueTitle).isVisible({ timeout: 3000 }).catch(() => false);
      if (found) break;

      const db = new Database(dbPath);
      db.prepare("DELETE FROM cache WHERE key LIKE 'issues:%'").run();
      db.close();

      await page.waitForTimeout(2000);
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(page.locator('a[href*="/issues/"]').first()).toBeVisible({ timeout: 15000 });
    }

    // The issue should be visible without pulling to refresh
    await expect(page.getByText(issueTitle)).toBeVisible({ timeout: 15000 });
  });
});

// ── A3: Filters persist on back-navigation (#129) ──────────────────

test.describe("Data freshness — filters persist on back-nav (#129)", () => {
  test("repo filter preserved when navigating back from issue detail", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);

    await page.goto(`${BASE_URL}/?repo=${TEST_OWNER}/${TEST_REPO}&section=in_focus`);
    await page.waitForLoadState("networkidle");

    const issueLink = page.locator('a[href*="/issues/"]').first();
    const isVisible = await issueLink.isVisible({ timeout: 5000 });
    if (!isVisible) {
      test.skip(true, "No issues visible for filter persistence test — check test data");
      return;
    }

    await issueLink.click();
    await expect(page).toHaveURL(/\/issues\//, { timeout: 15000 });

    // Use browser back (not the Back link) to test history-based filter
    // preservation. The Back link relies on document.referrer which is
    // empty after page.goto() in Playwright, so it falls through to a
    // hard <Link href="/"> that drops query params.
    await page.goBack();
    await page.waitForURL(
      (url) => url.searchParams.has("repo") && url.searchParams.has("section"),
      { timeout: 15000 },
    );

    // URL should still have both query params
    expect(page.url()).toContain(`repo=${TEST_OWNER}/${TEST_REPO}`);
    expect(page.url()).toContain("section=in_focus");
  });
});
