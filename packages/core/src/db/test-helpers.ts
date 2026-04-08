import Database from "better-sqlite3";
import { initSchema } from "./schema.js";

/** Creates a fresh in-memory SQLite database with the full schema applied. */
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

/** Creates a fresh in-memory SQLite database without schema — for testing schema initialization itself. */
export function createRawTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  return db;
}
