import { test, expect } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);

// Distinct from quick-create.spec.ts (3848) so the two specs can coexist.
const TEST_PORT = 3850;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";

// ── Skip conditions ─────────────────────────────────────────────────
//
// This spec verifies UI/HTTP behavior that does NOT need Claude or
// real GitHub round trips, but the dev server still requires `gh
// auth token` to boot (RootLayout calls getAuthStatus). Skip the
// suite if gh auth is not configured rather than failing the run.

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
  // Mirror the schema setup from quick-create.spec.ts but on schema
  // version 1 — runMigrations will bring it up to current. The test
  // here cares about settings + repos seed only.
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

  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-audit-"));
  dbPath = join(tmpDir, "test.db");
  createTestDb(dbPath);

  server = spawn("npx", ["next", "dev", "--port", String(TEST_PORT)], {
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
      server.on("close", () => resolve());
    });
    clearTimeout(killTimeout);
  }

  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Tests ───────────────────────────────────────────────────────────

test.describe("Adv-R2 #4 — Content-Security-Policy header", () => {
  // Defense-in-depth header added in commit 55b3030. Should be present
  // on every route. The exact policy is allowed to evolve; the test
  // just pins the load-bearing directives.
  const REQUIRED_DIRECTIVES = [
    "default-src 'self'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "frame-ancestors 'none'",
  ];

  for (const route of ["/", "/settings", "/parse"]) {
    test(`route ${route} sends CSP with the load-bearing directives`, async () => {
      if (skipReason) test.skip(true, skipReason);
      const res = await fetch(`${BASE_URL}${route}`);
      const csp = res.headers.get("content-security-policy");
      expect(csp, `no CSP header on ${route}`).toBeTruthy();
      for (const directive of REQUIRED_DIRECTIVES) {
        expect(csp, `${route} CSP missing "${directive}"`).toContain(directive);
      }
    });
  }
});

// Two more findings from PRs #62 and #64 (B13 parse input cap, B9
// updateDraft missing-row failure) are NOT verified in this e2e spec
// because they live behind Client Component hydration paths that
// fight Next.js dev-mode streaming — networkidle never fires in dev
// (HMR socket), and the textarea/title editor live in components that
// stream in after the initial HTML response. Both are already pinned
// at the action layer:
//
//   - B13 (8K parse cap):  packages/core unit tests for
//                          parseNaturalLanguage; the maxLength prop
//                          on ParseInput.tsx is source-reviewable.
//   - B9  (missing draft):  packages/web/lib/actions/drafts.test.ts
//                          exercises updateDraftAction against a
//                          real in-memory DB and asserts the
//                          success:false path.
//
// CSP coverage above is the load-bearing e2e finding because it
// requires the *running* server to attach the header on every route.
