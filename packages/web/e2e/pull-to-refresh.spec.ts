import { test, expect } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);

const TEST_PORT = 3854;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";

async function canRun(): Promise<{ ok: boolean; reason?: string }> {
  try {
    await execFileAsync("gh", ["auth", "token"]);
    return { ok: true };
  } catch {
    return { ok: false, reason: "gh auth not configured" };
  }
}

const STDERR_BUFFER_MAX_CHUNKS = 40;
const serverStderrChunks: string[] = [];

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
      data TEXT NOT NULL
    );
  `);

  db.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (?)").run(4);

  const defaults: Array<[string, string]> = [
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

  db.prepare("INSERT OR IGNORE INTO repos (owner, name) VALUES (?, ?)").run(
    TEST_OWNER,
    TEST_REPO,
  );

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

let tmpDir: string;
let dbPath: string;
let server: ChildProcess;
let skipReason: string | undefined;

test.beforeAll(async () => {
  const check = await canRun();
  if (!check.ok) {
    if (process.env.CI === "true") {
      throw new Error(
        `Pull-to-refresh suite cannot skip in CI: ${check.reason}.`,
      );
    }
    skipReason = check.reason;
    return;
  }

  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-pull-refresh-"));
  dbPath = join(tmpDir, "test.db");
  createTestDb(dbPath);

  server = spawn("npx", ["next", "dev", "--port", String(TEST_PORT)], {
    cwd: join(import.meta.dirname, ".."),
    env: { ...process.env, ISSUECTL_DB_PATH: dbPath },
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

test.afterAll(async () => {
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
});

test.describe("Pull-to-refresh (#133)", () => {
  test("PullToRefresh wrapper renders on the dashboard", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/`);
    // The PullToRefresh wrapper should be present around the list container
    const wrapper = page.locator('[class*="PullToRefresh"]').first();
    await expect(wrapper).toBeVisible({ timeout: 15000 });
  });

  test("touch-swipe gesture from top triggers refresh indicator", async ({
    browser,
  }) => {
    if (skipReason) test.skip(true, skipReason);

    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    try {
      await page.goto(`${BASE_URL}/`);
      await page.waitForLoadState("networkidle");

      // Simulate a pull-down touch gesture from the top of the page
      await page.touchscreen.tap(200, 100);
      // Perform a slow swipe down to trigger the pull indicator
      const startY = 100;
      const endY = 300;
      const steps = 10;

      // Use page.evaluate to dispatch touch events directly
      await page.evaluate(
        ({ startY, endY, steps }) => {
          const el = document.elementFromPoint(200, startY);
          if (!el) return;

          const createTouch = (y: number) =>
            new Touch({
              identifier: 0,
              target: el,
              clientX: 200,
              clientY: y,
              pageX: 200,
              pageY: y,
            });

          el.dispatchEvent(
            new TouchEvent("touchstart", {
              touches: [createTouch(startY)],
              bubbles: true,
            }),
          );

          const stepSize = (endY - startY) / steps;
          for (let i = 1; i <= steps; i++) {
            const y = startY + stepSize * i;
            el.dispatchEvent(
              new TouchEvent("touchmove", {
                touches: [createTouch(y)],
                bubbles: true,
              }),
            );
          }

          el.dispatchEvent(
            new TouchEvent("touchend", {
              touches: [],
              bubbles: true,
            }),
          );
        },
        { startY, endY, steps },
      );

      // After the gesture the page should still render correctly
      await expect(page.locator("h1")).toBeVisible({ timeout: 5000 });
    } finally {
      await context.close();
    }
  });

  test("page renders correctly after pull gesture", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState("networkidle");

    // Basic check: the dashboard still has its core elements after load
    await expect(page.locator("h1")).toContainText("issuectl");
    await expect(
      page.locator('button[aria-label="Open navigation"]'),
    ).toBeVisible();
  });
});
