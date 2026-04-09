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
      "claude_aliases",
      "deployments",
      "repos",
      "schema_version",
      "settings",
    ]);
  });

  it("sets schema_version to 2", () => {
    initSchema(db);
    expect(getSchemaVersion(db)).toBe(2);
  });

  it("is idempotent — calling twice does not error or change version", () => {
    initSchema(db);
    initSchema(db);
    expect(getSchemaVersion(db)).toBe(2);
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
    expect(getSchemaVersion(db)).toBe(2);
  });

  it("migrates v1 schema to v2 by adding claude_aliases table", () => {
    const db = createRawTestDb();
    // Simulate a v1 database (no claude_aliases table)
    db.exec(`
      CREATE TABLE repos (id INTEGER PRIMARY KEY, owner TEXT, name TEXT);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE deployments (id INTEGER PRIMARY KEY, repo_id INTEGER, issue_number INTEGER, branch_name TEXT, workspace_mode TEXT, workspace_path TEXT);
      CREATE TABLE cache (key TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (1);
    `);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(2);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'claude_aliases'")
      .all();
    expect(tables).toHaveLength(1);
  });
});
