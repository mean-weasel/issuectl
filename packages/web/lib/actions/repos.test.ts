import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.hoisted(() => vi.fn());
const coreUpdateRepo = vi.hoisted(() => vi.fn());
const updateRepoWebhookSettings = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  addRepo: vi.fn(),
  removeRepo: vi.fn(),
  updateRepo: (...args: unknown[]) => coreUpdateRepo(...args),
  updateRepoWebhookSettings: (...args: unknown[]) => updateRepoWebhookSettings(...args),
  readCachedAccessibleRepos: vi.fn(),
  refreshAccessibleRepos: vi.fn(),
  getIssues: vi.fn(),
  getPulls: vi.fn(),
  listLabels: vi.fn(),
  withAuthRetry: vi.fn(),
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

vi.mock("@/lib/revalidate", () => ({
  revalidateSafely: () => ({ stale: false }),
}));

import { updateRepo } from "./repos.js";

beforeEach(() => {
  getDb.mockReturnValue({});
  coreUpdateRepo.mockReset();
  updateRepoWebhookSettings.mockReset();
});

describe("updateRepo action", () => {
  it("updates webhook settings without requiring path changes", async () => {
    const result = await updateRepo(1, {
      autoLaunchIssues: true,
      autoReviewPrs: false,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    });

    expect(result).toEqual({ success: true });
    expect(coreUpdateRepo).not.toHaveBeenCalled();
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(expect.anything(), 1, {
      autoLaunchIssues: true,
      autoReviewPrs: false,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    });
  });
});
