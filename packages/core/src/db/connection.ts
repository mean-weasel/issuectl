import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { initSchema } from "./schema.js";
import { runMigrations } from "./migrations.js";

const ISSUECTL_DIR = join(homedir(), ".issuectl");
const DB_FILENAME = "issuectl.db";

export function getDbPath(): string {
  return join(ISSUECTL_DIR, DB_FILENAME);
}

export function dbExists(): boolean {
  return existsSync(getDbPath());
}

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;
  mkdirSync(ISSUECTL_DIR, { recursive: true });
  const db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  runMigrations(db);
  instance = db;
  return db;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
