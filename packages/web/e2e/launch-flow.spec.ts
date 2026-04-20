import { test, expect } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

// STATUS (2026-04): this spec exercises the full real-terminal launch
// flow — gated on macOS + gh auth, never runs in CI. The route paths and
// copy assertions below pre-date a route restructure and are known stale;
// running this requires updating those AND a real ttyd launch + cleanup
// pass. CI-friendly UI coverage of the launch progress page (poller,
// spinner, back link, aria) lives in launch-ui.spec.ts, which seeds a
// deployment row directly without spawning anything.

const execFileAsync = promisify(execFile);

// ── Skip conditions ─────────────────────────────────────────────────

async function canRun(): Promise<{ ok: boolean; reason?: string }> {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "Not macOS" };
  }

  // Check ttyd installed
  try {
    await execFileAsync("which", ["ttyd"]);
  } catch {
    return { ok: false, reason: "ttyd not installed" };
  }

  // Check gh auth
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
      launched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (?)").run(1);

  const defaults = [
    ["branch_pattern", "issue-{number}-{slug}"],
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
  ).run("mean-weasel", "issuectl-test-repo");

  db.close();
}

async function getTtydPids(): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-ix", "ttyd"]);
    return stdout.trim().split("\n").map(Number).filter(Boolean);
  } catch {
    return [];
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

let tmpDir: string;
let dbPath: string;
let server: ChildProcess;
let pidsBefore: number[];
let skipReason: string | undefined;

test.beforeAll(async () => {
  const check = await canRun();
  if (!check.ok) {
    skipReason = check.reason;
    return;
  }

  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-"));
  dbPath = join(tmpDir, "test.db");
  createTestDb(dbPath);

  pidsBefore = await getTtydPids();

  server = spawn("npx", ["next", "dev", "--port", "3847"], {
    cwd: join(import.meta.dirname, ".."),
    env: { ...process.env, ISSUECTL_DB_PATH: dbPath },
    stdio: "pipe",
  });

  let serverStderr = "";
  server.stderr?.on("data", (chunk: Buffer) => { serverStderr += chunk.toString(); });

  await waitForServer("http://localhost:3847", 30000).catch((err) => {
    throw new Error(`${err.message}. Server stderr: ${serverStderr.slice(-500)}`);
  });
});

test.afterAll(async () => {
  if (server) {
    const killTimeout = setTimeout(() => {
      try { server.kill("SIGKILL"); } catch { /* already dead */ }
    }, 5000);

    server.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) { resolve(); return; }
      server.on("close", () => resolve());
    });
    clearTimeout(killTimeout);
  }

  if (pidsBefore) {
    const pidsNow = await getTtydPids();
    const newPids = pidsNow.filter((p) => !pidsBefore.includes(p));
    for (const pid of newPids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Already exited
      }
    }
  }

  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test.describe("launch flow", () => {
  test("issue page shows issue details from test repo", async ({ page }) => {
    if (skipReason) {
      test.skip(true, skipReason);
    }

    await page.goto("/mean-weasel/issuectl-test-repo/issues/1");

    await expect(page.locator("text=Add user authentication")).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByRole("button", { name: "Launch to Claude Code" }).first()).toBeVisible();
  });

  test("full launch flow from issue to deployment page", async ({ page }) => {
    if (skipReason) {
      test.skip(true, skipReason);
    }

    await page.goto("/mean-weasel/issuectl-test-repo/issues/1");

    await expect(page.locator("text=Add user authentication")).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole("button", { name: "Launch to Claude Code" }).first().click();

    await expect(page.locator("text=Repository not cloned")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Clone & Launch" }).click();

    await expect(page.locator("text=Launch to Claude Code").first()).toBeVisible({ timeout: 5000 });

    const pidsBeforeLaunch = await getTtydPids();

    await page.getByRole("button", { name: "Launch", exact: true }).click();

    await page.waitForURL(/\/launch\?deploymentId=/, { timeout: 90000 });

    await expect(page.locator("text=Launching #1 to Claude Code")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Back to issue", exact: true })).toBeVisible();

    await page.waitForTimeout(2000);
    const pidsAfterLaunch = await getTtydPids();
    const newPids = pidsAfterLaunch.filter((p) => !pidsBeforeLaunch.includes(p));
    expect(newPids.length).toBeGreaterThanOrEqual(1);
  });
});
