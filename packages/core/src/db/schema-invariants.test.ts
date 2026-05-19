import { describe, it, expect, vi } from "vitest";
import { createRawTestDb, createTestDb } from "./test-helpers.js";
import { initSchema, getSchemaVersion } from "./schema.js";
import { runMigrations } from "./migrations.js";

describe("schema invariants — assumptions other code depends on", () => {
  it("deployments has exactly one unique index, named idx_deployments_live", () => {
    // The race-path catch in launch.ts (executeLaunch step 8) translates
    // any SQLITE_CONSTRAINT_UNIQUE thrown by recordDeployment into the
    // friendly duplicate-launch error. That predicate is only correct
    // because `idx_deployments_live` is the *sole* unique constraint on
    // `deployments` — if a future migration adds another, the catch
    // would misfire and translate the wrong constraint. This test fails
    // loudly so the developer is forced to update the catch in lockstep.
    const db = createTestDb();
    const indexes = db
      .prepare(
        `SELECT name, "unique" FROM pragma_index_list('deployments') WHERE "unique" = 1`,
      )
      .all() as { name: string; unique: number }[];
    expect(indexes).toHaveLength(1);
    expect(indexes[0]?.name).toBe("idx_deployments_live");
  });

  it("no other table has a foreign key referencing deployments", () => {
    // The v8 migration rebuilds `deployments` via CREATE/INSERT/DROP/
    // RENAME without disabling foreign keys. That works only because
    // nothing FK-references `deployments` — if some future table does,
    // the v8 migration is frozen history and won't be updated, so the
    // new migration would need to run with deferred FK enforcement.
    // This test fails loudly so the developer notices when adding such
    // a reference.
    const db = createTestDb();
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'deployments'`,
      )
      .all() as { name: string }[];

    const offenders: Array<{ table: string; from: string }> = [];
    for (const { name } of tables) {
      const fks = db
        .prepare(`SELECT "table" as ref, "from" FROM pragma_foreign_key_list(?)`)
        .all(name) as { ref: string; from: string }[];
      for (const fk of fks) {
        if (fk.ref === "deployments") {
          offenders.push({ table: name, from: fk.from });
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("initSchema does not deadlock against pre-existing duplicate live deployments", () => {
  it("v7 DB with duplicate live rows survives initSchema → runMigrations", () => {
    // Regression test for the production bug where initSchema's
    // CREATE UNIQUE INDEX in CREATE_TABLES failed against an existing
    // v7 DB whose deployments table held duplicate live rows from the
    // pre-R1-idempotency era. The fix moves the index out of
    // CREATE_TABLES; the v9 migration's dedupe pass runs FIRST under
    // runMigrations, then v9 creates the index cleanly.
    //
    // CRUCIAL: getDb's order is initSchema → runMigrations. This test
    // mirrors that exact order. Reordering it would mask the bug.
    const db = createRawTestDb();

    // Build a v7-shaped DB: schema_version=7, action_nonces present
    // (added in v7), CHECK on state column, NO live-unique index.
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
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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
      CREATE TABLE cache (key TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE drafts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'normal',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE issue_metadata (
        repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        issue_number INTEGER NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (repo_id, issue_number)
      );
      CREATE TABLE action_nonces (
        nonce TEXT NOT NULL,
        action_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        result_json TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (nonce, action_type)
      );
      INSERT INTO repos (owner, name) VALUES ('o', 'n');
      -- Two duplicate live deployments for issue #42 — the exact
      -- shape that broke the user's production DB.
      INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path)
        VALUES (1, 42, 'b1', 'existing', '/a');
      INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path)
        VALUES (1, 42, 'b2', 'existing', '/b');
    `);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Mirror getDb's order exactly: initSchema first, then runMigrations.
    expect(() => {
      initSchema(db);
      runMigrations(db);
    }).not.toThrow();

    expect(getSchemaVersion(db)).toBe(14);

    // Verify the dedupe ran and the index now exists.
    const live = db
      .prepare("SELECT id FROM deployments WHERE ended_at IS NULL")
      .all() as { id: number }[];
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(2);

    const indexes = db
      .prepare(`SELECT name FROM pragma_index_list('deployments') WHERE "unique" = 1`)
      .all() as { name: string }[];
    expect(indexes.map((i) => i.name)).toContain("idx_deployments_live");

    warnSpy.mockRestore();
  });

  it("fresh-install initSchema still creates the live-unique index", () => {
    // The fix moves CREATE INDEX out of CREATE_TABLES into the
    // fresh-install branch of initSchema, so this case must remain
    // covered or new installs would be missing the index.
    const db = createTestDb();
    const indexes = db
      .prepare(`SELECT name FROM pragma_index_list('deployments') WHERE "unique" = 1`)
      .all() as { name: string }[];
    expect(indexes.map((i) => i.name)).toContain("idx_deployments_live");
  });

  it("v10 migration creates github_accessible_repos with expected columns", () => {
    const db = createTestDb();
    expect(getSchemaVersion(db)).toBe(14);

    const cols = db
      .prepare("PRAGMA table_info(github_accessible_repos)")
      .all() as { name: string; type: string; pk: number }[];
    const names = cols.map((c) => c.name).sort();
    expect(names).toEqual(["is_private", "name", "owner", "pushed_at", "synced_at"]);

    const pkCols = cols
      .filter((c) => c.pk > 0)
      .map((c) => c.name)
      .sort();
    expect(pkCols).toEqual(["name", "owner"]);
  });

  it("v12 to v14 migration adds deployment agent, default settings, and push devices", () => {
    const db = createRawTestDb();
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (12);
      CREATE TABLE repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        UNIQUE(owner, name)
      );
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO settings (key, value) VALUES ('claude_extra_args', '--dangerously-skip-permissions');
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
        ended_at TEXT,
        ttyd_port INTEGER,
        ttyd_pid INTEGER,
        idle_since TEXT
      );
      INSERT INTO repos (owner, name) VALUES ('o', 'n');
      INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path)
        VALUES (1, 42, 'b', 'existing', '/x');
    `);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(14);
    const deployment = db
      .prepare("SELECT agent FROM deployments WHERE id = 1")
      .get() as { agent: string };
    expect(deployment.agent).toBe("claude");
    expect(
      (db.prepare("SELECT value FROM settings WHERE key = 'launch_agent'").get() as { value: string })
        .value,
    ).toBe("claude");
    expect(
      (db.prepare("SELECT value FROM settings WHERE key = 'codex_extra_args'").get() as { value: string })
        .value,
    ).toBe("");
    expect(() =>
      db.prepare("UPDATE deployments SET agent = 'unknown' WHERE id = 1").run(),
    ).toThrow();
    const pushDeviceCols = db
      .prepare("PRAGMA table_info(push_devices)")
      .all() as { name: string }[];
    expect(pushDeviceCols.map((c) => c.name)).toContain("merged_pull_requests");
  });
});
