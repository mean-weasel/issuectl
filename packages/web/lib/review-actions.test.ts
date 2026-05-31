import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.hoisted(() => vi.fn());
const getPrReviewById = vi.hoisted(() => vi.fn());
const getRepoById = vi.hoisted(() => vi.fn());
const listPrReviewsForPull = vi.hoisted(() => vi.fn());
const mergeWebhookIntent = vi.hoisted(() => vi.fn());
const recordDiagnosticEventSafely = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getPrReviewById: (...args: unknown[]) => getPrReviewById(...args),
  getRepoById: (...args: unknown[]) => getRepoById(...args),
  listPrReviewsForPull: (...args: unknown[]) => listPrReviewsForPull(...args),
  mergeWebhookIntent: (...args: unknown[]) => mergeWebhookIntent(...args),
  recordDiagnosticEventSafely: (...args: unknown[]) => recordDiagnosticEventSafely(...args),
}));

import { requestPrReviewRun } from "./review-actions";

const db = { prepare: vi.fn() };
const repo = {
  id: 1,
  owner: "mean-weasel",
  name: "issuectl",
  reviewAgent: "codex",
};
const review = {
  id: 901,
  repoId: 1,
  prNumber: 44,
  deploymentId: 700,
  reviewedToSha: "abcdef123456",
};

beforeEach(() => {
  getDb.mockReset();
  getPrReviewById.mockReset();
  getRepoById.mockReset();
  listPrReviewsForPull.mockReset();
  mergeWebhookIntent.mockReset();
  recordDiagnosticEventSafely.mockReset();

  getDb.mockReturnValue(db);
  getPrReviewById.mockReturnValue(review);
  getRepoById.mockReturnValue(repo);
  listPrReviewsForPull.mockReturnValue([{ ...review, status: "completed" }]);
  mergeWebhookIntent.mockReturnValue(55);
});

describe("requestPrReviewRun", () => {
  it("enqueues a retry intent and records diagnostics", () => {
    const result = requestPrReviewRun(901, "retry");

    expect(result).toEqual({
      ok: true,
      reviewId: 901,
      intentId: 55,
      mode: "retry",
      message: "PR review retry requested.",
    });
    expect(mergeWebhookIntent).toHaveBeenCalledWith(db, expect.objectContaining({
      repoId: 1,
      targetType: "pr",
      targetNumber: 44,
      desiredHeadSha: "abcdef123456",
      requestedAgent: "codex",
      reviewMode: "auto",
    }));
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(db, expect.objectContaining({
      event: "pr_review.retry",
      owner: "mean-weasel",
      repo: "issuectl",
      targetType: "pr",
      targetNumber: 44,
    }));
  });

  it("enqueues a full rerun intent", () => {
    const result = requestPrReviewRun(901, "full");

    expect(result).toEqual(expect.objectContaining({ ok: true, mode: "full" }));
    expect(mergeWebhookIntent).toHaveBeenCalledWith(db, expect.objectContaining({
      reviewMode: "full",
    }));
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(db, expect.objectContaining({
      event: "pr_review.manual_rerun",
    }));
  });

  it("rejects action requests while a sibling run is active", () => {
    listPrReviewsForPull.mockReturnValueOnce([{ ...review, id: 902, status: "in_progress" }]);

    const result = requestPrReviewRun(901, "retry");

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Run #902 is still in progress.",
    });
    expect(mergeWebhookIntent).not.toHaveBeenCalled();
  });
});
