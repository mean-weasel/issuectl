import Database from "better-sqlite3";
import { initSchema } from "./schema.js";

/** Creates a fresh in-memory SQLite database with the full schema applied.
 *  Also creates the claude_aliases table so alias code still works during
 *  the transition period before Task 7 removes it entirely.
 */
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS claude_aliases (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      command     TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      is_default  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

/** Creates a fresh in-memory SQLite database without schema — for testing schema initialization itself. */
export function createRawTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  return db;
}
