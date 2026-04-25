import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.mock is hoisted, so we cannot reference a const declared above it.
// Use vi.hoisted() to create the spy before hoisting occurs, then reference it.
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

// In-memory fake DB shared across mocked core functions.
// Includes a stub `transaction` that mirrors better-sqlite3's API shape.
type FakeDb = {
  settings: Map<string, string>;
  transaction: (fn: (pairs: [string, string][]) => void) => (pairs: [string, string][]) => void;
};

let fakeDb: FakeDb;

const setSetting = vi.fn((_db: FakeDb, key: string, value: string) => {
  fakeDb.settings.set(key, value);
});

const getDb = vi.fn(() => fakeDb);

// A spy-able validateClaudeArgs — default implementation accepts everything.
// Tests that need a specific result can override via mockImplementationOnce.
const validateClaudeArgs = vi.fn(
  (_input: string): { ok: boolean; errors: string[]; warnings: string[] } => ({
    ok: true,
    errors: [],
    warnings: [],
  }),
);

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  setSetting: (...args: unknown[]) => {
    const [db, key, value] = args as [FakeDb, string, string];
    return setSetting(db, key, value);
  },
  validateClaudeArgs: (...args: unknown[]) => {
    const [input] = args as [string];
    return validateClaudeArgs(input);
  },
}));

// Import AFTER mocks.
import { updateSetting, updateSettings } from "./settings.js";

function makeFakeDb(): FakeDb {
  const base: FakeDb = {
    settings: new Map(),
    // Simulate better-sqlite3's transaction semantics: snapshot state before
    // running the callback, commit on success, rollback on throw. This lets
    // tests actually verify all-or-nothing behavior when setSetting throws
    // mid-batch (rather than just trusting the identity stub).
    transaction: (fn) => {
      return (pairs) => {
        const snapshot = new Map(base.settings);
        try {
          fn(pairs);
        } catch (err) {
          base.settings = snapshot;
          throw err;
        }
      };
    },
  };
  return base;
}

beforeEach(() => {
  fakeDb = makeFakeDb();
  revalidatePath.mockReset();
  setSetting.mockClear();
  validateClaudeArgs.mockClear();
  validateClaudeArgs.mockImplementation(() => ({ ok: true, errors: [], warnings: [] }));
});

describe("updateSetting", () => {
  it("saves a valid claude_extra_args value", async () => {
    const result = await updateSetting("claude_extra_args", "--verbose");
    expect(result.success).toBe(true);
    expect(fakeDb.settings.get("claude_extra_args")).toBe("--verbose");
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("allows empty claude_extra_args (user clearing the field)", async () => {
    const result = await updateSetting("claude_extra_args", "");
    expect(result.success).toBe(true);
    expect(fakeDb.settings.get("claude_extra_args")).toBe("");
  });

  it("allows whitespace-only claude_extra_args and persists as empty", async () => {
    const result = await updateSetting("claude_extra_args", "   ");
    expect(result.success).toBe(true);
    expect(fakeDb.settings.get("claude_extra_args")).toBe("");
  });

  it("rejects claude_extra_args that fails validation", async () => {
    validateClaudeArgs.mockReturnValueOnce({
      ok: false,
      errors: ["Shell operators not allowed."],
      warnings: [],
    });
    const result = await updateSetting("claude_extra_args", "--foo; rm -rf /");
    expect(result.success).toBe(false);
    expect(result.error).toContain("operators");
    expect(fakeDb.settings.has("claude_extra_args")).toBe(false);
  });

  it("accepts claude_extra_args that produces warnings (warnings pass)", async () => {
    validateClaudeArgs.mockReturnValueOnce({
      ok: true,
      errors: [],
      warnings: ["--unknown is not a recognized flag."],
    });
    const result = await updateSetting("claude_extra_args", "--unknown");
    expect(result.success).toBe(true);
    expect(fakeDb.settings.get("claude_extra_args")).toBe("--unknown");
  });

  it("rejects empty value for a non-claude_extra_args key", async () => {
    const result = await updateSetting("branch_pattern", "");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it("rejects invalid key", async () => {
    const result = await updateSetting("not_a_key" as never, "x");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });

  it("rejects api_token as a user-editable key", async () => {
    const result = await updateSetting("api_token" as never, "attacker-controlled");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid/i);
    expect(fakeDb.settings.has("api_token")).toBe(false);
  });

  it("rejects non-numeric cache_ttl", async () => {
    const result = await updateSetting("cache_ttl", "abc");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/number/i);
  });

  it("rejects negative cache_ttl", async () => {
    const result = await updateSetting("cache_ttl", "-5");
    expect(result.success).toBe(false);
  });

  it("maps SQLITE_BUSY to an actionable error", async () => {
    setSetting.mockImplementationOnce(() => {
      const err = new Error("database is locked") as Error & { code: string };
      err.code = "SQLITE_BUSY";
      throw err;
    });
    const result = await updateSetting("branch_pattern", "main");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/busy|another/i);
  });

  it("falls back to a generic 'Failed to update setting' for unmapped errors", async () => {
    setSetting.mockImplementationOnce(() => {
      throw new Error("some unrecognized failure");
    });
    const result = await updateSetting("branch_pattern", "main");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^Failed to update setting:/);
    expect(result.error).toContain("some unrecognized failure");
  });

  it("returns cacheStale when revalidatePath throws", async () => {
    revalidatePath.mockImplementationOnce(() => {
      throw new Error("revalidation failed");
    });
    const result = await updateSetting("branch_pattern", "main");
    expect(result.success).toBe(true);
    expect(result.cacheStale).toBe(true);
    expect(fakeDb.settings.get("branch_pattern")).toBe("main");
  });
});

describe("updateSettings (batch)", () => {
  it("returns success for empty updates", async () => {
    const result = await updateSettings({});
    expect(result.success).toBe(true);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("applies all updates in one transaction", async () => {
    const result = await updateSettings({
      branch_pattern: "main",
      cache_ttl: "600",
    });
    expect(result.success).toBe(true);
    expect(fakeDb.settings.get("branch_pattern")).toBe("main");
    expect(fakeDb.settings.get("cache_ttl")).toBe("600");
  });

  it("rejects the whole batch if any key fails validation (no partial writes)", async () => {
    validateClaudeArgs.mockImplementationOnce(() => ({
      ok: false,
      errors: ["bad"],
      warnings: [],
    }));

    const result = await updateSettings({
      branch_pattern: "main",
      claude_extra_args: "--foo; rm",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/claude_extra_args/);
    // Critical: neither key should have been written.
    expect(fakeDb.settings.has("branch_pattern")).toBe(false);
    expect(fakeDb.settings.has("claude_extra_args")).toBe(false);
  });

  it("includes the failing key name in the error message", async () => {
    const result = await updateSettings({ cache_ttl: "abc" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cache_ttl/);
  });

  it("rolls back the whole batch when setSetting throws mid-transaction", async () => {
    // Simulate a DB error on the second write. The rollback-aware fake
    // transaction should revert the first successful write.
    let callCount = 0;
    setSetting.mockImplementation((db: FakeDb, key: string, value: string) => {
      callCount += 1;
      if (callCount === 2) {
        throw new Error("simulated DB failure on second write");
      }
      db.settings.set(key, value);
    });

    const result = await updateSettings({
      branch_pattern: "main",
      cache_ttl: "600",
    });

    expect(result.success).toBe(false);
    // Neither write should survive — the transaction rolls back the first.
    expect(fakeDb.settings.has("branch_pattern")).toBe(false);
    expect(fakeDb.settings.has("cache_ttl")).toBe(false);
  });
});
