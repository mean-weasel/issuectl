import type Database from "better-sqlite3";
import { addRepo } from "./repos.js";

export function seedRepo(db: Database.Database) {
  return addRepo(db, { owner: "acme", name: "api" });
}
