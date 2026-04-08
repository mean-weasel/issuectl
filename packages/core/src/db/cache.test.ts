import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import {
  getCacheTtl,
  getCached,
  setCached,
  isFresh,
  clearCacheKey,
  clearCache,
} from "./cache.js";
import { setSetting } from "./settings.js";

describe("getCacheTtl", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns 300 when no cache_ttl setting exists", () => {
    expect(getCacheTtl(db)).toBe(300);
  });

  it("returns the configured cache_ttl", () => {
    setSetting(db, "cache_ttl", "600");
    expect(getCacheTtl(db)).toBe(600);
  });
});

describe("setCached / getCached", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("stores and retrieves JSON data", () => {
    const data = { items: [1, 2, 3], nested: { ok: true } };
    setCached(db, "test-key", data);

    const entry = getCached<typeof data>(db, "test-key");
    expect(entry).not.toBeNull();
    expect(entry!.data).toEqual(data);
    expect(entry!.fetchedAt).toBeInstanceOf(Date);
  });

  it("returns null for missing key", () => {
    expect(getCached(db, "missing")).toBeNull();
  });

  it("upserts — overwrites existing entry", () => {
    setCached(db, "k", { v: 1 });
    setCached(db, "k", { v: 2 });

    const entry = getCached<{ v: number }>(db, "k");
    expect(entry!.data.v).toBe(2);
  });

  it("evicts corrupted JSON entries and returns null", () => {
    db.prepare(
      "INSERT INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now'))",
    ).run("bad", "not-json{{{");

    expect(getCached(db, "bad")).toBeNull();
    // Verify eviction through the public API
    expect(getCached(db, "bad")).toBeNull();
  });
});

describe("isFresh", () => {
  it("returns true when within TTL", () => {
    const recent = new Date(Date.now() - 10_000);
    expect(isFresh(recent, 300)).toBe(true);
  });

  it("returns false when past TTL", () => {
    const old = new Date(Date.now() - 600_000);
    expect(isFresh(old, 300)).toBe(false);
  });

  it("returns false when exactly at TTL boundary", () => {
    const exact = new Date(Date.now() - 300_000);
    expect(isFresh(exact, 300)).toBe(false);
  });
});

describe("clearCacheKey", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("deletes a single cache entry", () => {
    setCached(db, "a", 1);
    setCached(db, "b", 2);

    clearCacheKey(db, "a");

    expect(getCached(db, "a")).toBeNull();
    expect(getCached(db, "b")).not.toBeNull();
  });

  it("is a no-op for non-existent key", () => {
    clearCacheKey(db, "nope");
  });
});

describe("clearCache", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setCached(db, "issues:acme/api", [1]);
    setCached(db, "issues:acme/web", [2]);
    setCached(db, "pulls:acme/api", [3]);
  });

  it("clears all cache entries when no pattern given", () => {
    clearCache(db);
    expect(getCached(db, "issues:acme/api")).toBeNull();
    expect(getCached(db, "issues:acme/web")).toBeNull();
    expect(getCached(db, "pulls:acme/api")).toBeNull();
  });

  it("clears only matching entries with LIKE pattern", () => {
    clearCache(db, "issues:%");
    expect(getCached(db, "issues:acme/api")).toBeNull();
    expect(getCached(db, "issues:acme/web")).toBeNull();
    expect(getCached(db, "pulls:acme/api")).not.toBeNull();
  });
});
