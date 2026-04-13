import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import {
  withIdempotency,
  pruneExpiredNonces,
  isValidNonce,
  DuplicateInFlightError,
} from "./idempotency.js";

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isValidNonce", () => {
  it("accepts UUID v4 format", () => {
    expect(isValidNonce("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("accepts alphanumeric tokens with common separators", () => {
    expect(isValidNonce("abc123def456")).toBe(true);
    expect(isValidNonce("a.b-c_d.1234")).toBe(true);
  });

  it("rejects too-short tokens", () => {
    expect(isValidNonce("abc")).toBe(false);
    expect(isValidNonce("1234567")).toBe(false);
  });

  it("rejects too-long tokens", () => {
    expect(isValidNonce("a".repeat(65))).toBe(false);
  });

  it("rejects tokens with dangerous characters", () => {
    expect(isValidNonce("abc'; DROP TABLE")).toBe(false);
    expect(isValidNonce("abc def")).toBe(false);
    expect(isValidNonce("abc\x00def")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isValidNonce(null)).toBe(false);
    expect(isValidNonce(undefined)).toBe(false);
    expect(isValidNonce(42)).toBe(false);
    expect(isValidNonce({ nonce: "abc" })).toBe(false);
  });
});

describe("withIdempotency", () => {
  it("runs fn on first call and returns its result", async () => {
    const fn = vi.fn().mockResolvedValue({ id: 42 });
    const result = await withIdempotency(db, "test-action", "abcd1234efgh", fn);
    expect(result).toEqual({ id: 42 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("replays the stored result on a second call with the same nonce", async () => {
    const fn = vi.fn().mockResolvedValue({ id: 42, url: "https://x" });
    await withIdempotency(db, "create-issue", "nonce-111111", fn);
    const replay = await withIdempotency(db, "create-issue", "nonce-111111", fn);
    expect(replay).toEqual({ id: 42, url: "https://x" });
    // fn should only run once, even though we called withIdempotency twice
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("allows the same nonce across different action types", async () => {
    const fn1 = vi.fn().mockResolvedValue("result-1");
    const fn2 = vi.fn().mockResolvedValue("result-2");
    const nonce = "sharednonce123";
    const r1 = await withIdempotency(db, "action-a", nonce, fn1);
    const r2 = await withIdempotency(db, "action-b", nonce, fn2);
    expect(r1).toBe("result-1");
    expect(r2).toBe("result-2");
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it("reruns fn after a failed attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failed"))
      .mockResolvedValueOnce("recovered");
    const nonce = "retryable12345";
    await expect(
      withIdempotency(db, "retry-action", nonce, fn),
    ).rejects.toThrow("first failed");
    const result = await withIdempotency(db, "retry-action", nonce, fn);
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws DuplicateInFlightError when a pending row exists", () => {
    // Manually seed a pending row — we can't actually test a concurrent
    // in-flight call in a single-threaded test, but the sentinel check
    // is the same code path.
    db.prepare(
      `INSERT INTO action_nonces (nonce, action_type, status, created_at) VALUES (?, ?, 'pending', ?)`,
    ).run("inflight12345", "test", Date.now());

    return expect(
      withIdempotency(db, "test", "inflight12345", async () => "should-not-run"),
    ).rejects.toBeInstanceOf(DuplicateInFlightError);
  });

  it("rejects invalid nonces before touching the DB", async () => {
    const fn = vi.fn();
    await expect(
      withIdempotency(db, "test", "short", fn),
    ).rejects.toThrow(/Invalid idempotency nonce/);
    await expect(
      withIdempotency(db, "test", "abc; DROP TABLE", fn),
    ).rejects.toThrow(/Invalid idempotency nonce/);
    expect(fn).not.toHaveBeenCalled();
  });

  it("serializes null and undefined result values", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const nonce = "undefresult123";
    const r1 = await withIdempotency(db, "void-action", nonce, fn);
    const r2 = await withIdempotency(db, "void-action", nonce, fn);
    expect(r1).toBeUndefined();
    // Replay deserializes null — that's acceptable, the action has no meaningful return value
    expect(r2 === null || r2 === undefined).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("pruneExpiredNonces", () => {
  it("removes rows older than the TTL", () => {
    const oneHourMs = 60 * 60 * 1000;
    const now = Date.now();
    db.prepare(
      `INSERT INTO action_nonces (nonce, action_type, status, created_at) VALUES (?, ?, 'completed', ?)`,
    ).run("oldnonce1234", "test", now - oneHourMs - 1000);
    db.prepare(
      `INSERT INTO action_nonces (nonce, action_type, status, created_at) VALUES (?, ?, 'completed', ?)`,
    ).run("newnonce1234", "test", now);

    const pruned = pruneExpiredNonces(db);
    expect(pruned).toBe(1);

    const remaining = db
      .prepare(`SELECT nonce FROM action_nonces`)
      .all() as { nonce: string }[];
    expect(remaining.map((r) => r.nonce)).toEqual(["newnonce1234"]);
  });
});

describe("withIdempotency — singleflight pattern", () => {
  // Pin the cross-tab idempotency case where the sentinel key is a
  // resource id (e.g. draftId) instead of a per-submission user nonce,
  // so two distinct callers collapse onto the same stored result.

  const draftId = "550e8400-e29b-41d4-a716-446655440000";
  const SINGLEFLIGHT = "assign-draft-singleflight";

  it("a second caller with a different outer nonce replays the first caller's result", async () => {
    // Tab A wins: claims the draftId, runs the work, stores the result.
    // Tab B (different user nonce, same draftId) hits the completed
    // sentinel and replays without re-running the GH-issue-creating
    // inner function. Same issue URL for both tabs — the user is led
    // to the issue tab A actually created.
    const work = vi.fn().mockResolvedValue({
      issueNumber: 42,
      issueUrl: "https://github.com/o/r/issues/42",
    });

    const tabA = await withIdempotency(db, SINGLEFLIGHT, draftId, work);
    const tabB = await withIdempotency(db, SINGLEFLIGHT, draftId, work);

    expect(tabA).toEqual({
      issueNumber: 42,
      issueUrl: "https://github.com/o/r/issues/42",
    });
    expect(tabB).toEqual(tabA);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("a second caller throws DuplicateInFlightError while the first is still pending", async () => {
    // Tab A is mid-flight (pending sentinel row); tab B refuses rather
    // than start a parallel run that would create a duplicate GitHub
    // issue. Tab B's inner work is never invoked.
    let releaseTabA: () => void = () => {};
    const tabAStarted = new Promise<void>((resolve) => {
      releaseTabA = resolve;
    });

    const tabAWork = vi.fn(async () => {
      await tabAStarted;
      return { issueNumber: 42, issueUrl: "https://example.invalid/42" };
    });

    const tabAPromise = withIdempotency(db, SINGLEFLIGHT, draftId, tabAWork);

    const tabBWork = vi.fn().mockResolvedValue({
      issueNumber: 99,
      issueUrl: "should-never-be-returned",
    });

    await expect(
      withIdempotency(db, SINGLEFLIGHT, draftId, tabBWork),
    ).rejects.toBeInstanceOf(DuplicateInFlightError);
    expect(tabBWork).not.toHaveBeenCalled();

    releaseTabA();
    await tabAPromise;
  });

  it("a failed first attempt does not wedge the singleflight slot", async () => {
    // The original assignment failed transiently (e.g. network blip).
    // The next caller is allowed to retry — the failed sentinel is
    // deleted and recreated on the recursive call.
    const failingWork = vi.fn().mockRejectedValue(new Error("network timeout"));
    await expect(
      withIdempotency(db, SINGLEFLIGHT, draftId, failingWork),
    ).rejects.toThrow("network timeout");

    const successfulWork = vi.fn().mockResolvedValue({
      issueNumber: 42,
      issueUrl: "https://example.invalid/42",
    });
    const result = await withIdempotency(
      db,
      SINGLEFLIGHT,
      draftId,
      successfulWork,
    );

    expect(result).toEqual({
      issueNumber: 42,
      issueUrl: "https://example.invalid/42",
    });
    expect(successfulWork).toHaveBeenCalledTimes(1);
  });
});
