import { test, expect } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);

// Use a unique port to avoid collision with other e2e specs.
const TEST_PORT = 3851;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";

// ── Skip conditions ─────────────────────────────────────────────────
//
// These tests require a production build (service worker is disabled
// in dev mode) and gh auth for the dev server to boot.

async function canRun(): Promise<{ ok: boolean; reason?: string }> {
  try {
    await execFileAsync("gh", ["auth", "token"]);
    return { ok: true };
  } catch {
    return { ok: false, reason: "gh auth not configured" };
  }
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
      data TEXT NOT NULL
    );
  `);

  db.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (?)").run(4);

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

// ── Test fixture ────────────────────────────────────────────────────

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

  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-pwa-"));
  dbPath = join(tmpDir, "test.db");
  createTestDb(dbPath);

  // PWA tests need a production server — the service worker is
  // disabled in dev mode via `disable: process.env.NODE_ENV === "development"`.
  // The build must have been run before these tests (pnpm turbo build).
  server = spawn("npx", ["next", "start", "--port", String(TEST_PORT)], {
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
      server.on("exit", () => resolve());
    });
    clearTimeout(killTimeout);
  }

  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Tests ───────────────────────────────────────────────────────────

test.describe("PWA + Offline", () => {
  test.beforeEach(async ({ }, testInfo) => {
    if (skipReason) {
      testInfo.skip(true, skipReason);
    }
  });

  test("manifest is served with correct PWA fields", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/manifest.json`);
    expect(res.ok()).toBe(true);

    const manifest = await res.json();
    expect(manifest.name).toBe("issuectl");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons).toHaveLength(1);
    expect(manifest.icons[0].type).toBe("image/svg+xml");
  });

  test("service worker registers and activates", async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for the SW to register and become active.
    const swState = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return "unsupported";
      const reg = await navigator.serviceWorker.ready;
      return reg.active ? "active" : "waiting";
    });

    expect(swState).toBe("active");
  });

  test("cached page is served when offline", async ({ page, context }) => {
    // Visit the home page to warm the SW cache.
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // Wait for SW to be controlling this page.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      // If the SW is active but not yet controlling, reload.
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener("controllerchange", () => resolve());
        });
      }
    });

    // Go offline and reload — the cached page should be served.
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });

    // The page should still render (from SW cache). Check for the
    // body element — if the SW cache missed, the page would fail to
    // load entirely.
    await expect(page.locator("body")).toBeVisible();

    // Note: Playwright's setOffline() blocks network requests but does
    // not fire the browser's "offline" event or change navigator.onLine,
    // so the OfflineIndicator banner won't appear in this test. The
    // banner is verified manually or via a separate unit test.

    await context.setOffline(false);
  });

  test("offline fallback page shows for unvisited routes", async ({ page, context }) => {
    // Visit the home page first to install and activate the SW.
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener("controllerchange", () => resolve());
        });
      }
    });

    // Go offline, then navigate to a route we never visited.
    await context.setOffline(true);

    // Navigate to an uncached route. The SW should serve offline.html.
    await page.goto(`${BASE_URL}/parse`, { waitUntil: "domcontentloaded" });

    // The offline fallback page should show.
    await expect(page.locator("h1")).toContainText("You're offline");
    await expect(page.locator(".retry")).toHaveAttribute("href", "/");

    await context.setOffline(false);
  });
});
