import { test, expect } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);

const TEST_PORT = 3848;
const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";

// ── Skip conditions ─────────────────────────────────────────────────

async function canRun(): Promise<{ ok: boolean; reason?: string }> {
  try {
    await execFileAsync("claude", ["--version"]);
  } catch {
    return { ok: false, reason: "Claude CLI not installed" };
  }

  try {
    await execFileAsync("gh", ["auth", "token"]);
  } catch {
    return { ok: false, reason: "gh auth not configured" };
  }

  return { ok: true };
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
      data TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (?)").run(4);

  const defaults = [
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

// ── Test suite ──────────────────────────────────────────────────────

let tmpDir: string;
let dbPath: string;
let server: ChildProcess;
let skipReason: string | undefined;
const createdIssueNumbers: number[] = [];

test.beforeAll(async () => {
  const check = await canRun();
  if (!check.ok) {
    skipReason = check.reason;
    return;
  }

  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-qc-"));
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

  await waitForServer(`http://localhost:${TEST_PORT}`, 30000).catch((err) => {
    throw new Error(
      `${err.message}. Server stderr: ${serverStderr.slice(-500)}`,
    );
  });
});

test.afterAll(async () => {
  // Clean up created issues
  for (const num of createdIssueNumbers) {
    try {
      await execFileAsync("gh", [
        "issue",
        "close",
        String(num),
        "--repo",
        `${TEST_OWNER}/${TEST_REPO}`,
        "--reason",
        "not planned",
      ]);
    } catch {
      // Best-effort cleanup
    }
  }

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

test.describe("Quick Create flow", () => {
  test("page renders with textarea and disabled button", async ({ page }) => {
    if (skipReason) {
      test.skip(true, skipReason);
    }

    await page.goto(`http://localhost:${TEST_PORT}/parse`);

    await expect(page.getByRole("heading", { name: "Quick Create" })).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByPlaceholder("e.g. Fix the login timeout"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Parse with Claude" }),
    ).toBeDisabled();
  });

  test("full flow: parse, review, create issues", async ({ page }) => {
    if (skipReason) {
      test.skip(true, skipReason);
    }

    await page.goto(`http://localhost:${TEST_PORT}/parse`);

    await expect(page.getByRole("heading", { name: "Quick Create" })).toBeVisible({
      timeout: 15000,
    });

    // Step 1: Input
    const textarea = page.getByPlaceholder("e.g. Fix the login timeout");
    await textarea.fill(
      `Add a test health check endpoint to ${TEST_REPO}`,
    );

    const parseButton = page.getByRole("button", {
      name: "Parse with Claude",
    });
    await expect(parseButton).toBeEnabled();
    await parseButton.click();

    // Wait for parsing to complete (Claude CLI can take up to 90s).
    // The "Parsing..." state may be too brief to catch if the CLI
    // responds quickly, so we wait for the result directly rather
    // than asserting the intermediate spinner.
    await expect(page.getByText("parsed")).toBeVisible({ timeout: 90000 });
    await expect(page.getByText(/\d+ included/)).toBeVisible();

    // Verify a Create button exists with a count — text varies based
    // on whether issues matched repos or will be saved as drafts.
    const createButton = page.getByRole("button", { name: /Create \d+|Save \d+ Draft/ });
    await expect(createButton).toBeVisible();
    await createButton.click();

    // Step 3: Results — the summary says "created" or "saved" depending
    // on whether the parser matched a repo or fell back to drafts.
    await expect(page.getByText(/created|saved/)).toBeVisible({ timeout: 30000 });
    // Ensure no partial failures slipped through — "failed" in the
    // summary means the batch had errors we shouldn't silently accept.
    await expect(page.getByText("failed")).not.toBeVisible();

    // Extract created issue numbers from links. If Claude matched a
    // repo, we get `#123` links; if it fell back to drafts, we get
    // "view draft" links instead. Either is a valid success.
    const issueLinks = page.getByRole("link", { name: /^#\d+$/ });
    const draftLinks = page.getByRole("link", { name: "view draft" });
    const issueCount = await issueLinks.count();
    const draftCount = await draftLinks.count();
    expect(issueCount + draftCount).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < issueCount; i++) {
      const text = await issueLinks.nth(i).textContent();
      const num = Number(text?.replace("#", ""));
      if (num > 0) {
        createdIssueNumbers.push(num);
      }
    }

    // Verify "Create More" button exists
    await expect(
      page.getByRole("button", { name: "Create More" }),
    ).toBeVisible();
  });
});
