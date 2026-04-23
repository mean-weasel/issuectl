import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @issuectl/core before importing the actions under test.
// ---------------------------------------------------------------------------

const editCommentMock = vi.hoisted(() => vi.fn());
const removeCommentMock = vi.hoisted(() => vi.fn());
const getDbMock = vi.hoisted(() => vi.fn(() => ({})));
const getRepoMock = vi.hoisted(() =>
  vi.fn(
    (): { id: number; owner: string; name: string } | undefined =>
      ({ id: 1, owner: "acme", name: "web" }),
  ),
);
const withAuthRetryMock = vi.hoisted(() =>
  vi.fn((fn: (octokit: unknown) => unknown) => fn({})),
);
const formatErrorForUserMock = vi.hoisted(() =>
  vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
);

vi.mock("@issuectl/core", () => ({
  getDb: getDbMock,
  getRepo: getRepoMock,
  editComment: editCommentMock,
  removeComment: removeCommentMock,
  withAuthRetry: withAuthRetryMock,
  formatErrorForUser: formatErrorForUserMock,
}));

vi.mock("@/lib/revalidate", () => ({
  revalidateSafely: vi.fn(() => ({ stale: false })),
}));

// Import AFTER mocks are in place.
const { editComment, deleteComment } = await import("./comments.js");

// ---------------------------------------------------------------------------
// editComment
// ---------------------------------------------------------------------------

describe("editComment action", () => {
  it("rejects empty body", async () => {
    const result = await editComment("acme", "web", 1, 100, "   ");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("rejects body exceeding 65536 chars", async () => {
    const longBody = "x".repeat(65537);
    const result = await editComment("acme", "web", 1, 100, longBody);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/65.?536/);
  });

  it("rejects invalid owner", async () => {
    const result = await editComment("../bad", "web", 1, 100, "hello");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("rejects invalid repo", async () => {
    const result = await editComment("acme", "../bad", 1, 100, "hello");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("rejects non-integer issueNumber", async () => {
    const result = await editComment("acme", "web", 1.5, 100, "hello");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("succeeds with valid input", async () => {
    editCommentMock.mockResolvedValue({
      id: 100,
      body: "updated",
      user: null,
      createdAt: "",
      updatedAt: "",
      htmlUrl: "",
    });

    const result = await editComment("acme", "web", 1, 100, "updated");
    expect(result.success).toBe(true);
  });

  it("returns error when repo is not tracked", async () => {
    getRepoMock.mockReturnValueOnce(undefined);
    const result = await editComment("acme", "web", 1, 100, "hello");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not tracked/i);
  });

  it("returns formatted error on API failure", async () => {
    withAuthRetryMock.mockRejectedValueOnce(new Error("API failure"));
    const result = await editComment("acme", "web", 1, 100, "hello");
    expect(result.success).toBe(false);
    expect(result.error).toBe("API failure");
  });
});

// ---------------------------------------------------------------------------
// deleteComment
// ---------------------------------------------------------------------------

describe("deleteComment action", () => {
  it("rejects invalid owner", async () => {
    const result = await deleteComment("../bad", "web", 1, 100);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("rejects invalid repo", async () => {
    const result = await deleteComment("acme", "../bad", 1, 100);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("rejects non-integer issueNumber", async () => {
    const result = await deleteComment("acme", "web", 1.5, 100);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("rejects non-positive commentId", async () => {
    const result = await deleteComment("acme", "web", 1, -5);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("rejects zero commentId", async () => {
    const result = await deleteComment("acme", "web", 1, 0);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("succeeds with valid input", async () => {
    removeCommentMock.mockResolvedValue(undefined);

    const result = await deleteComment("acme", "web", 1, 100);
    expect(result.success).toBe(true);
  });

  it("returns error when repo is not tracked", async () => {
    getRepoMock.mockReturnValueOnce(undefined);
    const result = await deleteComment("acme", "web", 1, 100);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not tracked/i);
  });

  it("returns formatted error on API failure", async () => {
    withAuthRetryMock.mockRejectedValueOnce(new Error("Forbidden"));
    const result = await deleteComment("acme", "web", 1, 100);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Forbidden");
  });
});
