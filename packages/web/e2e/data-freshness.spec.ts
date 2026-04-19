import { test, expect } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      local_path TEXT,
      branch_pattern TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(owner, name)
    );
    CREATE TABLE IF NOT EXISTS deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL REFERENCES repos(id),
      issue_number INTEGER NOT NULL,
      branch_name TEXT NOT NULL,
      workspace_mode TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      linked_pr_number INTEGER,
      launched_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT
    );
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (?)").run(4);

  const defaults = [
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

  db.close();
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

  server = spawn("npx", ["next", "dev", "--port", String(TEST_PORT)], {
    cwd: join(import.meta.dirname, ".."),
    env: { ...process.env, ISSUECTL_DB_PATH: dbPath },
    stdio: "pipe",
  });

  let serverStderr = "";
  server.stderr?.on("data", (chunk: Buffer) => {
    serverStderr += chunk.toString();
  });

  await waitForServer(BASE_URL, 30000).catch((err) => {
    throw new Error(
      `${err.message}. Server stderr: ${serverStderr.slice(-500)}`,
    );
  });
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

  if (server) {
    const killTimeout = setTimeout(() => {
      try {
        server.kill("SIGKILL");
      } catch {
        /* already dead */
      }
    }, 5000);

    server.kill("SIGTERM");
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

    // Track created issue for cleanup
    const match = page.url().match(/\/issues\/(\d+)/);
    if (match) createdIssueNumbers.push(Number(match[1]));

    // Navigate back to dashboard
    await page.click('a[aria-label="Back"]');
    await page.waitForLoadState("networkidle");

    // The issue should be visible without pulling to refresh
    await expect(page.getByText(issueTitle)).toBeVisible({ timeout: 10000 });
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
    await page.waitForLoadState("networkidle");

    // Click back
    await page.click('a[aria-label="Back"]');
    await page.waitForLoadState("networkidle");

    // URL should still have both query params
    expect(page.url()).toContain(`repo=${TEST_OWNER}/${TEST_REPO}`);
    expect(page.url()).toContain("section=in_focus");
  });
});
