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
      "cache",
      "deployments",
      "drafts",
      "issue_metadata",
      "repos",
      "schema_version",
      "settings",
    ]);
  });

  it("sets schema_version to 5", () => {
    initSchema(db);
    expect(getSchemaVersion(db)).toBe(5);
  });

  it("is idempotent — calling twice does not error or change version", () => {
    initSchema(db);
    initSchema(db);
    expect(getSchemaVersion(db)).toBe(5);
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
    expect(getSchemaVersion(db)).toBe(5);
  });

  it("migrates v1 schema through v5 and drops claude_aliases", () => {
    const db = createRawTestDb();
    db.exec(`
      CREATE TABLE repos (id INTEGER PRIMARY KEY, owner TEXT, name TEXT);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE deployments (id INTEGER PRIMARY KEY, repo_id INTEGER, issue_number INTEGER, branch_name TEXT, workspace_mode TEXT, workspace_path TEXT);
      CREATE TABLE cache (key TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (1);
    `);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(5);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'claude_aliases'")
      .all();
    expect(tables).toHaveLength(0);
  });

  it("migrates v2 schema to v5 (adds ended_at, drops claude_aliases, adds drafts+issue_metadata)", () => {
    const db = createRawTestDb();
    db.exec(`
      CREATE TABLE claude_aliases (id INTEGER PRIMARY KEY, command TEXT, description TEXT, is_default INTEGER, created_at TEXT);
      CREATE TABLE deployments (id INTEGER PRIMARY KEY, repo_id INTEGER, issue_number INTEGER, branch_name TEXT, workspace_mode TEXT, workspace_path TEXT, linked_pr_number INTEGER, launched_at TEXT);
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (2);
    `);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(5);
    db.prepare("INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path, launched_at, ended_at) VALUES (1, 1, 'b', 'existing', '/x', '2025-01-01', NULL)").run();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'claude_aliases'")
      .all();
    expect(tables).toHaveLength(0);
  });

  it("migrates v3 schema to v5 and drops populated claude_aliases (data loss is intentional)", () => {
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

    expect(getSchemaVersion(db)).toBe(5);
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
  it("initSchema on a fresh DB produces schema version 5", () => {
    const db = createRawTestDb();
    initSchema(db);
    expect(getSchemaVersion(db)).toBe(5);
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

  it("migration from v4 → v5 adds drafts and issue_metadata to an existing DB", () => {
    const db = createRawTestDb();
    // Simulate a v4 DB: run the v4-era schema manually
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
    `);
    expect(getSchemaVersion(db)).toBe(4);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(5);
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
  });
});
