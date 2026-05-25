/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.hoisted(() => vi.fn());
const coreAddRepo = vi.hoisted(() => vi.fn());
const createIssuectlWebhook = vi.hoisted(() => vi.fn());
const rotateIssuectlWebhook = vi.hoisted(() => vi.fn());
const coreUpdateRepo = vi.hoisted(() => vi.fn());
const updateRepoWebhookSettings = vi.hoisted(() => vi.fn());
const getRepoById = vi.hoisted(() => vi.fn());
const getSetting = vi.hoisted(() => vi.fn());
const getActiveWebhookDeploymentsForRepoTarget = vi.hoisted(() => vi.fn());
const endDeployment = vi.hoisted(() => vi.fn());
const killTtyd = vi.hoisted(() => vi.fn());
const killTmuxSession = vi.hoisted(() => vi.fn());
const recordDiagnosticEventSafely = vi.hoisted(() => vi.fn());
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
  recordDiagnosticEventSafely: (...args: unknown[]) => recordDiagnosticEventSafely(...args),
  tmuxSessionName: (repo: string, targetNumber: number, targetType?: "issue" | "pr") => tmuxSessionName(repo, targetNumber, targetType),
  addRepo: (...args: unknown[]) => coreAddRepo(...args),
  createIssuectlWebhook: (...args: unknown[]) => createIssuectlWebhook(...args),
  rotateIssuectlWebhook: (...args: unknown[]) => rotateIssuectlWebhook(...args),
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

import { addRepo, configureRepoWebhook, recreateRepoLabels, removeRepo, resendLastPing, updateRepo } from "./repos.js";

beforeEach(() => {
  getDb.mockReturnValue({});
  withAuthRetry.mockReset();
  withAuthRetry.mockImplementation(async (fn: (octokit: unknown) => unknown) =>
    fn({
      rest: {
        repos: {
          get: vi.fn(),
          deleteWebhook: vi.fn(),
          pingWebhook: vi.fn(),
        },
        issues: {
          getLabel: vi.fn(async () => ({ data: {} })),
          createLabel: vi.fn(async () => ({ data: {} })),
        },
      },
    }),
  );
  createIssuectlWebhook.mockReset();
  createIssuectlWebhook.mockResolvedValue({ id: 123, createdBy: "octocat" });
  rotateIssuectlWebhook.mockReset();
  rotateIssuectlWebhook.mockResolvedValue({ id: 123, createdBy: "octocat" });
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
  getRepoById.mockReturnValue({ id: 1, owner: "mean-weasel", name: "issuectl", webhookId: null, autoLaunchIssues: false, autoReviewPrs: false });
  getActiveWebhookDeploymentsForRepoTarget.mockReset();
  getActiveWebhookDeploymentsForRepoTarget.mockReturnValue([]);
  endDeployment.mockReset();
  killTtyd.mockReset();
  killTmuxSession.mockReset();
  tmuxSessionName.mockClear();
  recordDiagnosticEventSafely.mockReset();
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
      reviewPreamble: "Review security boundaries first.",
      webhookPayloadMode: "raw",
    });

    expect(result).toEqual({ success: true });
    expect(coreUpdateRepo).not.toHaveBeenCalled();
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(expect.anything(), 1, {
      autoLaunchIssues: true,
      autoReviewPrs: false,
      issueAgent: "codex",
      reviewAgent: "claude",
      reviewPreamble: "Review security boundaries first.",
      webhookPayloadMode: "raw",
    });
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "repo.automation_enabled",
      owner: "mean-weasel",
      repo: "issuectl",
      data: expect.objectContaining({ targetType: "issue" }),
    }));
  });

  it("ends webhook sessions when repo automation is disabled", async () => {
    getRepoById.mockReturnValue({
      id: 1,
      owner: "mean-weasel",
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
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "repo.automation_disabled",
      owner: "mean-weasel",
      repo: "issuectl",
      data: expect.objectContaining({ targetType: "issue" }),
    }));
  });

  it("rotates, reinstalls, recreates labels, and resends pings with diagnostics", async () => {
    const pingWebhook = vi.fn();
    withAuthRetry.mockImplementation(async (fn: (octokit: unknown) => unknown) =>
      fn({
        rest: {
          repos: {
            get: vi.fn(),
            deleteWebhook: vi.fn(),
            pingWebhook,
          },
          issues: {
            getLabel: vi.fn(async () => ({ data: {} })),
            createLabel: vi.fn(async () => ({ data: {} })),
          },
        },
      }),
    );
    getRepoById.mockReturnValue({
      id: 1,
      owner: "mean-weasel",
      name: "issuectl",
      webhookId: 456,
      autoLaunchIssues: true,
      autoReviewPrs: true,
    });

    await expect(configureRepoWebhook(1, "reinstall")).resolves.toEqual({
      success: true,
      webhook: {
        id: 123,
        url: "https://hooks.example.test/api/webhook/github/1",
        createdBy: "octocat",
      },
    });
    await expect(recreateRepoLabels(1)).resolves.toEqual({ success: true });
    await expect(resendLastPing(1)).resolves.toEqual({ success: true });

    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(expect.anything(), 1, {
      webhookId: 123,
      webhookSecret: expect.any(String),
    });
    expect(pingWebhook).toHaveBeenCalledWith({
      owner: "mean-weasel",
      repo: "issuectl",
      hook_id: 456,
    });
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "repo.webhook_reinstalled",
    }));
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "repo.label_recreated",
    }));
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "repo.webhook_ping_sent",
    }));
  });

  it("removes repos after ending webhook sessions and best-effort deleting the hook", async () => {
    const deleteWebhook = vi.fn();
    withAuthRetry.mockImplementation(async (fn: (octokit: unknown) => unknown) =>
      fn({
        rest: {
          repos: {
            get: vi.fn(),
            deleteWebhook,
            pingWebhook: vi.fn(),
          },
          issues: {
            getLabel: vi.fn(async () => ({ data: {} })),
            createLabel: vi.fn(async () => ({ data: {} })),
          },
        },
      }),
    );
    getRepoById.mockReturnValue({
      id: 1,
      owner: "mean-weasel",
      name: "issuectl",
      webhookId: 789,
      autoLaunchIssues: true,
      autoReviewPrs: true,
    });
    getActiveWebhookDeploymentsForRepoTarget.mockImplementation((_, __, targetType) =>
      targetType === "pr"
        ? [{ id: 44, targetNumber: 44, terminalBackend: "pty_bridge", ttydPid: null }]
        : [],
    );

    await expect(removeRepo(1)).resolves.toEqual({ success: true });

    expect(deleteWebhook).toHaveBeenCalledWith({
      owner: "mean-weasel",
      repo: "issuectl",
      hook_id: 789,
    });
    expect(killTmuxSession).toHaveBeenCalledWith("issuectl-issuectl-pr-44");
    expect(endDeployment).toHaveBeenCalledWith(expect.anything(), 44, "killed_by_label");
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "repo.removed",
      owner: "mean-weasel",
      repo: "issuectl",
    }));
  });
});
