import type Database from "better-sqlite3";
import { getSchemaVersion } from "./schema.js";

type Migration = {
  version: number;
  up: (db: Database.Database) => void;
};

// Add migrations here as the schema evolves.
// Each migration bumps the version and applies DDL changes.
const migrations: Migration[] = [];

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
