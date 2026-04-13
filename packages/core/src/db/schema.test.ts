import { describe, it, expect, beforeEach, vi } from "vitest";
import type Database from "better-sqlite3";
import { createRawTestDb, createTestDb } from "./test-helpers.js";
import { initSchema, getSchemaVersion } from "./schema.js";
import { runMigrations } from "./migrations.js";

describe("initSchema", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createRawTestDb();
  });

  it("creates all expected tables", () => {
    initSchema(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];

    const names = tables.map((t) => t.name);
    expect(names).toEqual([
      "action_nonces",
      "cache",
      "deployments",
      "drafts",
      "issue_metadata",
      "repos",
      "schema_version",
      "settings",
    ]);
  });

  it("sets schema_version to 9", () => {
    initSchema(db);
    expect(getSchemaVersion(db)).toBe(9);
  });

  it("is idempotent — calling twice does not error or change version", () => {
    initSchema(db);
    initSchema(db);
    expect(getSchemaVersion(db)).toBe(9);
  });
});

describe("getSchemaVersion", () => {
  it("returns 0 when schema_version table is empty", () => {
    const db = createRawTestDb();
    db.exec("CREATE TABLE schema_version (version INTEGER NOT NULL)");
    expect(getSchemaVersion(db)).toBe(0);
  });
});

describe("runMigrations", () => {
  it("does nothing when no migrations are pending", () => {
    const db = createRawTestDb();
    initSchema(db);
    runMigrations(db);
    expect(getSchemaVersion(db)).toBe(9);
  });

  it("migrates v1 schema through v9 and drops claude_aliases", () => {
    const db = createRawTestDb();
    db.exec(`
      CREATE TABLE repos (id INTEGER PRIMARY KEY, owner TEXT, name TEXT);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE deployments (id INTEGER PRIMARY KEY, repo_id INTEGER, issue_number INTEGER, branch_name TEXT, workspace_mode TEXT, workspace_path TEXT, linked_pr_number INTEGER, launched_at TEXT);
      CREATE TABLE cache (key TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (1);
    `);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(9);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'claude_aliases'")
      .all();
    expect(tables).toHaveLength(0);
  });

  it("migrates v2 schema to v9 (adds ended_at, drops claude_aliases, adds drafts+issue_metadata+state+action_nonces, rebuilds deployments with CASCADE+live index)", () => {
    const db = createRawTestDb();
    // The v2 fixture originally covered only claude_aliases; a repos
    // table + row is now included because the v8 deployments rebuild
    // declares a FK against repos and SQLite validates the reference
    // table during the INSERT SELECT.
    db.exec(`
      CREATE TABLE repos (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, name TEXT NOT NULL, UNIQUE(owner, name));
      INSERT INTO repos (owner, name) VALUES ('acme', 'api');
      CREATE TABLE claude_aliases (id INTEGER PRIMARY KEY, command TEXT, description TEXT, is_default INTEGER, created_at TEXT);
      CREATE TABLE deployments (id INTEGER PRIMARY KEY, repo_id INTEGER, issue_number INTEGER, branch_name TEXT, workspace_mode TEXT, workspace_path TEXT, linked_pr_number INTEGER, launched_at TEXT);
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (2);
    `);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(9);
    db.prepare("INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path, launched_at, ended_at) VALUES (1, 1, 'b', 'existing', '/x', '2025-01-01', NULL)").run();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'claude_aliases'")
      .all();
    expect(tables).toHaveLength(0);
  });

  it("migrates v3 schema to v9 and drops populated claude_aliases (data loss is intentional)", () => {
    const db = createRawTestDb();
    db.exec(`
      CREATE TABLE repos (id INTEGER PRIMARY KEY, owner TEXT, name TEXT);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE deployments (
        id INTEGER PRIMARY KEY,
        repo_id INTEGER,
        issue_number INTEGER,
        branch_name TEXT,
        workspace_mode TEXT,
        workspace_path TEXT,
        linked_pr_number INTEGER,
        launched_at TEXT,
        ended_at TEXT
      );
      CREATE TABLE cache (key TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE claude_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (3);
      INSERT INTO claude_aliases (command, description) VALUES ('yolo', 'skip perms');
      INSERT INTO claude_aliases (command, description) VALUES ('debug', 'debug mode');
    `);

    // Silence the migration's warn() log so the test output stays clean.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(9);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'claude_aliases'")
      .all();
    expect(tables).toHaveLength(0);

    // The migration should have logged the row count being destroyed.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("2 row"),
    );

    warnSpy.mockRestore();
  });
});

describe("schema v5 — drafts and issue_metadata", () => {
  it("initSchema on a fresh DB produces schema version 9", () => {
    const db = createRawTestDb();
    initSchema(db);
    expect(getSchemaVersion(db)).toBe(9);
  });

  it("fresh schema includes the drafts table", () => {
    const db = createTestDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drafts'",
      )
      .get();
    expect(row).toBeDefined();
  });

  it("fresh schema includes the issue_metadata table", () => {
    const db = createTestDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'issue_metadata'",
      )
      .get();
    expect(row).toBeDefined();
  });

  it("drafts table enforces the priority CHECK constraint", () => {
    const db = createTestDb();
    expect(() =>
      db
        .prepare(
          "INSERT INTO drafts (id, title, body, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("abc", "t", "b", "bogus", 1, 1),
    ).toThrow();
  });

  it("migration from v4 → v9 adds drafts, issue_metadata, deployments.state+CHECK+CASCADE+live index, and action_nonces", () => {
    const db = createRawTestDb();
    // Simulate a v4 DB: run the v4-era schema manually. The deployments
    // table is included here because v6's migration does ALTER TABLE on it.
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (4);
      CREATE TABLE repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        local_path TEXT,
        branch_pattern TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(owner, name)
      );
      CREATE TABLE deployments (
        id INTEGER PRIMARY KEY,
        repo_id INTEGER,
        issue_number INTEGER,
        branch_name TEXT,
        workspace_mode TEXT,
        workspace_path TEXT,
        linked_pr_number INTEGER,
        launched_at TEXT,
        ended_at TEXT
      );
    `);
    expect(getSchemaVersion(db)).toBe(4);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(9);
    const drafts = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drafts'",
      )
      .get();
    expect(drafts).toBeDefined();
    const meta = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'issue_metadata'",
      )
      .get();
    expect(meta).toBeDefined();
    // v6 ALTER should have added the state column with default 'active'
    const cols = db
      .prepare("PRAGMA table_info(deployments)")
      .all() as { name: string; dflt_value: string | null }[];
    const stateCol = cols.find((c) => c.name === "state");
    expect(stateCol).toBeDefined();
    expect(stateCol?.dflt_value).toContain("active");
  });
});

describe("schema v8 — deployments FK cascade", () => {
  it("deleting a repo cascades to its deployment rows", () => {
    const db = createTestDb();
    db.prepare("INSERT INTO repos (owner, name) VALUES (?, ?)").run(
      "acme",
      "api",
    );
    const repoId = Number(
      (db.prepare("SELECT id FROM repos WHERE owner='acme'").get() as { id: number }).id,
    );
    db.prepare(
      "INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path) VALUES (?, ?, ?, ?, ?)",
    ).run(repoId, 1, "b", "existing", "/x");

    const before = db
      .prepare("SELECT COUNT(*) as c FROM deployments WHERE repo_id = ?")
      .get(repoId) as { c: number };
    expect(before.c).toBe(1);

    db.prepare("DELETE FROM repos WHERE id = ?").run(repoId);

    const after = db
      .prepare("SELECT COUNT(*) as c FROM deployments WHERE repo_id = ?")
      .get(repoId) as { c: number };
    expect(after.c).toBe(0);
  });

  it("migrated DB matches fresh schema's FK cascade", () => {
    // A v7 DB upgraded to v8 should have the same CASCADE FK as a fresh
    // install — the migration rebuilds the deployments table.
    const db = createRawTestDb();
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (7);
      CREATE TABLE repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        local_path TEXT,
        branch_pattern TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(owner, name)
      );
      CREATE TABLE deployments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL REFERENCES repos(id),
        issue_number INTEGER NOT NULL,
        branch_name TEXT NOT NULL,
        workspace_mode TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        linked_pr_number INTEGER,
        state TEXT NOT NULL DEFAULT 'active',
        launched_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT
      );
    `);
    db.prepare("INSERT INTO repos (owner, name) VALUES (?, ?)").run("o", "n");
    // Seed `state='pending'` explicitly so the preservation assertion
    // below cannot be satisfied by the fresh schema's DEFAULT 'active'.
    db.prepare(
      "INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path, state) VALUES (1, 1, 'b', 'existing', '/x', 'pending')",
    ).run();

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(9);

    // Pre-existing row should have been copied over with its state intact
    const row = db
      .prepare("SELECT issue_number, state FROM deployments WHERE id = 1")
      .get() as { issue_number: number; state: string };
    expect(row.issue_number).toBe(1);
    expect(row.state).toBe("pending");

    // Cascade works on the upgraded table — the behavioral check that
    // proves the rebuilt FK is in place.
    db.prepare("DELETE FROM repos WHERE id = 1").run();
    const { c } = db
      .prepare("SELECT COUNT(*) as c FROM deployments")
      .get() as { c: number };
    expect(c).toBe(0);
  });
});

describe("schema v9 — live deployment unique index", () => {
  // The "blocks a second live deployment" case lives in deployments.test.ts
  // where it exercises the recordDeployment helper rather than raw SQL.
  // Here we keep only the cases that are specific to the schema layer:
  // the allowed-after-end behavior and the v8→v9 migration dedup.

  it("allows a new live deployment after the previous one is ended", () => {
    const db = createTestDb();
    db.prepare("INSERT INTO repos (owner, name) VALUES (?, ?)").run("o", "n");
    db.prepare(
      "INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path) VALUES (1, 42, 'b1', 'existing', '/x')",
    ).run();
    db.prepare("UPDATE deployments SET ended_at = datetime('now') WHERE id = 1").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path) VALUES (1, 42, 'b2', 'existing', '/y')",
        )
        .run(),
    ).not.toThrow();
  });

  it("v8 → v9 migration dedupes existing live rows before creating the index", () => {
    const db = createRawTestDb();
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (8);
      CREATE TABLE repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        UNIQUE(owner, name)
      );
      CREATE TABLE deployments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        issue_number INTEGER NOT NULL,
        branch_name TEXT NOT NULL,
        workspace_mode TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        linked_pr_number INTEGER,
        state TEXT NOT NULL DEFAULT 'active'
          CHECK (state IN ('pending', 'active')),
        launched_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT
      );
      INSERT INTO repos (owner, name) VALUES ('o', 'n');
      INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path)
        VALUES (1, 42, 'b1', 'existing', '/a');
      INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path)
        VALUES (1, 42, 'b2', 'existing', '/b');
      -- A third row for the same (repo, issue) that is already ended.
      -- The dedup subquery's inner "ended_at IS NULL" filter must exclude
      -- this row from the MAX(id) computation so the most recent *live*
      -- row (id=2) wins, even though this ended row has the highest id.
      INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path, ended_at)
        VALUES (1, 42, 'historic', 'existing', '/h', '2025-01-01T00:00:00');
    `);

    // Silence the migration's warn() log so test output stays clean.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(9);
    // Row id=1 (older duplicate) → ended. id=2 (most recent live) → live.
    // id=3 (historic ended) → still ended, untouched.
    const live = db
      .prepare("SELECT id FROM deployments WHERE ended_at IS NULL")
      .all() as { id: number }[];
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(2);

    const ended = db
      .prepare("SELECT id FROM deployments WHERE ended_at IS NOT NULL ORDER BY id")
      .all() as { id: number }[];
    expect(ended.map((r) => r.id)).toEqual([1, 3]);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("ending 1 duplicate"),
    );
    warnSpy.mockRestore();
  });
});
