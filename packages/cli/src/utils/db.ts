import type Database from "better-sqlite3";
import { dbExists, getDb } from "@issuectl/core";
import * as log from "./logger.js";

export function requireDb(): Database.Database {
  if (!dbExists()) {
    log.error("No database found. Run `issuectl init` first.");
    process.exit(1);
  }
  return getDb();
}
