import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.hoisted(() => vi.fn());
const coreAddRepo = vi.hoisted(() => vi.fn());
const coreUpdateRepo = vi.hoisted(() => vi.fn());
const updateRepoWebhookSettings = vi.hoisted(() => vi.fn());
const getRepoById = vi.hoisted(() => vi.fn());
const getActiveWebhookDeploymentsForRepoTarget = vi.hoisted(() => vi.fn());
const endDeployment = vi.hoisted(() => vi.fn());
const killTtyd = vi.hoisted(() => vi.fn());
const killTmuxSession = vi.hoisted(() => vi.fn());
const tmuxSessionName = vi.hoisted(() => vi.fn((repo: string, targetNumber: number, targetType = "issue") => `issuectl-${repo}-${targetType}-${targetNumber}`));
const withAuthRetry = vi.hoisted(() => vi.fn());
const getIssues = vi.hoisted(() => vi.fn());
const getPulls = vi.hoisted(() => vi.fn());
const listLabels = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getRepoById: (...args: unknown[]) => getRepoById(...args),
  getActiveWebhookDeploymentsForRepoTarget: (...args: unknown[]) => getActiveWebhookDeploymentsForRepoTarget(...args),
  endDeployment: (...args: unknown[]) => endDeployment(...args),
  killTtyd: (...args: unknown[]) => killTtyd(...args),
  killTmuxSession: (...args: unknown[]) => killTmuxSession(...args),
  tmuxSessionName: (repo: string, targetNumber: number, targetType?: "issue" | "pr") => tmuxSessionName(repo, targetNumber, targetType),
  addRepo: (...args: unknown[]) => coreAddRepo(...args),
  removeRepo: vi.fn(),
  updateRepo: (...args: unknown[]) => coreUpdateRepo(...args),
  updateRepoWebhookSettings: (...args: unknown[]) => updateRepoWebhookSettings(...args),
  readCachedAccessibleRepos: vi.fn(),
  refreshAccessibleRepos: vi.fn(),
  getIssues: (...args: unknown[]) => getIssues(...args),
  getPulls: (...args: unknown[]) => getPulls(...args),
  listLabels: (...args: unknown[]) => listLabels(...args),
  withAuthRetry: (...args: unknown[]) => withAuthRetry(...args),
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

vi.mock("@/lib/revalidate", () => ({
  revalidateSafely: () => ({ stale: false }),
}));

import { addRepo, updateRepo } from "./repos.js";

beforeEach(() => {
  getDb.mockReturnValue({});
  withAuthRetry.mockReset();
  withAuthRetry.mockImplementation(async (fn: (octokit: unknown) => unknown) =>
    fn({ rest: { repos: { get: vi.fn() } } }),
  );
  getIssues.mockReset();
  getIssues.mockResolvedValue([]);
  getPulls.mockReset();
  getPulls.mockResolvedValue([]);
  listLabels.mockReset();
  listLabels.mockResolvedValue([]);
  coreAddRepo.mockReset();
  coreAddRepo.mockReturnValue({ id: 1, owner: "mean-weasel", name: "issuectl" });
  coreUpdateRepo.mockReset();
  updateRepoWebhookSettings.mockReset();
  getRepoById.mockReset();
  getRepoById.mockReturnValue({ id: 1, name: "issuectl", autoLaunchIssues: false, autoReviewPrs: false });
  getActiveWebhookDeploymentsForRepoTarget.mockReset();
  getActiveWebhookDeploymentsForRepoTarget.mockReturnValue([]);
  endDeployment.mockReset();
  killTtyd.mockReset();
  killTmuxSession.mockReset();
  tmuxSessionName.mockClear();
});

describe("updateRepo action", () => {
  it("adds a repo and persists onboarding automation choices", async () => {
    const result = await addRepo("mean-weasel", "issuectl", undefined, {
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    });

    expect(result).toEqual({
      success: true,
      addedRepo: { id: 1, owner: "mean-weasel", name: "issuectl" },
    });
    expect(coreAddRepo).toHaveBeenCalledWith(expect.anything(), {
      owner: "mean-weasel",
      name: "issuectl",
      localPath: undefined,
    });
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(expect.anything(), 1, {
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    });
  });

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

  it("ends webhook sessions when repo automation is disabled", async () => {
    getRepoById.mockReturnValue({
      id: 1,
      name: "issuectl",
      autoLaunchIssues: true,
      autoReviewPrs: false,
    });
    getActiveWebhookDeploymentsForRepoTarget.mockReturnValue([{
      id: 12,
      targetNumber: 506,
      terminalBackend: "ttyd",
      ttydPid: 123,
    }]);

    const result = await updateRepo(1, { autoLaunchIssues: false });

    expect(result).toEqual({ success: true });
    expect(killTtyd).toHaveBeenCalledWith(123, "issuectl-issuectl-issue-506");
    expect(endDeployment).toHaveBeenCalledWith(expect.anything(), 12, "killed_by_label");
  });
});
