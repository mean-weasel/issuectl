import { test, expect } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { initSchema, runMigrations } from "@issuectl/core";

const execFileAsync = promisify(execFile);

// Distinct from mobile-ux-patterns (3851) / audit-verification (3850)
// / quick-create (3848) / launch-flow (3847) so all specs can coexist.
const TEST_PORT = 3852;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";
const TEST_ISSUE = 1;
const TEST_CODEX_ISSUE = 2;
const TEST_DEPLOYMENT_ID = 1;
const TEST_CODEX_DEPLOYMENT_ID = 10_002;

// CI-friendly UI tests for the launch progress page. Seeds a deployment
// row directly so the page renders without spawning a real ttyd process —
// the existing launch-flow.spec.ts covers the full ttyd-spawn path but
// is gated on macOS + ttyd + gh auth and only runs locally.
//
// What this spec pins (R3-R7 audit wins):
// - Launch progress page renders given a valid deployment
// - DetailTopBar back link is present and 44x44
// - LaunchProgress.steps wrapper has role="status" + aria-live="polite"
// - .numActive spinner has distinct border colors (R5 fix)
// - LaunchProgressPoller fires router.refresh() within one poll interval
// - Polling pauses when document.hidden is true (R7 verified, now CI-pinned)

const POLL_INTERVAL_MS = 5000;
const POLL_WAIT_MS = POLL_INTERVAL_MS + 3000;

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

// Build the test DB at the current schema version using the same
// initSchema + runMigrations functions the running dev server uses. This
// avoids drift between hand-rolled CREATE TABLE statements and the real
// schema (the dev server's CREATE TABLE IF NOT EXISTS would otherwise
// no-op on pre-existing-but-stale tables, leaving columns missing).
//
// With the schema fully set up before the server starts, the deployment
// row can be inserted directly with state='active' and the CHECK
// constraint is satisfied — no migration timing dance required.
function createTestDb(dbPath: string): void {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  try {
    initSchema(db);
    runMigrations(db);

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

    const repo = db
      .prepare("SELECT id FROM repos WHERE owner = ? AND name = ?")
      .get(TEST_OWNER, TEST_REPO) as { id: number };

    const insertDeployment = db.prepare(
      `INSERT INTO deployments
       (id, repo_id, issue_number, branch_name, workspace_mode, workspace_path, state, agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    insertDeployment.run(
      TEST_DEPLOYMENT_ID,
      repo.id,
      TEST_ISSUE,
      `issue-${TEST_ISSUE}-test`,
      "worktree",
      "/tmp/test-workspace",
      "active",
      "claude",
    );

    insertDeployment.run(
      TEST_CODEX_DEPLOYMENT_ID,
      repo.id,
      TEST_CODEX_ISSUE,
      `issue-${TEST_CODEX_ISSUE}-codex-test`,
      "worktree",
      "/tmp/test-codex-workspace",
      "active",
      "codex",
    );
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

let tmpDir: string;
let dbPath: string;
let server: ChildProcess;
let skipReason: string | undefined;
const LAUNCH_URL = `${BASE_URL}/launch/${TEST_OWNER}/${TEST_REPO}/${TEST_ISSUE}?deploymentId=${TEST_DEPLOYMENT_ID}`;
const CODEX_LAUNCH_URL = `${BASE_URL}/launch/${TEST_OWNER}/${TEST_REPO}/${TEST_CODEX_ISSUE}?deploymentId=${TEST_CODEX_DEPLOYMENT_ID}`;

test.beforeAll(async () => {
  const check = await canRun();
  if (!check.ok) {
    if (process.env.CI === "true") {
      throw new Error(
        `Launch UI suite cannot skip in CI: ${check.reason}. ` +
          `This suite MUST run on PRs to pin launch-page regressions.`,
      );
    }
    skipReason = check.reason;
    return;
  }

  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-launch-ui-"));
  dbPath = join(tmpDir, "test.db");
  createTestDb(dbPath);

  // detached: true so killGroup in afterAll can signal the whole process
  // tree (npx → next dev → swc workers) — without it, only the npx wrapper
  // gets the signal and `next dev` orphans on TEST_PORT across re-runs.
  //
  // NOTE: this spec MUST run as its own playwright invocation, not in
  // the same process as mobile-ux-patterns.spec.ts. Two `next dev`
  // processes against the same packages/web/.next/cache/webpack/ collide
  // on pack file rename even when their lifetimes don't overlap. The CI
  // workflow runs this spec in a dedicated step.
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

test.afterEach(async ({}, testInfo) => {
  // On test failure, attach the rolling stderr buffer so test reports
  // include server context. Without this, a runtime 500 mid-test surfaces
  // as "element not found" with no hint of what went wrong on the server.
  if (testInfo.status !== testInfo.expectedStatus && serverStderrChunks.length > 0) {
    await testInfo.attach("server-stderr", {
      body: serverStderrChunks.join("").slice(-2000),
      contentType: "text/plain",
    });
  }
});

test.afterAll(async () => {
  if (server && server.pid) {
    // Sends SIGTERM/SIGKILL to the whole process group rather than just
    // the npx wrapper — without detached: true on spawn this would orphan
    // `next dev` on TEST_PORT across re-runs.
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

test.describe("launch UI — seeded deployment renders", () => {
  test("page renders with correct heading for active deployment", async ({
    page,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(LAUNCH_URL);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Launching",
    );
  });

  test("Claude deployment renders Claude launch copy", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(LAUNCH_URL);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Launching Claude Code...",
    );
    await expect(page.getByText("Claude Code running")).toBeVisible();
  });

  test("Codex deployment renders Codex launch copy", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(CODEX_LAUNCH_URL);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Launching Codex...",
    );
    await expect(page.getByText("Codex running")).toBeVisible();
  });

  test("DetailTopBar back link points to the issue", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(LAUNCH_URL);
    const back = page.getByRole("link", { name: "Back" });
    await expect(back).toBeVisible();
    const href = await back.getAttribute("href");
    expect(href).toBe(`/issues/${TEST_OWNER}/${TEST_REPO}/${TEST_ISSUE}`);
    const box = await back.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test("LaunchProgress steps wrapper has aria-live status", async ({
    page,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(LAUNCH_URL);
    const steps = page.locator('[role="status"][aria-live="polite"]');
    await expect(steps).toHaveCount(1);
  });

  test("active spinner has distinct base + top border colors", async ({
    page,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(LAUNCH_URL);
    // .numActive is the only element with a spin animation; the R5 fix
    // gave it a paper-accent top border on a paper-accent-soft base so
    // the rotation is visually detectable.
    const colors = await page.evaluate(() => {
      const el = document.querySelector(
        '[class*="numActive"]',
      ) as HTMLElement | null;
      if (!el) return null;
      const styles = getComputedStyle(el);
      return {
        top: styles.borderTopColor,
        left: styles.borderLeftColor,
      };
    });
    expect(colors, "no .numActive element on launch page").not.toBeNull();
    expect(
      colors!.top,
      `spinner top border ${colors!.top} matches base ${colors!.left} — R5 contrast fix has regressed`,
    ).not.toBe(colors!.left);
  });
});

test.describe("launch UI — poller fires (R7 verified, CI pinned)", () => {
  test("RSC refresh fires within one poll interval", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);

    // waitForRequest returns as soon as the first matching request fires
    // — faster on fast runners, same upper bound as a fixed timeout.
    const rscPromise = page.waitForRequest(
      (req) =>
        req.url().includes(`/launch/${TEST_OWNER}`) &&
        req.url().includes("_rsc="),
      { timeout: POLL_WAIT_MS },
    );

    await page.goto(LAUNCH_URL);
    await rscPromise;
  });

  test("polling pauses while document.hidden is true", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);

    await page.goto(LAUNCH_URL);
    // Wait for the page to settle so the poller's useEffect has mounted
    // and the React hydration's in-flight requests have drained — without
    // this, an in-flight request from hydration could land in the post-
    // hidden window and flake the assertion.
    await page.waitForLoadState("networkidle");

    // Flip to hidden BEFORE attaching the listener, so the counter only
    // captures requests that fire AFTER visibilitychange — anything before
    // is irrelevant to the pause assertion.
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        value: true,
        configurable: true,
      });
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    let rscRequests = 0;
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes(`/launch/${TEST_OWNER}`) && url.includes("_rsc=")) {
        rscRequests++;
      }
    });

    await page.waitForTimeout(POLL_WAIT_MS);
    expect(
      rscRequests,
      `expected 0 RSC refreshes while hidden; observed ${rscRequests}`,
    ).toBe(0);
  });
});
