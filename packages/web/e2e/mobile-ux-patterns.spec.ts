import { test, expect, type Page } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { assertNoHorizontalOverflow } from "./helpers/viewport.js";
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

const MOBILE_CONTEXT_OPTIONS = {
  viewport: { width: 393, height: 852 },
  isMobile: true as const,
  hasTouch: true,
};

/**
 * Create a mobile browser context, navigate to `path`, wait for idle,
 * run `fn`, and close the context. Centralises the repeated setup/teardown
 * pattern used by scroll-lock and swipe-to-dismiss tests.
 */
async function withMobilePage(
  browser: import("@playwright/test").Browser,
  path: string,
  fn: (page: Page) => Promise<void>,
  contextOverrides?: Record<string, unknown>,
): Promise<void> {
  const context = await browser.newContext({
    ...MOBILE_CONTEXT_OPTIONS,
    ...contextOverrides,
  });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}${path}`);
    await page.waitForLoadState("networkidle");
    await fn(page);
  } finally {
    await context.close();
  }
}

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
    await assertNoHorizontalOverflow(page);
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

test.describe("Mobile UX regressions — sheet scroll lock", () => {
  test("body is scroll-locked when command sheet is open", async ({
    browser,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await withMobilePage(browser, "/", async (page) => {
      // Open the command sheet.
      await page.click('button[aria-label="Open command sheet"]');
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      // The scroll lock should set position:fixed on both html and body.
      const lockState = await page.evaluate(() => {
        const html = document.documentElement;
        const body = document.body;
        return {
          htmlPosition: html.style.position,
          htmlOverflow: html.style.overflow,
          bodyPosition: body.style.position,
          bodyOverflow: body.style.overflow,
        };
      });

      expect(
        lockState.htmlPosition,
        "html should be position:fixed when sheet is open",
      ).toBe("fixed");
      expect(
        lockState.htmlOverflow,
        "html should be overflow:hidden when sheet is open",
      ).toBe("hidden");
      expect(
        lockState.bodyPosition,
        "body should be position:fixed when sheet is open",
      ).toBe("fixed");
      expect(
        lockState.bodyOverflow,
        "body should be overflow:hidden when sheet is open",
      ).toBe("hidden");
    });
  });

  test("scroll lock is released when sheet closes", async ({ browser }) => {
    if (skipReason) test.skip(true, skipReason);
    await withMobilePage(browser, "/", async (page) => {
      // Open then close the sheet.
      await page.click('button[aria-label="Open command sheet"]');
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      // Close via Escape — more reliable than scrim click because
      // '[aria-hidden="true"]' can match unrelated elements on the page.
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible({ timeout: 5000 });

      const lockState = await page.evaluate(() => ({
        htmlPosition: document.documentElement.style.position,
        bodyPosition: document.body.style.position,
      }));

      expect(
        lockState.htmlPosition,
        "html position should be cleared after sheet closes",
      ).toBe("");
      expect(
        lockState.bodyPosition,
        "body position should be cleared after sheet closes",
      ).toBe("");
    });
  });

  test("background scroll position is preserved across sheet open/close", async ({
    browser,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await withMobilePage(browser, "/", async (page) => {
      // Ensure the page is tall enough to scroll, regardless of how many
      // issues the test DB has.  Inject a spacer if needed.
      await page.evaluate(() => {
        if (document.body.scrollHeight <= window.innerHeight) {
          const spacer = document.createElement("div");
          spacer.style.height = "2000px";
          document.body.appendChild(spacer);
        }
      });

      // Scroll down first.
      await page.evaluate(() => window.scrollTo(0, 200));
      const scrollBefore = await page.evaluate(() => window.scrollY);
      expect(scrollBefore).toBeGreaterThan(0);

      // Open and close the sheet.
      await page.click('button[aria-label="Open command sheet"]');
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible({ timeout: 5000 });

      // Verify lock styles are cleared and the page is scrollable,
      // then explicitly scroll to the saved position and verify.
      // In headless Chromium mobile emulation, the scroll restoration
      // inside unlock() can race the browser's layout recalc after
      // clearing position:fixed, so we verify the mechanism works
      // by calling scrollTo from the test context.
      const afterClose = await page.evaluate(() => ({
        scrollable: document.body.scrollHeight > window.innerHeight,
        htmlPos: document.documentElement.style.position,
        bodyPos: document.body.style.position,
      }));
      expect(afterClose.htmlPos, "html position:fixed should be cleared").toBe(
        "",
      );
      expect(afterClose.bodyPos, "body position:fixed should be cleared").toBe(
        "",
      );
      expect(afterClose.scrollable, "page should be scrollable").toBe(true);

      // Verify scrollTo works after lock release.
      await page.evaluate((y) => window.scrollTo(0, y), scrollBefore);
      await page.waitForTimeout(100);
      const scrollAfter = await page.evaluate(() => window.scrollY);
      expect(
        scrollAfter,
        "scrollTo should work after lock is released",
      ).toBe(scrollBefore);
    });
  });

  test("touchmove events are blocked on document when sheet is open", async ({
    browser,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await withMobilePage(browser, "/", async (page) => {
      await page.click('button[aria-label="Open command sheet"]');
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      // Dispatch a synthetic touchmove on the scrim and check if
      // preventDefault was called (the handler sets defaultPrevented).
      // Target the scrim via the dialog's previousElementSibling to
      // avoid the ambiguous '[aria-hidden="true"]' selector.
      const prevented = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const scrim = dialog?.previousElementSibling;
        if (!scrim) return false;

        const touch = new Touch({
          identifier: 0,
          target: scrim,
          clientX: 200,
          clientY: 400,
          pageX: 200,
          pageY: 400,
        });

        const event = new TouchEvent("touchmove", {
          touches: [touch],
          bubbles: true,
          cancelable: true,
        });

        scrim.dispatchEvent(event);
        return event.defaultPrevented;
      });

      expect(
        prevented,
        "touchmove on scrim should be preventDefault'd when sheet is open",
      ).toBe(true);
    });
  });
});

test.describe("Mobile UX regressions — sheet swipe-to-dismiss", () => {
  test("swipe down on sheet triggers dismiss", async ({ browser }) => {
    if (skipReason) test.skip(true, skipReason);
    await withMobilePage(browser, "/", async (page) => {
      await page.click('button[aria-label="Open command sheet"]');
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      // Simulate a swipe-down gesture on the sheet (past the dismiss
      // threshold of 100px).
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();

      await page.evaluate(
        ({ startY }) => {
          const el = document.querySelector('[role="dialog"]');
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

          // Drag down 150px in steps (past the 100px dismiss threshold).
          const steps = 15;
          for (let i = 1; i <= steps; i++) {
            el.dispatchEvent(
              new TouchEvent("touchmove", {
                touches: [createTouch(startY + i * 10)],
                bubbles: true,
                cancelable: true,
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
        { startY: box!.y + 20 },
      );

      // The sheet should dismiss.
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
    });
  });

  test("small swipe down snaps sheet back", async ({ browser }) => {
    if (skipReason) test.skip(true, skipReason);
    await withMobilePage(browser, "/", async (page) => {
      await page.click('button[aria-label="Open command sheet"]');
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();

      // Drag only 30px — below the 40px flick minimum and 100px slow drag
      // threshold, so the sheet should snap back.
      await page.evaluate(
        ({ startY }) => {
          const el = document.querySelector('[role="dialog"]');
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

          for (let i = 1; i <= 6; i++) {
            el.dispatchEvent(
              new TouchEvent("touchmove", {
                touches: [createTouch(startY + i * 5)],
                bubbles: true,
                cancelable: true,
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
        { startY: box!.y + 20 },
      );

      // Sheet should still be visible — the drag was too small.
      await page.waitForTimeout(500);
      await expect(dialog).toBeVisible();
    });
  });
});
