import { test, expect } from "@playwright/test";
import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { initSchema, runMigrations, tmuxSessionName } from "@issuectl/core";

/**
 * E2E test: terminal session persistence across panel close and navigation.
 *
 * Exercises the full browser flow:
 *   1. Issue detail page renders with "Open Terminal" button
 *   2. Click → terminal panel opens (ensureTtyd confirms ttyd alive)
 *   3. Close panel, then explicitly kill ttyd (simulates the -q exit-on-disconnect race)
 *   4. Navigate to list page ("/") and back to issue detail
 *   5. Click "Open Terminal" again → ensureTtyd respawns ttyd → panel opens
 *
 * Requirements: macOS, tmux, ttyd, gh auth. Skipped otherwise.
 */

const execFileAsync = promisify(execFile);

// Unique ports to avoid collisions with other E2E specs.
const DEV_PORT = 3859;
const TTYD_PORT = 7793;
const BASE_URL = `http://localhost:${DEV_PORT}`;

const TEST_OWNER = "test-owner";
const TEST_REPO = "test-repo";
const TEST_ISSUE = 1;

// Must match what the server's reconciler computes so it finds the
// session alive and does not end the deployment on startup.
const SESSION_NAME = tmuxSessionName(TEST_REPO, TEST_ISSUE);

async function canRun(): Promise<{ ok: boolean; reason?: string }> {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "Not macOS" };
  }
  for (const bin of ["ttyd", "tmux"]) {
    try {
      await execFileAsync("which", [bin]);
    } catch {
      return { ok: false, reason: `${bin} not installed` };
    }
  }
  try {
    await execFileAsync("gh", ["auth", "token"]);
  } catch {
    return { ok: false, reason: "gh auth not configured" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// tmux / ttyd helpers
// ---------------------------------------------------------------------------

function cleanupTmuxSession(): void {
  try {
    execFileSync("tmux", ["kill-session", "-t", SESSION_NAME], { stdio: "ignore" });
  } catch { /* may not exist */ }
}

function spawnTtyd(): ChildProcess {
  const proc = spawn(
    "ttyd",
    ["-W", "-i", "127.0.0.1", "-p", String(TTYD_PORT), "-q",
     "tmux", "attach-session", "-t", SESSION_NAME],
    { detached: true, stdio: "ignore" },
  );
  proc.on("error", (err) => {
    console.error(`ttyd spawn error: ${err.message}`);
  });
  proc.unref();
  return proc;
}

function isTtydAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but is owned by another user — alive.
    if ((err as NodeJS.ErrnoException).code === "EPERM") return true;
    return false;
  }
}

function killPid(pid: number): void {
  try { process.kill(pid, "SIGTERM"); } catch { /* already dead */ }
}

/** Kill any process listening on TTYD_PORT — covers respawned ttyd.
 *  Uses `-sTCP:LISTEN` to only match the listener, not clients that
 *  happen to have outbound connections to this port (e.g. the Next.js
 *  dev server's HTTP proxy connection pool). */
function cleanupTtydPort(): void {
  try {
    const output = execFileSync(
      "lsof", ["-ti", `tcp:${TTYD_PORT}`, "-sTCP:LISTEN"],
      { encoding: "utf-8" },
    );
    for (const line of output.trim().split("\n")) {
      const pid = Number(line.trim());
      if (pid > 0) killPid(pid);
    }
  } catch { /* no process on port */ }
}

/**
 * Reset tmux/ttyd/DB state so the next test starts from a known-good
 * baseline: live tmux session, live ttyd, active deployment row.
 * Called at the start of each test after the first.
 */
async function resetTestState(): Promise<void> {
  cleanupTtydPort();
  cleanupTmuxSession();

  execFileSync("tmux", [
    "new-session", "-d", "-s", SESSION_NAME, "-x", "120", "-y", "40",
    "bash -c 'echo TERMINAL_PERSIST_TEST; sleep 600'",
  ]);

  ttydProc = spawnTtyd();
  await new Promise((r) => setTimeout(r, 1000));

  if (!ttydProc?.pid || !isTtydAlive(ttydProc.pid)) {
    throw new Error("ttyd failed to start during state reset");
  }

  const db = new Database(dbPath);
  try {
    const result = db.prepare(
      "UPDATE deployments SET ended_at = NULL, ttyd_port = ?, ttyd_pid = ? WHERE id = 1",
    ).run(TTYD_PORT, ttydProc.pid);
    if (result.changes === 0) {
      throw new Error("resetTestState: deployment id=1 missing from DB — cannot reset");
    }
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// DB seeding
// ---------------------------------------------------------------------------

/** Fake GitHubIssue that satisfies the page's rendering requirements. */
const FAKE_ISSUE = {
  number: TEST_ISSUE,
  title: "Terminal persistence test issue",
  body: "Synthetic issue for E2E testing.",
  state: "open",
  labels: [],
  user: { login: "test-user", avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4" },
  commentCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  closedAt: null,
  htmlUrl: `https://github.com/${TEST_OWNER}/${TEST_REPO}/issues/${TEST_ISSUE}`,
};

function createTestDb(dbPath: string, ttydPid: number): void {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  try {
    initSchema(db);
    runMigrations(db);

    // Settings — long cache TTL so background revalidation never fires.
    const insertSetting = db.prepare(
      "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
    );
    for (const [key, value] of [
      ["branch_pattern", "issue-{number}-{slug}"],
      ["cache_ttl", "99999"],
      ["worktree_dir", "~/.issuectl/worktrees/"],
    ] as const) {
      insertSetting.run(key, value);
    }

    // Repo
    db.prepare("INSERT OR IGNORE INTO repos (owner, name) VALUES (?, ?)").run(
      TEST_OWNER,
      TEST_REPO,
    );
    const repo = db
      .prepare("SELECT id FROM repos WHERE owner = ? AND name = ?")
      .get(TEST_OWNER, TEST_REPO) as { id: number };

    // Active deployment with real ttyd PID and port
    db.prepare(
      `INSERT OR IGNORE INTO deployments
       (id, repo_id, issue_number, branch_name, workspace_mode, workspace_path, state, ttyd_port, ttyd_pid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(1, repo.id, TEST_ISSUE, `issue-${TEST_ISSUE}-test`, "worktree", "/tmp/test-workspace", "active", TTYD_PORT, ttydPid);

    // Pre-seed all cache entries so page renders without GitHub API calls.
    const insertCache = db.prepare(
      "INSERT INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now'))",
    );

    // Issue header (detail page above-the-fold)
    insertCache.run(
      `issue-header:${TEST_OWNER}/${TEST_REPO}#${TEST_ISSUE}`,
      JSON.stringify(FAKE_ISSUE),
    );

    // Issue content (detail page streaming section)
    insertCache.run(
      `issue-content:${TEST_OWNER}/${TEST_REPO}#${TEST_ISSUE}`,
      JSON.stringify({ comments: [], linkedPRs: [] }),
    );

    // Issues list (list page)
    insertCache.run(
      `issues:${TEST_OWNER}/${TEST_REPO}`,
      JSON.stringify([FAKE_ISSUE]),
    );

    // Pulls list (list page)
    insertCache.run(
      `pulls-open:${TEST_OWNER}/${TEST_REPO}`,
      JSON.stringify([]),
    );

    // Current user (avoids /user API call)
    insertCache.run("current-user", JSON.stringify("test-user"));
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Server helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const STDERR_BUFFER_MAX_CHUNKS = 40;
const serverStderrChunks: string[] = [];

let tmpDir: string;
let dbPath: string;
let server: ChildProcess;
let ttydProc: ChildProcess | null = null;
let skipReason: string | undefined;

const ISSUE_URL = `${BASE_URL}/issues/${TEST_OWNER}/${TEST_REPO}/${TEST_ISSUE}`;

test.beforeAll(async () => {
  const check = await canRun();
  if (!check.ok) {
    skipReason = check.reason;
    return;
  }

  // 1. Clean up any leftover state from a prior interrupted run.
  cleanupTtydPort();
  cleanupTmuxSession();

  // 2. Create a tmux session with a long-running process.
  execFileSync("tmux", [
    "new-session", "-d", "-s", SESSION_NAME, "-x", "120", "-y", "40",
    "bash -c 'echo TERMINAL_PERSIST_TEST; sleep 600'",
  ]);

  // 3. Spawn ttyd with -q (exits when last WS client disconnects).
  ttydProc = spawnTtyd();
  await new Promise((r) => setTimeout(r, 1000));

  if (!ttydProc.pid || !isTtydAlive(ttydProc.pid)) {
    cleanupTmuxSession();
    throw new Error("ttyd failed to start");
  }

  // 4. Create test DB seeded with the real ttyd PID.
  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-persist-"));
  dbPath = join(tmpDir, "test.db");
  createTestDb(dbPath, ttydProc.pid);

  // 5. Start Next.js dev server on unique port.
  server = spawn("npx", ["next", "dev", "--port", String(DEV_PORT)], {
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

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && serverStderrChunks.length > 0) {
    await testInfo.attach("server-stderr", {
      body: serverStderrChunks.join("").slice(-2000),
      contentType: "text/plain",
    });
  }
});

test.afterAll(async () => {
  // Kill server process group
  if (server?.pid) {
    const killGroup = (signal: NodeJS.Signals) => {
      try { process.kill(-server.pid!, signal); } catch { /* already dead */ }
    };
    const killTimeout = setTimeout(() => killGroup("SIGKILL"), 5000);
    killGroup("SIGTERM");
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) { resolve(); return; }
      server.on("close", () => resolve());
    });
    clearTimeout(killTimeout);
  }

  // Kill any ttyd on the test port (includes respawned instances)
  cleanupTtydPort();

  // Kill tmux session
  cleanupTmuxSession();

  // Remove temp dir
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("terminal persistence across panel close and navigation", () => {
  test("ttyd respawns after close+navigate and terminal reopens", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);

    // ── Step 1: Navigate to issue detail page ───────────────────────
    await page.goto(ISSUE_URL);
    const openBtn = page.getByRole("button", { name: "Open Terminal" });
    await expect(openBtn).toBeVisible({ timeout: 30000 });

    // ── Step 2: Open terminal panel ─────────────────────────────────
    await openBtn.click();

    // Wait for the terminal panel to open (data-open="true") and the
    // iframe to appear. The iframe's src targets /api/terminal/{port}/.
    const panel = page.locator('[data-open="true"] iframe[title*="Terminal"]');
    await expect(panel).toBeVisible({ timeout: 10000 });

    // ── Step 3: Close panel and kill ttyd ────────────────────────────
    // Close the panel to disconnect the WebSocket client. Then explicitly
    // kill ttyd so the respawn path is exercised deterministically — we
    // don't rely on the non-deterministic timing of -q exit-on-disconnect.
    const closeBtn = page.getByRole("button", { name: "Close terminal" });
    await closeBtn.click();

    // Verify panel is closed
    await expect(panel).not.toBeVisible();

    // Kill ttyd to simulate the -q exit-on-disconnect that would happen
    // naturally (but with unpredictable timing).
    // Hard assertion: ttydProc.pid must exist — setup throws if ttyd failed.
    expect(ttydProc?.pid).toBeDefined();
    const ttydPid = ttydProc!.pid!;
    killPid(ttydPid);

    // Wait for ttyd to actually die
    const deadline = Date.now() + 5000;
    while (isTtydAlive(ttydPid) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(isTtydAlive(ttydPid)).toBe(false);

    // ── Step 4: Navigate away and back ──────────────────────────────
    await page.goto(BASE_URL);

    // Navigate back to the issue detail page
    await page.goto(ISSUE_URL);
    await expect(openBtn).toBeVisible({ timeout: 30000 });

    // ── Step 5: Reopen terminal — ensureTtyd should respawn ─────────
    // The same locators re-evaluate against the new DOM (Playwright
    // locators are lazy). ensureTtyd detects dead ttyd + live tmux,
    // respawns, and returns the port so the panel opens.
    await openBtn.click();
    await expect(panel).toBeVisible({ timeout: 15000 });
  });

  test("End Session button ends deployment and removes terminal UI", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await resetTestState();

    await page.goto(ISSUE_URL);
    const activeBanner = page.getByText("Claude Code session active");
    await expect(activeBanner).toBeVisible({ timeout: 30000 });

    // Open terminal panel
    const openBtn = page.getByRole("button", { name: "Open Terminal" });
    await openBtn.click();
    const panel = page.locator('[data-open="true"] iframe[title*="Terminal"]');
    await expect(panel).toBeVisible({ timeout: 10000 });

    // Click "End Session" inside the panel (scoped to avoid the banner's button)
    const endBtn = page.locator('[data-open="true"]').getByRole("button", { name: "End Session" });
    await endBtn.click();

    // endSession kills ttyd + tmux, ends deployment, then onClose() + router.refresh().
    // Panel closes and the active banner disappears once the page re-renders.
    await expect(panel).not.toBeVisible({ timeout: 10000 });
    await expect(activeBanner).not.toBeVisible({ timeout: 10000 });
  });

  test("Open Terminal when both ttyd and tmux are dead ends deployment", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await resetTestState();

    await page.goto(ISSUE_URL);
    const activeBanner = page.getByText("Claude Code session active");
    await expect(activeBanner).toBeVisible({ timeout: 30000 });

    // Kill both ttyd and tmux before clicking
    cleanupTtydPort();
    cleanupTmuxSession();

    // Click "Open Terminal" — ensureTtyd detects both dead, calls
    // coreEndDeployment, returns { alive: false }. handleOpen triggers
    // router.refresh() and the page re-renders without the deployment.
    const openBtn = page.getByRole("button", { name: "Open Terminal" });
    await openBtn.click();
    await expect(activeBanner).not.toBeVisible({ timeout: 15000 });
  });

  test("health check polling detects dead session and closes panel", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await resetTestState();

    await page.goto(ISSUE_URL);
    const activeBanner = page.getByText("Claude Code session active");
    await expect(activeBanner).toBeVisible({ timeout: 30000 });

    // Open terminal panel
    const openBtn = page.getByRole("button", { name: "Open Terminal" });
    await openBtn.click();
    const panel = page.locator('[data-open="true"] iframe[title*="Terminal"]');
    await expect(panel).toBeVisible({ timeout: 10000 });

    // Kill tmux — this is the liveness signal. ttyd may still be alive
    // but checkSessionAlive uses tmux, not ttyd, as the source of truth.
    cleanupTmuxSession();

    // The health check fires every 10s. When it detects the dead session
    // it ends the deployment, closes the panel, and refreshes the page.
    // Allow up to 20s (two polling cycles) for the detection.
    await expect(panel).not.toBeVisible({ timeout: 20000 });
    await expect(activeBanner).not.toBeVisible({ timeout: 5000 });
  });
});
