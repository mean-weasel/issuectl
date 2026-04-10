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
      db.exec(`DROP TABLE IF EXISTS claude_aliases;`);
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
