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

// Opportunistic pruning: run at most once every 10 minutes
const PRUNE_INTERVAL_MS = 10 * 60 * 1000;
const PRUNE_OLDER_THAN_SECONDS = 24 * 60 * 60; // 24 hours
let lastPruneAt = 0;

export function setCached(
  db: Database.Database,
  key: string,
  data: unknown,
): void {
  db.prepare(
    "INSERT INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at",
  ).run(key, JSON.stringify(data));

  const now = Date.now();
  if (now - lastPruneAt > PRUNE_INTERVAL_MS) {
    lastPruneAt = now;
    setImmediate(() => {
      try {
        pruneStaleCache(db, PRUNE_OLDER_THAN_SECONDS);
      } catch (err) {
        console.error("[issuectl] Background cache prune failed:", err);
      }
    });
  }
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

export function getOldestCacheAge(db: Database.Database): number | null {
  try {
    const row = db
      .prepare("SELECT MIN(fetched_at) as oldest FROM cache")
      .get() as { oldest: string | null } | undefined;
    if (!row?.oldest) return null;
    return new Date(row.oldest + "Z").getTime();
  } catch {
    // Column may not exist in older schema versions
    return null;
  }
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

/**
 * Delete cache entries whose fetched_at is older than the given threshold.
 * Returns the number of rows removed.
 */
export function pruneStaleCache(
  db: Database.Database,
  olderThanSeconds: number,
): number {
  const result = db
    .prepare(
      "DELETE FROM cache WHERE fetched_at < datetime('now', ?)",
    )
    .run(`-${olderThanSeconds} seconds`);
  return result.changes;
}
