import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import {
  getSetting,
  setSetting,
  getSettings,
  seedDefaults,
} from "./settings.js";

describe("getSetting / setSetting", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns undefined for unset key", () => {
    expect(getSetting(db, "cache_ttl")).toBeUndefined();
  });

  it("stores and retrieves a setting", () => {
    setSetting(db, "cache_ttl", "600");
    expect(getSetting(db, "cache_ttl")).toBe("600");
  });

  it("upserts — overwrites existing value", () => {
    setSetting(db, "cache_ttl", "300");
    setSetting(db, "cache_ttl", "900");
    expect(getSetting(db, "cache_ttl")).toBe("900");
  });
});

describe("getSettings", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns empty array when no settings exist", () => {
    expect(getSettings(db)).toEqual([]);
  });

  it("returns all settings ordered by key", () => {
    setSetting(db, "terminal_mode", "tab");
    setSetting(db, "cache_ttl", "300");
    const settings = getSettings(db);
    expect(settings).toHaveLength(2);
    expect(settings[0].key).toBe("cache_ttl");
    expect(settings[1].key).toBe("terminal_mode");
  });
});

describe("seedDefaults", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("inserts all default settings", () => {
    seedDefaults(db);
    const settings = getSettings(db);
    expect(settings.length).toBeGreaterThanOrEqual(5);

    const keys = settings.map((s) => s.key);
    expect(keys).toContain("branch_pattern");
    expect(keys).toContain("terminal_app");
    expect(keys).toContain("terminal_mode");
    expect(keys).toContain("cache_ttl");
    expect(keys).toContain("worktree_dir");
  });

  it("uses INSERT OR IGNORE — does not overwrite existing values", () => {
    setSetting(db, "cache_ttl", "999");
    seedDefaults(db);
    expect(getSetting(db, "cache_ttl")).toBe("999");
  });

  it("is idempotent", () => {
    seedDefaults(db);
    const countAfterFirst = getSettings(db).length;
    seedDefaults(db);
    expect(getSettings(db)).toHaveLength(countAfterFirst);
  });
});
