import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import type { Setting, SettingKey } from "../types.js";

const DEFAULT_SETTINGS: Setting[] = [
  { key: "branch_pattern", value: "issue-{number}-{slug}" },
  { key: "cache_ttl", value: "300" },
  { key: "worktree_dir", value: "~/.issuectl/worktrees/" },
  { key: "claude_extra_args", value: "--dangerously-skip-permissions" },
  { key: "idle_grace_period", value: "300" },
  { key: "idle_threshold", value: "300" },
];

export function getSetting(
  db: Database.Database,
  key: SettingKey,
): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(
  db: Database.Database,
  key: SettingKey,
  value: string,
): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function getSettings(db: Database.Database): Setting[] {
  return db.prepare("SELECT key, value FROM settings ORDER BY key").all() as Setting[];
}

export function generateApiToken(db: Database.Database): string {
  const existing = getSetting(db, "api_token");
  if (existing) return existing;

  const token = randomBytes(32).toString("hex");
  setSetting(db, "api_token", token);
  return token;
}

export function seedDefaults(db: Database.Database): void {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  );

  const insertAll = db.transaction(() => {
    for (const setting of DEFAULT_SETTINGS) {
      insert.run(setting.key, setting.value);
    }
  });

  insertAll();
}
