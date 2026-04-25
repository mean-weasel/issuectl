import { test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { initSchema, runMigrations } from "@issuectl/core";
import {
  assertNoHorizontalOverflow,
  assertNoElementBleed,
  assertNoDeadWhitespace,
} from "./helpers/viewport.js";

const execFileAsync = promisify(execFile);

// Distinct port from all other specs:
// quick-create (3848), audit-verification (3850), mobile-ux-patterns (3851),
// launch-ui (3852), pwa-offline (3853), action-sheets (3854).
const TEST_PORT = 3855;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";

const DRAFT_ID = "viewport-test-draft";
const DRAFT_TITLE = "Viewport test draft";

// ── Viewport / device constants ───────────────────────────────────────

const VIEWPORTS = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone 14", width: 390, height: 844 },
  { name: "iPhone 14 Pro Max", width: 430, height: 932 },
] as const;

const ROUTES = [
  { path: "/", label: "dashboard" },
  { path: "/settings", label: "settings" },
  { path: "/parse", label: "parse" },
  { path: "/new", label: "new draft" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────

async function canRun(): Promise<{ ok: boolean; reason?: string }> {
  try {
    await execFileAsync("gh", ["auth", "token"]);
    return { ok: true };
  } catch {
    return { ok: false, reason: "gh auth not configured" };
  }
}

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

    // Seed the draft for the draft detail viewport test
    const now = Date.now();
    db.prepare(
      `INSERT INTO drafts (id, title, body, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(DRAFT_ID, DRAFT_TITLE, "Body for viewport test", "normal", now, now);

    // Seed issue cache so all issue-related pages render from cache
    const issue = {
      number: 1,
      title: "Viewport health test issue",
      body: "Created by viewport-health.spec.ts",
      state: "open",
      labels: [],
      user: { login: "test-bot", avatarUrl: "" },
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: null,
      htmlUrl: `https://github.com/${TEST_OWNER}/${TEST_REPO}/issues/1`,
    };

    const insertCache = db.prepare(
      "INSERT OR REPLACE INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now'))",
    );

    insertCache.run(
      `issue-header:${TEST_OWNER}/${TEST_REPO}#1`,
      JSON.stringify(issue),
    );
    insertCache.run(
      `issue-content:${TEST_OWNER}/${TEST_REPO}#1`,
      JSON.stringify({ comments: [], linkedPRs: [] }),
    );
    insertCache.run(
      `issues:${TEST_OWNER}/${TEST_REPO}`,
      JSON.stringify([issue]),
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

// ── forEachViewport helper ────────────────────────────────────────────

/**
 * Creates a new browser context for each viewport in VIEWPORTS, navigates to
 * the given path, waits for networkidle, calls the callback, then closes the
 * context.
 */
async function forEachViewport(
  browser: Browser,
  path: string,
  fn: (page: Page, viewport: (typeof VIEWPORTS)[number]) => Promise<void>,
): Promise<void> {
  for (const vp of VIEWPORTS) {
    const ctx: BrowserContext = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState("networkidle");
      await fn(page, vp);
    } finally {
      await ctx.close();
    }
  }
}

// ── Suite state ───────────────────────────────────────────────────────

const STDERR_BUFFER_MAX_CHUNKS = 40;
const serverStderrChunks: string[] = [];

let tmpDir: string;
let dbPath: string;
let server: ChildProcess;
let skipReason: string | undefined;

test.beforeAll(async () => {
  const check = await canRun();
  if (!check.ok) {
    if (process.env.CI === "true") {
      throw new Error(
        `Viewport health suite cannot skip in CI: ${check.reason}. ` +
          `This suite MUST run on PRs to catch horizontal overflow and bleed regressions.`,
      );
    }
    skipReason = check.reason;
    return;
  }

  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-viewport-health-"));
  dbPath = join(tmpDir, "test.db");
  createTestDb(dbPath);

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
  await execFileAsync(
    "git",
    ["checkout", "--", "packages/web/tsconfig.json", "packages/web/next-env.d.ts"],
    { cwd: join(import.meta.dirname, "../../..") },
  ).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("did not match any")) {
      console.warn(
        `[viewport-health afterAll] git checkout failed (working tree may be dirty): ${msg}`,
      );
    }
  });
});

// ── Test describes ────────────────────────────────────────────────────

test.describe("Viewport health — no horizontal overflow", () => {
  for (const route of ROUTES) {
    test(`${route.label} (${route.path}) — no horizontal overflow at any iPhone size`, async ({
      browser,
    }) => {
      if (skipReason) test.skip(true, skipReason);
      await forEachViewport(browser, route.path, async (page) => {
        await assertNoHorizontalOverflow(page);
      });
    });
  }

  test("issue detail (/issues/mean-weasel/issuectl-test-repo/1) — no horizontal overflow at any iPhone size", async ({
    browser,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await forEachViewport(browser, `/issues/${TEST_OWNER}/${TEST_REPO}/1`, async (page) => {
      await assertNoHorizontalOverflow(page);
    });
  });

  test("draft detail (/drafts/viewport-test-draft) — no horizontal overflow at any iPhone size", async ({
    browser,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await forEachViewport(browser, `/drafts/${DRAFT_ID}`, async (page) => {
      await assertNoHorizontalOverflow(page);
    });
  });
});

test.describe("Viewport health — no element bleed", () => {
  test("dashboard (/) — no element bleed at any iPhone size", async ({
    browser,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await forEachViewport(browser, "/", async (page) => {
      await assertNoElementBleed(page);
    });
  });

  test("issue detail (/issues/mean-weasel/issuectl-test-repo/1) — no element bleed at any iPhone size", async ({
    browser,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await forEachViewport(browser, `/issues/${TEST_OWNER}/${TEST_REPO}/1`, async (page) => {
      await assertNoElementBleed(page);
    });
  });

  test("new draft form (/new) — no element bleed at any iPhone size", async ({
    browser,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await forEachViewport(browser, "/new", async (page) => {
      await assertNoElementBleed(page);
    });
  });
});

test.describe("Viewport health — no dead whitespace (#223)", () => {
  test("dashboard (/) — no dead whitespace at any iPhone size", async ({
    browser,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await forEachViewport(browser, "/", async (page) => {
      await assertNoDeadWhitespace(page);
    });
  });

  test("issue detail (/issues/mean-weasel/issuectl-test-repo/1) — no dead whitespace at any iPhone size", async ({
    browser,
  }) => {
    if (skipReason) test.skip(true, skipReason);
    await forEachViewport(browser, `/issues/${TEST_OWNER}/${TEST_REPO}/1`, async (page) => {
      await assertNoDeadWhitespace(page);
    });
  });
});
