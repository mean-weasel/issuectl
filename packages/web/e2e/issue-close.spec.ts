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
// mobile-ux-patterns (3851), launch-ui (3852), pwa-offline (3853),
// action-sheets (3854), create-with-repo (3855), data-freshness (3856).
const TEST_PORT = 3857;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";

// All tests run at iPhone 14 Pro dimensions — the viewport where
// SwipeRow is active and the FAB uses its compact (52px) size.
test.use({
  viewport: { width: 393, height: 852 },
  isMobile: true,
  hasTouch: true,
});

// Tests in this file pin the swipe-to-close UX introduced alongside
// CloseIssueModal. Specifically:
//
// - Swiping right on an open/running issue row reveals a "Close" button
// - Tapping that button opens CloseIssueModal (role=dialog, aria-label="Close Issue")
// - The modal's textarea has the correct placeholder
// - Issue list rows contain no checkbox SVG elements (regression guard)
// - The FAB is 52px on mobile (regression guard for compact-FAB CSS)

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

// A seeded open issue number used throughout the swipe/modal tests.
const OPEN_ISSUE_NUMBER = 42;
const OPEN_ISSUE_TITLE = "E2E issue-close: open issue for swipe test";

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

    // Seed the issues list cache so the dashboard renders an open issue
    // without needing a live GitHub API call.
    const seedIssue = {
      number: OPEN_ISSUE_NUMBER,
      title: OPEN_ISSUE_TITLE,
      body: "Created by issue-close.spec.ts",
      state: "open",
      labels: [],
      user: { login: "test-bot", avatarUrl: "" },
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: null,
      htmlUrl: `https://github.com/${TEST_OWNER}/${TEST_REPO}/issues/${OPEN_ISSUE_NUMBER}`,
    };

    db.prepare(
      "INSERT OR REPLACE INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now'))",
    ).run(
      `issues:${TEST_OWNER}/${TEST_REPO}`,
      JSON.stringify([seedIssue]),
    );

    // Seed the issue-header cache so the detail page renders without a
    // live fetch — avoids background API noise during modal tests.
    db.prepare(
      "INSERT OR REPLACE INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now'))",
    ).run(
      `issue-header:${TEST_OWNER}/${TEST_REPO}#${OPEN_ISSUE_NUMBER}`,
      JSON.stringify(seedIssue),
    );

    // Also seed the issue-content cache so the Suspense boundary resolves.
    db.prepare(
      "INSERT OR REPLACE INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now'))",
    ).run(
      `issue-content:${TEST_OWNER}/${TEST_REPO}#${OPEN_ISSUE_NUMBER}`,
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

test.beforeAll(async () => {
  const check = await canRun();
  if (!check.ok) {
    if (process.env.CI === "true") {
      throw new Error(
        `Issue-close suite cannot skip in CI: ${check.reason}. ` +
          `This suite MUST run on PRs to pin the swipe-to-close UX.`,
      );
    }
    skipReason = check.reason;
    return;
  }

  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-issue-close-"));
  dbPath = join(tmpDir, "test.db");
  createTestDb(dbPath);

  // Use an isolated .next output directory so this test server does not
  // collide with the main dev server's .next/ cache (which would cause
  // __webpack_modules__ errors from pack-file races).
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

  // 60s tolerates a cold `next dev` compile on a CI runner.
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

  // Restore tsconfig.json and next-env.d.ts that `next dev` may have
  // mutated when given a custom NEXT_DIST_DIR.
  await execFileAsync("git", [
    "checkout", "--", "packages/web/tsconfig.json", "packages/web/next-env.d.ts",
  ], { cwd: join(import.meta.dirname, "../../..") }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("did not match any")) {
      console.warn(`[issue-close afterAll] git checkout failed: ${msg}`);
    }
  });
});

// ── Swipe-to-close: row reveal ────────────────────────────────────────

test.describe("SwipeRow — swipe right reveals close button", () => {
  test("swiping right on an open-section row reveals a Close button", async ({
    page,
  }) => {
    if (skipReason) test.skip(true, skipReason);

    await page.goto(`${BASE_URL}/?section=open`);

    // Wait for the issue list to render — the seeded issue title must be visible.
    await expect(page.getByText(OPEN_ISSUE_TITLE)).toBeVisible({ timeout: 15000 });

    // Locate the SwipeRow wrapper. SwipeRow renders a <div data-swiped="idle">
    // only for open and running rows.
    const swipeWrapper = page.locator('[data-swiped]').first();
    await expect(swipeWrapper).toBeVisible();

    const box = await swipeWrapper.boundingBox();
    expect(box, "SwipeRow has no bounding box").not.toBeNull();

    // Simulate a right swipe (left-to-right) using touch events dispatched
    // directly on the wrapper. A delta of 100px exceeds the 60px threshold
    // defined in SwipeRow.tsx.
    const startX = box!.x + 30;
    const endX = box!.x + 130;
    const midY = box!.y + box!.height / 2;

    await page.evaluate(
      ({ startX, endX, midY, wrapperSelector }) => {
        const el = document.querySelector(wrapperSelector) as HTMLElement | null;
        if (!el) throw new Error("SwipeRow wrapper not found");

        const makeTouch = (x: number, y: number) =>
          new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });

        el.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [makeTouch(startX, midY)],
            changedTouches: [makeTouch(startX, midY)],
            bubbles: true,
            cancelable: true,
          }),
        );
        el.dispatchEvent(
          new TouchEvent("touchend", {
            touches: [],
            changedTouches: [makeTouch(endX, midY)],
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { startX, endX, midY, wrapperSelector: "[data-swiped]" },
    );

    // After a right-swipe the wrapper transitions to data-swiped="right"
    // and the Close button (rendered inside actionsLeft) becomes visible.
    await expect(swipeWrapper).toHaveAttribute("data-swiped", "right");
    await expect(
      swipeWrapper.getByRole("button", { name: "Close" }),
    ).toBeVisible();
  });
});

// ── Swipe-to-close: modal open ────────────────────────────────────────

test.describe("SwipeRow — tapping Close opens CloseIssueModal", () => {
  test("tapping the revealed Close button opens the close modal with a comment textarea", async ({
    page,
  }) => {
    if (skipReason) test.skip(true, skipReason);

    await page.goto(`${BASE_URL}/?section=open`);
    await expect(page.getByText(OPEN_ISSUE_TITLE)).toBeVisible({ timeout: 15000 });

    const swipeWrapper = page.locator('[data-swiped]').first();
    const box = await swipeWrapper.boundingBox();
    expect(box, "SwipeRow has no bounding box").not.toBeNull();

    const startX = box!.x + 30;
    const endX = box!.x + 130;
    const midY = box!.y + box!.height / 2;

    await page.evaluate(
      ({ startX, endX, midY, wrapperSelector }) => {
        const el = document.querySelector(wrapperSelector) as HTMLElement | null;
        if (!el) throw new Error("SwipeRow wrapper not found");

        const makeTouch = (x: number, y: number) =>
          new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });

        el.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [makeTouch(startX, midY)],
            changedTouches: [makeTouch(startX, midY)],
            bubbles: true,
            cancelable: true,
          }),
        );
        el.dispatchEvent(
          new TouchEvent("touchend", {
            touches: [],
            changedTouches: [makeTouch(endX, midY)],
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { startX, endX, midY, wrapperSelector: "[data-swiped]" },
    );

    // Tap the revealed Close button.
    await swipeWrapper.getByRole("button", { name: "Close" }).click();

    // CloseIssueModal renders as a dialog with aria-label="Close Issue".
    const modal = page.getByRole("dialog", { name: "Close Issue" });
    await expect(modal).toBeVisible();

    // The modal must contain a textarea for an optional closing comment.
    const textarea = modal.locator("textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveAttribute(
      "placeholder",
      /closing comment/i,
    );
  });
});

// ── Detail page close modal ───────────────────────────────────────────

test.describe("CloseIssueModal — detail page", () => {
  test("close action on detail page opens modal with comment textarea", async ({
    page,
  }) => {
    if (skipReason) test.skip(true, skipReason);

    const issueUrl = `${BASE_URL}/issues/${TEST_OWNER}/${TEST_REPO}/${OPEN_ISSUE_NUMBER}`;
    await page.goto(issueUrl);

    // The detail page should render for the seeded issue.
    // The action sheet handle is visible for open issues.
    const handle = page.getByRole("button", { name: /Open Actions/ });
    await expect(handle).toBeVisible({ timeout: 15000 });

    // Open the action sheet.
    await handle.click();
    const sheet = page.getByRole("dialog", { name: "issue actions" });
    await expect(sheet).toBeVisible();

    // Click the close action inside the sheet.
    await sheet.getByRole("button", { name: "Close issue" }).click();

    // CloseIssueModal should appear with role=dialog and aria-label="Close Issue".
    const modal = page.getByRole("dialog", { name: "Close Issue" });
    await expect(modal).toBeVisible();

    // Verify the comment textarea is present with the correct placeholder.
    const textarea = modal.locator("textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveAttribute(
      "placeholder",
      /closing comment/i,
    );
  });
});

// ── No checkbox SVG in issue rows ─────────────────────────────────────

test.describe("Issue list rows — no checkboxes", () => {
  test("open-section issue rows do not contain checkbox SVG elements", async ({
    page,
  }) => {
    if (skipReason) test.skip(true, skipReason);

    await page.goto(`${BASE_URL}/?section=open`);
    await expect(page.getByText(OPEN_ISSUE_TITLE)).toBeVisible({ timeout: 15000 });

    // Count any SVG elements with role="checkbox" or type="checkbox" inputs
    // inside list rows. There should be none — row selection via checkboxes
    // was never part of the design and their absence prevents accidental
    // inclusion via component imports.
    const checkboxInputs = page.locator('[data-section="open"] input[type="checkbox"]');
    await expect(checkboxInputs).toHaveCount(0);

    // Also guard against SVG-based checkbox icons that might render with
    // a recognisable aria role.
    const checkboxRoles = page.locator('[data-section="open"] [role="checkbox"]');
    await expect(checkboxRoles).toHaveCount(0);
  });
});

// ── FAB sizing on mobile ──────────────────────────────────────────────

test.describe("FAB — mobile sizing", () => {
  test("FAB is 52x52 on a 393-wide mobile viewport", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);

    // Navigate to the issues tab — the FAB only renders there.
    await page.goto(`${BASE_URL}/`);
    await expect(page.locator("h1")).toBeVisible({ timeout: 15000 });

    const fab = page.locator('[aria-label="Create a new draft"]');
    await expect(fab).toBeVisible();

    const box = await fab.boundingBox();
    expect(box, "FAB has no bounding box").not.toBeNull();

    expect(
      box!.width,
      `FAB width ${box!.width}px — expected 52px (mobile compact size)`,
    ).toBeCloseTo(52, 0);

    expect(
      box!.height,
      `FAB height ${box!.height}px — expected 52px (mobile compact size)`,
    ).toBeCloseTo(52, 0);
  });
});
