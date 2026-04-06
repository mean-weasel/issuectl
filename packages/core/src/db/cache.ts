import type Database from "better-sqlite3";
import type { CacheEntry } from "../types.js";
import { getSetting } from "./settings.js";

export function getCacheTtl(db: Database.Database): number {
  const ttl = getSetting(db, "cache_ttl");
  return ttl ? Number(ttl) : 300;
}

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

export function isFresh(fetchedAt: Date, ttlSeconds: number): boolean {
  return Date.now() - fetchedAt.getTime() < ttlSeconds * 1000;
}

export function clearCacheKey(
  db: Database.Database,
  key: string,
): void {
  db.prepare("DELETE FROM cache WHERE key = ?").run(key);
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
