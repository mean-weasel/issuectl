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
// mobile-ux-patterns (3851), launch-ui (3852), pwa-offline (3853).
// launch-flow reuses the default :3847 and is macOS-only/never run in CI.
const TEST_PORT = 3854;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";

// FilterEdgeSwipe is hidden when both min-width >= 768px AND the pointer
// supports hover (CSS media: hover:hover). Use a mobile viewport with
// isMobile:true so both conditions are unmet and the handle is visible.
test.use({
  viewport: { width: 393, height: 852 },
  isMobile: true,
  hasTouch: true,
});

// Pins the navigation behavior after destructive actions performed via
// action sheets (swipe-up → Sheet → ConfirmDialog). Specifically:
//
// - Draft delete navigates to /?section=unassigned
// - Issue close navigates to /?section=shipped
// - Cancelling either confirmation stays on the detail page
//
// These were broken in an earlier PR where router.refresh() was used
// instead of router.push(), leaving the user stranded on a stale
// detail page after a successful mutation.

async function canRun(): Promise<{ ok: boolean; reason?: string }> {
  try {
    await execFileAsync("gh", ["auth", "token"]);
    return { ok: true };
  } catch {
    return { ok: false, reason: "gh auth not configured" };
  }
}

async function createTestIssue(title: string): Promise<number> {
  const { stdout } = await execFileAsync("gh", [
    "issue",
    "create",
    "--repo",
    `${TEST_OWNER}/${TEST_REPO}`,
    "--title",
    title,
    "--body",
    "Auto-created by action-sheets.spec.ts — safe to delete.",
  ]);
  const match = stdout.trim().match(/\/issues\/(\d+)$/);
  if (!match) {
    throw new Error(`Could not parse issue number from gh output: ${stdout}`);
  }
  return Number(match[1]);
}

const STDERR_BUFFER_MAX_CHUNKS = 40;
const serverStderrChunks: string[] = [];

const DRAFT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const DRAFT_TITLE = "E2E test draft for deletion";
const CANCEL_DRAFT_ID = "11111111-2222-3333-4444-555555555555";
const CANCEL_DRAFT_TITLE = "Draft for cancel test";

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

    // Seed drafts for the delete and cancel-delete tests
    const now = Date.now();
    const insertDraft = db.prepare(
      `INSERT INTO drafts (id, title, body, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insertDraft.run(DRAFT_ID, DRAFT_TITLE, "Body for e2e test", "normal", now, now);
    insertDraft.run(CANCEL_DRAFT_ID, CANCEL_DRAFT_TITLE, "", "normal", now, now);

    // Seed issues list cache so the index page renders from cache after
    // navigation, without needing a live GitHub fetch for the issues list.
    db.prepare(
      "INSERT INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now'))",
    ).run(`issues:${TEST_OWNER}/${TEST_REPO}`, JSON.stringify([]));
  } finally {
    db.close();
  }
}

/** Seed the issue-header cache so the detail page renders without a GitHub fetch. */
function seedIssueCache(dbPath: string, issueNumber: number, title: string): void {
  const db = new Database(dbPath);
  try {
    const issue = {
      number: issueNumber,
      title,
      body: "Created by e2e test",
      state: "open",
      labels: [],
      user: { login: "test-bot", avatarUrl: "" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: null,
      htmlUrl: `https://github.com/${TEST_OWNER}/${TEST_REPO}/issues/${issueNumber}`,
    };
    db.prepare(
      "INSERT OR REPLACE INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now'))",
    ).run(
      `issue-header:${TEST_OWNER}/${TEST_REPO}#${issueNumber}`,
      JSON.stringify(issue),
    );

    // Also seed the issue-content cache so the Suspense boundary resolves
    // without a live fetch — avoids background API noise during the test.
    db.prepare(
      "INSERT OR REPLACE INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now'))",
    ).run(
      `issue-content:${TEST_OWNER}/${TEST_REPO}#${issueNumber}`,
      JSON.stringify({ comments: [], linkedPRs: [] }),
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
let closeIssueNumber: number;
let cancelIssueNumber: number;

test.beforeAll(async () => {
  const check = await canRun();
  if (!check.ok) {
    if (process.env.CI === "true") {
      throw new Error(
        `Action sheets suite cannot skip in CI: ${check.reason}. ` +
          `This suite MUST run on PRs to pin post-mutation navigation.`,
      );
    }
    skipReason = check.reason;
    return;
  }

  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-action-sheets-"));
  dbPath = join(tmpDir, "test.db");
  createTestDb(dbPath);

  // Create fresh GitHub issues for the close and cancel-close tests in
  // parallel — each run gets its own issues so closing is idempotent.
  const [closeNum, cancelNum] = await Promise.all([
    createTestIssue("E2E action-sheets: close test"),
    createTestIssue("E2E action-sheets: cancel close test"),
  ]);
  closeIssueNumber = closeNum;
  cancelIssueNumber = cancelNum;

  seedIssueCache(dbPath, closeIssueNumber, "E2E action-sheets: close test");
  seedIssueCache(dbPath, cancelIssueNumber, "E2E action-sheets: cancel close test");

  // Use an isolated .next output directory so the test dev server does
  // not collide with the main dev server's .next/ cache (which would
  // cause __webpack_modules__[moduleId] errors from pack-file races).
  const distDir = join(tmpDir, ".next-test");

  server = spawn("npx", ["next", "dev", "--port", String(TEST_PORT)], {
    cwd: join(import.meta.dirname, ".."),
    env: {
      ...process.env,
      ISSUECTL_DB_PATH: dbPath,
      NEXT_DIST_DIR: distDir,
      // Prevent `next dev` from writing the temp distDir's types path
      // into the project's tsconfig.json include array.
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

  // `next dev` with a custom distDir writes the temp types path into
  // tsconfig.json and next-env.d.ts. Restore both so the working tree
  // stays clean after the test run.
  await execFileAsync("git", [
    "checkout", "--", "packages/web/tsconfig.json", "packages/web/next-env.d.ts",
  ], { cwd: join(import.meta.dirname, "../../..") }).catch((err: unknown) => {
    // git exits non-zero when there is nothing to revert — expected in CI.
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("did not match any")) {
      console.warn(`[action-sheets afterAll] git checkout failed (working tree may be dirty): ${msg}`);
    }
  });

  // Close both test issues so they don't litter the test repo.
  // closeIssueNumber may already be closed by the test — that's fine.
  const issuesToClose = [closeIssueNumber, cancelIssueNumber].filter(Boolean);
  await Promise.allSettled(
    issuesToClose.map((num) =>
      execFileAsync("gh", [
        "issue", "close", String(num),
        "--repo", `${TEST_OWNER}/${TEST_REPO}`,
      ]).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[action-sheets afterAll] Could not close test issue #${num}: ${msg}`);
      }),
    ),
  );
});

// ── Draft delete tests ────────────────────────────────────────────────

test.describe("draft delete — action sheet flow", () => {
  test("deleting a draft navigates to /?section=unassigned", async ({
    page,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/drafts/${DRAFT_ID}`);

    // Verify the draft detail page rendered
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      DRAFT_TITLE,
    );

    // Open the action sheet via the bottom handle
    await page.getByRole("button", { name: /Open Actions/ }).click();

    // Sheet dialog opens — click the delete action
    const sheet = page.getByRole("dialog", { name: "draft actions" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Delete draft" }).click();

    // ConfirmDialog replaces the sheet
    const confirm = page.getByRole("dialog", { name: "Delete Draft" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("cannot be recovered");

    // Confirm the deletion
    await confirm.getByRole("button", { name: "Delete Draft" }).click();

    // Should navigate to the index page with unassigned section active
    await page.waitForURL((url) => {
      const u = new URL(url);
      return u.pathname === "/" && u.searchParams.get("section") === "unassigned";
    }, { timeout: 15000 });
  });

  test("cancelling draft delete stays on the detail page", async ({
    page,
  }) => {
    if (skipReason) test.skip(true, skipReason);

    await page.goto(`${BASE_URL}/drafts/${CANCEL_DRAFT_ID}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      CANCEL_DRAFT_TITLE,
    );

    // Open action sheet → click delete → cancel
    await page.getByRole("button", { name: /Open Actions/ }).click();
    const sheet = page.getByRole("dialog", { name: "draft actions" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Delete draft" }).click();

    const confirm = page.getByRole("dialog", { name: "Delete Draft" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();

    // Dialog dismissed, still on the draft detail page
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(page.url()).toContain(`/drafts/${CANCEL_DRAFT_ID}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      CANCEL_DRAFT_TITLE,
    );
  });
});

// ── Issue close tests ─────────────────────────────────────────────────

test.describe("issue close — action sheet flow", () => {
  test("closing an issue navigates to /?section=shipped", async ({
    page,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    const issueUrl = `${BASE_URL}/issues/${TEST_OWNER}/${TEST_REPO}/${closeIssueNumber}`;
    await page.goto(issueUrl);

    // Verify the issue detail page rendered with the action sheet handle
    // (only shown for open issues)
    const handle = page.getByRole("button", { name: /Open Actions/ });
    await expect(handle).toBeVisible({ timeout: 15000 });

    // Open the action sheet
    await handle.click();
    const sheet = page.getByRole("dialog", { name: "issue actions" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Close issue" }).click();

    // ConfirmDialog appears
    const confirm = page.getByRole("dialog", { name: "Close Issue" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("reopened later from GitHub");

    // Confirm the close
    await confirm.getByRole("button", { name: "Close Issue" }).click();

    // Should navigate to the index page with shipped section active.
    // The GitHub API call takes a moment, so allow a generous timeout.
    await page.waitForURL((url) => {
      const u = new URL(url);
      return u.pathname === "/" && u.searchParams.get("section") === "shipped";
    }, { timeout: 30000 });
  });

  test("cancelling issue close stays on the detail page", async ({
    page,
  }) => {
    if (skipReason) test.skip(true, skipReason);

    const issueUrl = `${BASE_URL}/issues/${TEST_OWNER}/${TEST_REPO}/${cancelIssueNumber}`;
    await page.goto(issueUrl);

    const handle = page.getByRole("button", { name: /Open Actions/ });
    await expect(handle).toBeVisible({ timeout: 15000 });

    // Open action sheet → click close → cancel
    await handle.click();
    const sheet = page.getByRole("dialog", { name: "issue actions" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Close issue" }).click();

    const confirm = page.getByRole("dialog", { name: "Close Issue" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();

    // Dialog dismissed, still on the issue detail page
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(page.url()).toContain(
      `/issues/${TEST_OWNER}/${TEST_REPO}/${cancelIssueNumber}`,
    );
  });
});
