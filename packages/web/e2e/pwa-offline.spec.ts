import { test, expect } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);

// Distinct from launch-flow (3847) / quick-create (3848)
// / audit-verification (3850) / mobile-ux-patterns (3851)
// / launch-ui (3852) so all specs can coexist.
const TEST_PORT = 3853;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";

// ── Skip conditions ─────────────────────────────────────────────────
//
// These tests require a production build (service worker is disabled
// in dev mode) and gh auth for the server to boot.

async function canRun(): Promise<{ ok: boolean; reason?: string }> {
  // next start requires a prior next build — without BUILD_ID the
  // server crashes immediately with "Could not find a production build".
  const buildId = join(import.meta.dirname, "..", ".next", "BUILD_ID");
  if (!existsSync(buildId)) {
    return { ok: false, reason: "no production build — run `pnpm turbo build` first" };
  }

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
  //
  // detached: true so killGroup in afterAll can signal the whole process
  // tree (npx → next start) — without it, only the npx wrapper gets
  // the signal and `next start` orphans on TEST_PORT across re-runs.
  server = spawn("npx", ["next", "start", "--port", String(TEST_PORT)], {
    cwd: join(import.meta.dirname, ".."),
    env: { ...process.env, ISSUECTL_DB_PATH: dbPath },
    stdio: "pipe",
    detached: true,
  });

  let serverStderr = "";
  let serverStdout = "";
  server.stderr?.on("data", (chunk: Buffer) => {
    serverStderr += chunk.toString();
  });
  server.stdout?.on("data", (chunk: Buffer) => {
    serverStdout += chunk.toString();
  });

  await waitForServer(BASE_URL, 30000).catch((err) => {
    const parts = [
      err.message,
      serverStderr ? `stderr: ${serverStderr.slice(-500)}` : null,
      serverStdout ? `stdout: ${serverStdout.slice(-500)}` : null,
    ].filter(Boolean).join(". ");
    throw new Error(parts);
  });
});

test.afterAll(async () => {
  if (server && server.pid) {
    // Sends SIGTERM/SIGKILL to the whole process group rather than just
    // the npx wrapper — matches the pattern in launch-ui.spec.ts.
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

    const swState = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return "unsupported";
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(
            "Service worker did not activate within 10s — check sw.js build output",
          )), 10000),
        ),
      ]);
      return (reg as ServiceWorkerRegistration).active ? "active" : "waiting";
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
      if (!navigator.serviceWorker.controller) {
        await Promise.race([
          new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener("controllerchange", () => resolve());
          }),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error(
              "SW never took control — does the SW call clients.claim()?",
            )), 10000),
          ),
        ]);
      }
    });

    // Go offline and reload — the cached page should be served.
    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: "domcontentloaded" });

      // The home page should render from SW cache. Assert a
      // page-specific element to distinguish from the offline fallback.
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("h1")).not.toContainText("You're offline");
    } finally {
      await context.setOffline(false);
    }
  });

  test("offline fallback page shows for unvisited routes", async ({ page, context }) => {
    // Visit the home page first to install and activate the SW.
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await Promise.race([
          new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener("controllerchange", () => resolve());
          }),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error(
              "SW never took control — does the SW call clients.claim()?",
            )), 10000),
          ),
        ]);
      }
    });

    // Go offline, then navigate to a route we never visited.
    await context.setOffline(true);
    try {
      // Navigate to an uncached route. The SW should serve offline.html.
      await page.goto(`${BASE_URL}/parse`, { waitUntil: "domcontentloaded" });

      // The offline fallback page should show.
      await expect(page.locator("h1")).toContainText("You're offline");
      await expect(page.locator(".retry")).toHaveAttribute("href", "/");
    } finally {
      await context.setOffline(false);
    }
  });
});
