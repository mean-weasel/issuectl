import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import {
  getSetting,
  setSetting,
  getSettings,
  seedDefaults,
  generateApiToken,
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
    setSetting(db, "worktree_dir", "/tmp/worktrees");
    setSetting(db, "cache_ttl", "300");
    const settings = getSettings(db);
    expect(settings).toHaveLength(2);
    expect(settings[0].key).toBe("cache_ttl");
    expect(settings[1].key).toBe("worktree_dir");
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
    expect(settings).toHaveLength(8);

    const keys = settings.map((s) => s.key);
    expect(keys).toContain("branch_pattern");
    expect(keys).toContain("cache_ttl");
    expect(keys).toContain("worktree_dir");
    expect(keys).toContain("launch_agent");
    expect(keys).toContain("claude_extra_args");
    expect(keys).toContain("codex_extra_args");
    expect(keys).toContain("idle_grace_period");
    expect(keys).toContain("idle_threshold");
  });

  it("seedDefaults sets claude_extra_args to --dangerously-skip-permissions by default", () => {
    seedDefaults(db);
    expect(getSetting(db, "claude_extra_args")).toBe("--dangerously-skip-permissions");
  });

  it("seedDefaults sets the launch agent defaults", () => {
    seedDefaults(db);
    expect(getSetting(db, "launch_agent")).toBe("claude");
    expect(getSetting(db, "codex_extra_args")).toBe("");
  });

  it("uses INSERT OR IGNORE — does not overwrite existing values", () => {
    setSetting(db, "cache_ttl", "999");
    seedDefaults(db);
    expect(getSetting(db, "cache_ttl")).toBe("999");
  });

  it("seeds idle_grace_period and idle_threshold defaults", () => {
    seedDefaults(db);
    expect(getSetting(db, "idle_grace_period")).toBe("300");
    expect(getSetting(db, "idle_threshold")).toBe("300");
  });

  it("is idempotent", () => {
    seedDefaults(db);
    const countAfterFirst = getSettings(db).length;
    seedDefaults(db);
    expect(getSettings(db)).toHaveLength(countAfterFirst);
  });
});

describe("generateApiToken", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("generates and stores a 64-char hex token", () => {
    const token = generateApiToken(db);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(getSetting(db, "api_token")).toBe(token);
  });

  it("returns existing token if already set", () => {
    const first = generateApiToken(db);
    const second = generateApiToken(db);
    expect(second).toBe(first);
  });
});
