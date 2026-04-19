import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { initSchema } from "./schema.js";
import { runMigrations } from "./migrations.js";
import { reconcileOrphanedDeployments } from "../launch/ttyd.js";

const DEFAULT_DB_PATH = join(homedir(), ".issuectl", "issuectl.db");

export function getDbPath(): string {
  const envPath = process.env.ISSUECTL_DB_PATH;
  if (envPath !== undefined && !envPath.trim()) {
    throw new Error("ISSUECTL_DB_PATH is set but empty. Provide a valid file path or unset it.");
  }
  return envPath ?? DEFAULT_DB_PATH;
}

export function dbExists(): boolean {
  return existsSync(getDbPath());
}

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;
  const dbPath = getDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  runMigrations(db);
  reconcileOrphanedDeployments(db);
  instance = db;
  return db;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
