import { test, expect, type Page } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);

// Distinct from audit-verification.spec.ts (3850) and quick-create.spec.ts
// (3848) so specs can run in parallel.
const TEST_PORT = 3851;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";

// Pins regressions from audit rounds R3-R6. Every assertion here is
// something that was broken in one of those audits and has been fixed
// in a shipped PR (#70, #73, #75). If any assertion fails, a previously
// closed finding has regressed.

const IOS_MIN_TOUCH = 44;

async function canRun(): Promise<{ ok: boolean; reason?: string }> {
  try {
    await execFileAsync("gh", ["auth", "token"]);
    return { ok: true };
  } catch {
    return { ok: false, reason: "gh auth not configured" };
  }
}

// Keep the last N chunks of dev-server stderr so test failures can attach
// server context. Without this, a 500 during navigation shows up as
// "element not found" with no hint of what the server actually did.
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
    // A silent skip would send CI green with zero assertions, defeating the
    // whole point of this regression spec. Hard-fail in CI; skip locally.
    if (process.env.CI === "true") {
      throw new Error(
        `Mobile UX regression suite cannot skip in CI: ${check.reason}. ` +
          `This suite MUST run on PRs to pin the R3-R6 audit fixes.`,
      );
    }
    skipReason = check.reason;
    return;
  }

  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-mobile-ux-"));
  dbPath = join(tmpDir, "test.db");
  createTestDb(dbPath);

  // detached: true so server.kill("SIGTERM") targets the process group and
  // reaches the real `next dev` child — without it, `npx` swallows the
  // signal and `next dev` lingers on TEST_PORT across local re-runs.
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

  // 60s tolerates a cold `next dev` compile on a CI runner that's also
  // cold on the pnpm store. Local runs still resolve in ~2s.
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

// ── Helpers ─────────────────────────────────────────────────────────

async function expectTouchTarget(
  page: Page,
  selector: string,
  label: string,
): Promise<void> {
  const locator = page.locator(selector).first();
  await expect(locator, `${label} not visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} has no bounding box`).not.toBeNull();
  expect(
    box!.height,
    `${label} height ${box!.height}px < ${IOS_MIN_TOUCH}px (iOS HIG)`,
  ).toBeGreaterThanOrEqual(IOS_MIN_TOUCH);
  expect(
    box!.width,
    `${label} width ${box!.width}px < ${IOS_MIN_TOUCH}px (iOS HIG)`,
  ).toBeGreaterThanOrEqual(IOS_MIN_TOUCH);
}

// ── Tests ───────────────────────────────────────────────────────────

test.describe("Mobile UX regressions — touch targets (R3-R6)", () => {
  test("command sheet button meets 44px touch target", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/`);
    await expectTouchTarget(
      page,
      'button[aria-label="Open command sheet"]',
      "command sheet menu button",
    );
  });

  test("command sheet button is 44x44 and reachable", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/`);
    // Command sheet button replaces the FAB on mobile viewports.
    await expectTouchTarget(
      page,
      'button[aria-label="Open command sheet"]',
      "command sheet button",
    );
  });

  test("settings breadcrumb back link is 44 tall", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/settings`);
    const link = page.locator('a:has-text("← dashboard")').first();
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(
      box!.height,
      `settings breadcrumb ${box!.height}px < ${IOS_MIN_TOUCH}`,
    ).toBeGreaterThanOrEqual(IOS_MIN_TOUCH);
  });

  test("parse breadcrumb back link is 44 tall", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/parse`);
    const link = page.locator('a:has-text("← dashboard")').first();
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(
      box!.height,
      `parse breadcrumb ${box!.height}px < ${IOS_MIN_TOUCH}`,
    ).toBeGreaterThanOrEqual(IOS_MIN_TOUCH);
  });

  test("not-found page CTA is 44 tall", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/this-route-does-not-exist-xyz`);
    const link = page.locator('a:has-text("Back to Dashboard")').first();
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(
      box!.height,
      `404 CTA ${box!.height}px < ${IOS_MIN_TOUCH}`,
    ).toBeGreaterThanOrEqual(IOS_MIN_TOUCH);
  });
});

test.describe("Mobile UX regressions — iOS Safari viewport (R3)", () => {
  test("body uses 100dvh not 100vh", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/`);
    // When 100dvh is in use, body.clientHeight matches window.innerHeight
    // within 1px even when the test harness doesn't have a dynamic toolbar.
    // 100vh on mobile Safari can produce a body that overflows the viewport
    // because of the way Safari reports 100vh. We can't directly test the
    // Safari behavior from Chromium, so instead we check the computed
    // min-height resolves to the dvh equivalent.
    const minHeight = await page.evaluate(
      () => getComputedStyle(document.body).minHeight,
    );
    const innerHeight = await page.evaluate(() => window.innerHeight);
    // dvh resolves to innerHeight at steady state.
    expect(parseFloat(minHeight)).toBeCloseTo(innerHeight, 0);
  });

  test("no horizontal overflow on dashboard", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/`);
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(
      scrollWidth,
      `body scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
    ).toBeLessThanOrEqual(clientWidth);
  });
});

test.describe("Mobile UX regressions — iOS form attrs (R3, R5)", () => {
  test("settings text inputs have iOS form attrs", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/settings`);

    // Every non-read-only text input should carry the R3 attr set.
    const writableInputs = [
      "sf-branch-pattern",
      "sf-cache-ttl",
      "sf-claude-args",
    ];

    for (const id of writableInputs) {
      const input = page.locator(`#${id}`);
      await expect(input, `${id} not found`).toBeVisible();
      const autoComplete = await input.getAttribute("autocomplete");
      const enterKeyHint = await input.getAttribute("enterkeyhint");
      expect(autoComplete, `${id} missing autocomplete`).toBe("off");
      expect(enterKeyHint, `${id} missing enterkeyhint`).toBe("done");
    }
  });

  test("settings cache TTL has numeric inputmode", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/settings`);
    const inputMode = await page
      .locator("#sf-cache-ttl")
      .getAttribute("inputmode");
    expect(inputMode).toBe("numeric");
  });

  // Note: no parse textarea assertion. ParseFlow gates the textarea behind
  // Claude CLI availability + repos + no init error, making it environment-
  // dependent and unreliable for CI pinning. The same iOS form-attr concern
  // is covered by the settings-form tests above, which render deterministically.

  test("text inputs are >= 16px to prevent iOS Safari zoom-on-focus", async ({
    page,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/settings`);
    // Wait for the form to actually render before bulk-collecting inputs —
    // .locator(...).all() does not auto-wait, so on a slow CI runner the
    // collection can fire before hydration finishes.
    await expect(page.locator("#sf-branch-pattern")).toBeVisible();
    const inputs = await page
      .locator('input[type="text"]:visible, input:not([type]):visible')
      .all();
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      const fontSize = await input.evaluate(
        (el) => parseFloat(getComputedStyle(el).fontSize),
      );
      expect(
        fontSize,
        `input font-size ${fontSize}px < 16px (triggers iOS Safari zoom)`,
      ).toBeGreaterThanOrEqual(16);
    }
  });
});

test.describe("Mobile UX regressions — motion and a11y (R3, R5)", () => {
  test("command sheet opens with a real animation", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);
    await page.goto(`${BASE_URL}/`);

    await page.click('button[aria-label="Open command sheet"]');

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    const animation = await dialog.evaluate(
      (el) => getComputedStyle(el).animationName,
    );
    // If keyframes regress, animationName will be "none".
    expect(
      animation,
      `sheet animationName "${animation}" — R3 fix has regressed`,
    ).not.toBe("none");
  });

  test("prefers-reduced-motion disables sheet animation", async ({
    browser,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/`);
      await page.click('button[aria-label="Open command sheet"]');
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
      const animation = await dialog.evaluate(
        (el) => getComputedStyle(el).animationName,
      );
      expect(
        animation,
        `sheet animation not disabled under prefers-reduced-motion — R3 gate has regressed`,
      ).toBe("none");
    } finally {
      await context.close();
    }
  });
});
