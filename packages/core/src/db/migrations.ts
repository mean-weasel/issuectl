import type Database from "better-sqlite3";
import { getSchemaVersion } from "./schema.js";

type Migration = {
  version: number;
  up: (db: Database.Database) => void;
};

const migrations: Migration[] = [
  {
    version: 2,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS claude_aliases (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          command     TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL DEFAULT '',
          is_default  INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    version: 3,
    up(db) {
      db.exec(`ALTER TABLE deployments ADD COLUMN ended_at TEXT;`);
    },
  },
  {
    version: 4,
    up(db) {
      // Log how many rows are being destroyed so users/operators have a paper
      // trail when the alias feature's data disappears. The table may not exist
      // on fresh installs, so the count query is itself guarded.
      const row = db
        .prepare(
          "SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'claude_aliases'",
        )
        .get() as { c: number };
      if (row.c > 0) {
        const { n } = db
          .prepare("SELECT COUNT(*) as n FROM claude_aliases")
          .get() as { n: number };
        if (n > 0) {
          console.warn(
            `[issuectl] Migration v4: dropping claude_aliases table containing ${n} row(s). The alias feature has been replaced by the claude_extra_args setting.`,
          );
        }
      }
      db.exec(`DROP TABLE IF EXISTS claude_aliases;`);
    },
  },
  {
    version: 5,
    up(db) {
      // Adds two new tables for the Paper reskin: drafts (local-only
      // scratchpad for issues not yet pushed to GitHub) and issue_metadata
      // (per-issue local annotations — currently just priority, since
      // GitHub has no native priority field). Both tables enforce the
      // priority CHECK constraint matching the TypeScript Priority union.
      db.exec(`
        CREATE TABLE IF NOT EXISTS drafts (
          id         TEXT PRIMARY KEY,
          title      TEXT NOT NULL,
          body       TEXT NOT NULL DEFAULT '',
          priority   TEXT NOT NULL DEFAULT 'normal'
                     CHECK (priority IN ('low', 'normal', 'high')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS issue_metadata (
          repo_id      INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          issue_number INTEGER NOT NULL,
          priority     TEXT NOT NULL DEFAULT 'normal'
                       CHECK (priority IN ('low', 'normal', 'high')),
          updated_at   INTEGER NOT NULL,
          PRIMARY KEY (repo_id, issue_number)
        );
      `);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  const currentVersion = getSchemaVersion(db);

  const pending = migrations.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return;

  const applyAll = db.transaction(() => {
    for (const migration of pending) {
      migration.up(db);
      db.prepare("UPDATE schema_version SET version = ?").run(
        migration.version,
      );
    }
  });

  applyAll();
}
