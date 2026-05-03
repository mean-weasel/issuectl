import { describe, expect, it, vi, beforeEach } from "vitest";

const coreMocks = vi.hoisted(() => ({
  getDb: vi.fn(() => ({})),
  getRepo: vi.fn(),
  setSetting: vi.fn(),
  createIssue: vi.fn(),
  clearCacheKey: vi.fn(),
  withAuthRetry: vi.fn((fn: (octokit: unknown) => Promise<unknown>) => fn({})),
  withIdempotency: vi.fn(
    (_db: unknown, _action: string, _key: string, fn: () => Promise<unknown>) =>
      fn(),
  ),
}));

vi.mock("@issuectl/core", async () => {
  const real = await vi.importActual<typeof import("@issuectl/core")>(
    "@issuectl/core",
  );
  return {
    ...real,
    getDb: coreMocks.getDb,
    getRepo: coreMocks.getRepo,
    setSetting: coreMocks.setSetting,
    createIssue: coreMocks.createIssue,
    clearCacheKey: coreMocks.clearCacheKey,
    withAuthRetry: coreMocks.withAuthRetry,
    withIdempotency: coreMocks.withIdempotency,
  };
});

vi.mock("@/lib/revalidate", () => ({
  revalidateSafely: () => ({ stale: false }),
}));

const { createIssue } = await import("./issues");

beforeEach(() => {
  vi.clearAllMocks();
  coreMocks.getDb.mockReturnValue({});
  coreMocks.setSetting.mockReset();
  coreMocks.getRepo.mockReturnValue({
    id: 7,
    owner: "acme",
    name: "api",
    localPath: null,
    branchPattern: null,
    createdAt: "2026-01-01 00:00:00",
  });
  coreMocks.createIssue.mockResolvedValue({ number: 123 });
});

describe("createIssue action", () => {
  it("stores the created issue repo as the next default repo", async () => {
    const result = await createIssue({
      owner: "acme",
      repo: "api",
      title: "Fix cache invalidation",
    });

    expect(result).toEqual({ success: true, issueNumber: 123 });
    expect(coreMocks.setSetting).toHaveBeenCalledWith(
      {},
      "default_repo_id",
      "7",
    );
  });

  it("does not update the default repo when the repo is not tracked", async () => {
    coreMocks.getRepo.mockReturnValue(undefined);

    const result = await createIssue({
      owner: "acme",
      repo: "missing",
      title: "Fix cache invalidation",
    });

    expect(result).toEqual({
      success: false,
      error: "Repository is not tracked",
    });
    expect(coreMocks.createIssue).not.toHaveBeenCalled();
    expect(coreMocks.setSetting).not.toHaveBeenCalled();
  });

  it("still succeeds if persisting the default repo fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    coreMocks.setSetting.mockImplementation(() => {
      throw new Error("db busy");
    });

    const result = await createIssue({
      owner: "acme",
      repo: "api",
      title: "Fix cache invalidation",
    });

    expect(result).toEqual({ success: true, issueNumber: 123 });
    warn.mockRestore();
  });
});
