import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.hoisted(() => vi.fn());
const coreAddRepo = vi.hoisted(() => vi.fn());
const createIssuectlWebhook = vi.hoisted(() => vi.fn());
const coreUpdateRepo = vi.hoisted(() => vi.fn());
const updateRepoWebhookSettings = vi.hoisted(() => vi.fn());
const getRepoById = vi.hoisted(() => vi.fn());
const getSetting = vi.hoisted(() => vi.fn());
const getActiveWebhookDeploymentsForRepoTarget = vi.hoisted(() => vi.fn());
const endDeployment = vi.hoisted(() => vi.fn());
const killTtyd = vi.hoisted(() => vi.fn());
const killTmuxSession = vi.hoisted(() => vi.fn());
const tmuxSessionName = vi.hoisted(() => vi.fn((repo: string, targetNumber: number, targetType = "issue") => `issuectl-${repo}-${targetType}-${targetNumber}`));
const withAuthRetry = vi.hoisted(() => vi.fn());
const getIssues = vi.hoisted(() => vi.fn());
const getPulls = vi.hoisted(() => vi.fn());
const listWebhookEvents = vi.hoisted(() => vi.fn());
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
  createIssuectlWebhook: (...args: unknown[]) => createIssuectlWebhook(...args),
  removeRepo: vi.fn(),
  updateRepo: (...args: unknown[]) => coreUpdateRepo(...args),
  updateRepoWebhookSettings: (...args: unknown[]) => updateRepoWebhookSettings(...args),
  getSetting: (...args: unknown[]) => getSetting(...args),
  readCachedAccessibleRepos: vi.fn(),
  refreshAccessibleRepos: vi.fn(),
  getIssues: (...args: unknown[]) => getIssues(...args),
  getPulls: (...args: unknown[]) => getPulls(...args),
  listWebhookEvents: (...args: unknown[]) => listWebhookEvents(...args),
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
    fn({
      rest: {
        repos: { get: vi.fn() },
        issues: {
          getLabel: vi.fn(async () => ({ data: {} })),
          createLabel: vi.fn(async () => ({ data: {} })),
        },
      },
    }),
  );
  createIssuectlWebhook.mockReset();
  createIssuectlWebhook.mockResolvedValue({ id: 123, createdBy: "octocat" });
  getSetting.mockReset();
  getSetting.mockReturnValue("https://hooks.example.test");
  getIssues.mockReset();
  getIssues.mockResolvedValue([]);
  getPulls.mockReset();
  getPulls.mockResolvedValue([]);
  listWebhookEvents.mockReset();
  listWebhookEvents.mockReturnValue([]);
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
      install: { webhook: "skipped", labels: [], firstPing: "skipped" },
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

  it("installs the webhook, creates enabled automation labels, and reports first ping timeout", async () => {
    const labelNames: string[] = [];
    withAuthRetry.mockImplementation(async (fn: (octokit: unknown) => unknown) =>
      fn({
        rest: {
          repos: { get: vi.fn() },
          issues: {
            getLabel: vi.fn(async ({ name }: { name: string }) => {
              labelNames.push(name);
              throw Object.assign(new Error("missing"), { status: 404 });
            }),
            createLabel: vi.fn(async ({ name }: { name: string }) => {
              labelNames.push(`created:${name}`);
              return { data: {} };
            }),
          },
        },
      }),
    );

    const result = await addRepo("mean-weasel", "issuectl", undefined, {
      autoLaunchIssues: true,
      autoReviewPrs: true,
      installWebhook: true,
      firstPingTimeoutMs: 0,
    });

    expect(result).toEqual({
      success: true,
      addedRepo: { id: 1, owner: "mean-weasel", name: "issuectl" },
      install: expect.objectContaining({
        webhook: "installed",
        labels: ["issuectl:auto-launch", "issuectl:auto-review"],
        firstPing: "timeout",
        webhookId: 123,
        url: "https://hooks.example.test/api/webhook/github/1",
        createdBy: "octocat",
      }),
      warning: "Webhook installed, but no first delivery arrived before the timeout.",
    });
    expect(createIssuectlWebhook).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      owner: "mean-weasel",
      repo: "issuectl",
      url: "https://hooks.example.test/api/webhook/github/1",
      secret: expect.any(String),
    }));
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(expect.anything(), 1, {
      webhookId: 123,
      webhookSecret: expect.any(String),
    });
    expect(labelNames).toEqual([
      "issuectl:auto-launch",
      "issuectl:auto-review",
      "created:issuectl:auto-launch",
      "created:issuectl:auto-review",
    ]);
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
