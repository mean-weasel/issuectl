import type Database from "better-sqlite3";
import type { CacheEntry } from "../types.js";

export function getCached<T>(
  db: Database.Database,
  key: string,
): CacheEntry<T> | null {
  const row = db
    .prepare("SELECT data, fetched_at FROM cache WHERE key = ?")
    .get(key) as { data: string; fetched_at: string } | undefined;

  if (!row) return null;

  try {
    return {
      data: JSON.parse(row.data) as T,
      fetchedAt: new Date(row.fetched_at + "Z"),
    };
  } catch {
    // Corrupt cache entry — evict and treat as miss
    db.prepare("DELETE FROM cache WHERE key = ?").run(key);
    return null;
  }
}

export function setCached(
  db: Database.Database,
  key: string,
  data: unknown,
): void {
  db.prepare(
    "INSERT INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at",
  ).run(key, JSON.stringify(data));
}

export function isFresh(
  db: Database.Database,
  key: string,
  ttlSeconds: number,
): boolean {
  const row = db
    .prepare("SELECT fetched_at FROM cache WHERE key = ?")
    .get(key) as { fetched_at: string } | undefined;

  if (!row) return false;

  const fetchedAt = new Date(row.fetched_at + "Z").getTime();
  const now = Date.now();
  return now - fetchedAt < ttlSeconds * 1000;
}

export function clearCache(
  db: Database.Database,
  keyPattern?: string,
): void {
  if (keyPattern) {
    db.prepare("DELETE FROM cache WHERE key LIKE ?").run(keyPattern);
  } else {
    db.prepare("DELETE FROM cache").run();
  }
}
