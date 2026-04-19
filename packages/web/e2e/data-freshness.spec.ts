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

let tmpDir: string;
let dbPath: string;
let server: ChildProcess;
let skipReason: string | undefined;

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
