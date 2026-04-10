import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createRawTestDb } from "./test-helpers.js";
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
      "repos",
      "schema_version",
      "settings",
    ]);
  });

  it("sets schema_version to 4", () => {
    initSchema(db);
    expect(getSchemaVersion(db)).toBe(4);
  });

  it("is idempotent — calling twice does not error or change version", () => {
    initSchema(db);
    initSchema(db);
    expect(getSchemaVersion(db)).toBe(4);
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
    expect(getSchemaVersion(db)).toBe(4);
  });

  it("migrates v1 schema through v4 and drops claude_aliases", () => {
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

    expect(getSchemaVersion(db)).toBe(4);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'claude_aliases'")
      .all();
    expect(tables).toHaveLength(0);
  });

  it("migrates v2 schema to v4 (adds ended_at, drops claude_aliases)", () => {
    const db = createRawTestDb();
    db.exec(`
      CREATE TABLE claude_aliases (id INTEGER PRIMARY KEY, command TEXT, description TEXT, is_default INTEGER, created_at TEXT);
      CREATE TABLE deployments (id INTEGER PRIMARY KEY, repo_id INTEGER, issue_number INTEGER, branch_name TEXT, workspace_mode TEXT, workspace_path TEXT, linked_pr_number INTEGER, launched_at TEXT);
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (2);
    `);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(4);
    db.prepare("INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path, launched_at, ended_at) VALUES (1, 1, 'b', 'existing', '/x', '2025-01-01', NULL)").run();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'claude_aliases'")
      .all();
    expect(tables).toHaveLength(0);
  });
});
