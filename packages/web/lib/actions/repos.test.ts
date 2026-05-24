import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.hoisted(() => vi.fn());
const coreUpdateRepo = vi.hoisted(() => vi.fn());
const updateRepoWebhookSettings = vi.hoisted(() => vi.fn());
const getRepoById = vi.hoisted(() => vi.fn());
const getActiveWebhookDeploymentsForRepoTarget = vi.hoisted(() => vi.fn());
const endDeployment = vi.hoisted(() => vi.fn());
const killTtyd = vi.hoisted(() => vi.fn());
const killTmuxSession = vi.hoisted(() => vi.fn());
const tmuxSessionName = vi.hoisted(() => vi.fn((repo: string, targetNumber: number, targetType = "issue") => `issuectl-${repo}-${targetType}-${targetNumber}`));

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getRepoById: (...args: unknown[]) => getRepoById(...args),
  getActiveWebhookDeploymentsForRepoTarget: (...args: unknown[]) => getActiveWebhookDeploymentsForRepoTarget(...args),
  endDeployment: (...args: unknown[]) => endDeployment(...args),
  killTtyd: (...args: unknown[]) => killTtyd(...args),
  killTmuxSession: (...args: unknown[]) => killTmuxSession(...args),
  tmuxSessionName: (repo: string, targetNumber: number, targetType?: "issue" | "pr") => tmuxSessionName(repo, targetNumber, targetType),
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
