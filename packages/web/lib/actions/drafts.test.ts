import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";

// vi.mock is hoisted, so we cannot reference a const declared above it.
// Use vi.hoisted() to create the spies before hoisting occurs.
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const { dbHolder, assignDraftToRepoMock } = vi.hoisted(() => ({
  // Mutable holder so beforeEach can swap in a fresh DB without
  // reassigning the captured-by-closure binding inside the mock factory.
  dbHolder: { db: null as Database.Database | null },
  assignDraftToRepoMock: vi.fn(),
}));

vi.mock("@issuectl/core", async () => {
  // Keep withIdempotency, the error classes, the validation helpers,
  // and initSchema as the real implementations — the wiring test
  // depends on the actual sentinel-table semantics. Override only the
  // bits that touch the network and the DB connection factory.
  const real = await vi.importActual<typeof import("@issuectl/core")>(
    "@issuectl/core",
  );
  return {
    ...real,
    getDb: () => {
      if (!dbHolder.db) throw new Error("test DB not initialised");
      return dbHolder.db;
    },
    withAuthRetry: <T,>(fn: (octokit: unknown) => Promise<T>) => fn({}),
    assignDraftToRepo: (...args: unknown[]) => assignDraftToRepoMock(...args),
  };
});

// Import AFTER mocks are registered.
const { assignDraftAction } = await import("./drafts.js");
const { initSchema } = await import("@issuectl/core");

const VALID_DRAFT_ID = "550e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  // Seed a repo so getRepoById inside assignDraftToRepo would resolve
  // (the mock bypasses that call entirely, but a real schema needs the
  // row for any future test that exercises a non-mocked code path).
  db.prepare("INSERT INTO repos (owner, name) VALUES (?, ?)").run("o", "n");
  // Seed a draft row so the production validators do not short-circuit
  // before the singleflight runs. Same reason — the mocked
  // assignDraftToRepo never reads it but the action's call chain does.
  db.prepare(
    `INSERT INTO drafts (id, title, body, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(VALID_DRAFT_ID, "t", "", "normal", 0, 0);
  dbHolder.db = db;
  assignDraftToRepoMock.mockReset();
  revalidatePath.mockReset();
});

describe("assignDraftAction — singleflight wiring", () => {
  it("two callers with different idempotency keys collapse onto one assignDraftToRepo call", async () => {
    // The actual cross-tab guarantee: tab A and tab B each generate a
    // distinct user nonce, both reach the action, and the inner
    // draftId-keyed sentinel ensures only one of them runs the work.
    // The other replays the stored {issueNumber, issueUrl}.
    assignDraftToRepoMock.mockResolvedValue({
      repoId: 1,
      issueNumber: 42,
      issueUrl: "https://example.invalid/42",
    });

    const tabA = await assignDraftAction(VALID_DRAFT_ID, 1, "tabANonce0001");
    const tabB = await assignDraftAction(VALID_DRAFT_ID, 1, "tabBNonce0002");

    expect(tabA).toMatchObject({ success: true, issueNumber: 42 });
    expect(tabB).toMatchObject({ success: true, issueNumber: 42 });
    // The crucial property — the GitHub-issue-creating call only ran
    // once even though both tabs invoked the action. A regression that
    // unwrapped the inner singleflight would call this twice.
    expect(assignDraftToRepoMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a draftId shorter than 8 characters before invoking the singleflight", async () => {
    // The sibling validators at the top of the function need to share
    // the same length floor as withIdempotency's isValidNonce (8 chars)
    // so the singleflight wrap below cannot trip on a malformed caller
    // with an opaque "Invalid idempotency nonce" error.
    const result = await assignDraftAction("short", 1, "validNonce0001");
    expect(result).toEqual({
      success: false,
      error: "draftId must be at least 8 characters",
    });
    expect(assignDraftToRepoMock).not.toHaveBeenCalled();
  });

  it("same idempotency key replays the stored result without re-invoking the work", async () => {
    // The outer (user-nonce) sentinel — same-tab retries from the
    // existing R1 idempotency. Pinned here to make sure the new
    // singleflight wrap did not break the outer layer.
    assignDraftToRepoMock.mockResolvedValue({
      repoId: 1,
      issueNumber: 42,
      issueUrl: "https://example.invalid/42",
    });

    const first = await assignDraftAction(VALID_DRAFT_ID, 1, "sameNonce0001");
    const second = await assignDraftAction(VALID_DRAFT_ID, 1, "sameNonce0001");

    expect(first).toMatchObject({ success: true, issueNumber: 42 });
    expect(second).toMatchObject({ success: true, issueNumber: 42 });
    expect(assignDraftToRepoMock).toHaveBeenCalledTimes(1);
  });
});
