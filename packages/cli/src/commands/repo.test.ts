/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirm, input } from "@inquirer/prompts";
import {
  addRepo,
  createIssuectlWebhook,
  endDeployment,
  getRepo,
  getActiveWebhookDeploymentsForRepoTarget,
  listWebhookEvents,
  markActivePrReviewForDeploymentTerminal,
  removeRepo,
  killTmuxSession,
  killTtyd,
  recordDiagnosticEventSafely,
  setSetting,
  tmuxSessionName,
  updateRepo,
  updateRepoWebhookSettings,
  withAuthRetry,
  type Repo,
} from "@issuectl/core";
import { execFileSync } from "node:child_process";
import { requireDb } from "../utils/db.js";
import { repoAddCommand, repoRemoveCommand, repoSetCommand, repoShowCommand, repoUpdateCommand } from "./repo.js";

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
  input: vi.fn(async () => ""),
}));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: vi.fn(),
}));

vi.mock("@issuectl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@issuectl/core")>();
  return {
    ...actual,
    addRepo: vi.fn(),
    createIssuectlWebhook: vi.fn(),
    removeRepo: vi.fn(),
    getRepo: vi.fn(),
    getActiveWebhookDeploymentsForRepoTarget: vi.fn(),
    listWebhookEvents: vi.fn(),
    markActivePrReviewForDeploymentTerminal: vi.fn(),
    endDeployment: vi.fn(),
    killTmuxSession: vi.fn(),
    killTtyd: vi.fn(),
    recordDiagnosticEventSafely: vi.fn(),
    setSetting: vi.fn(),
    tmuxSessionName: vi.fn((repo: string, targetNumber: number, targetType = "issue") => `issuectl-${repo}-${targetType}-${targetNumber}`),
    updateRepo: vi.fn(),
    updateRepoWebhookSettings: vi.fn(),
    withAuthRetry: vi.fn(),
  };
});

vi.mock("../utils/db.js", () => ({
  requireDb: vi.fn(),
}));

const mockDb = {};

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 1,
    owner: "mean-weasel",
    name: "issuectl",
    localPath: null,
    branchPattern: null,
    autoLaunchIssues: false,
    autoReviewPrs: false,
    issueAgent: "claude",
    reviewAgent: "codex",
    webhookId: null,
    reviewPreamble: null,
    webhookPayloadMode: "metadata",
    createdAt: "2026-05-23T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(requireDb).mockReturnValue(mockDb as never);
  vi.mocked(confirm).mockReset();
  vi.mocked(input).mockReset();
  vi.mocked(input).mockResolvedValue("");
  vi.mocked(execFileSync).mockReset();
  vi.mocked(execFileSync).mockReturnValue("Token scopes: repo, admin:repo_hook");
  vi.mocked(addRepo).mockReset();
  vi.mocked(createIssuectlWebhook).mockReset();
  vi.mocked(createIssuectlWebhook).mockResolvedValue({ id: 123, createdBy: "octocat" });
  vi.mocked(getRepo).mockReset();
  vi.mocked(getActiveWebhookDeploymentsForRepoTarget).mockReset();
  vi.mocked(getActiveWebhookDeploymentsForRepoTarget).mockReturnValue([]);
  vi.mocked(listWebhookEvents).mockReset();
  vi.mocked(listWebhookEvents).mockReturnValue([{
    id: 1,
    deliveryId: "ping-1",
    repoId: 1,
    eventType: "ping",
    action: null,
    senderLogin: null,
    targetType: null,
    targetNumber: null,
    payloadJson: null,
    receivedAt: 1,
    intentId: null,
  }]);
  vi.mocked(markActivePrReviewForDeploymentTerminal).mockReset();
  vi.mocked(endDeployment).mockReset();
  vi.mocked(killTmuxSession).mockReset();
  vi.mocked(killTtyd).mockReset();
  vi.mocked(recordDiagnosticEventSafely).mockReset();
  vi.mocked(setSetting).mockReset();
  vi.mocked(tmuxSessionName).mockClear();
  vi.mocked(updateRepo).mockReset();
  vi.mocked(updateRepoWebhookSettings).mockReset();
  vi.mocked(withAuthRetry).mockReset();
  vi.mocked(withAuthRetry).mockImplementation(async (fn: (octokit: never) => unknown) =>
    fn({
      rest: {
        issues: {
          getLabel: vi.fn(async () => ({ data: {} })),
          createLabel: vi.fn(async () => ({ data: {} })),
        },
        repos: {
          deleteWebhook: vi.fn(async () => ({ data: {} })),
        },
      },
    } as never),
  );
});

describe("repo commands", () => {
  it("adds a repo with webhook automation flags", async () => {
    vi.mocked(getRepo).mockReturnValue(undefined);
    vi.mocked(addRepo).mockReturnValue(makeRepo());
    vi.mocked(updateRepoWebhookSettings).mockReturnValue(makeRepo({
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    }));

    await repoAddCommand("mean-weasel/issuectl", {
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    });

    expect(addRepo).toHaveBeenCalledWith(mockDb, {
      owner: "mean-weasel",
      name: "issuectl",
      localPath: undefined,
    });
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(mockDb, 1, {
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    });
    expect(createIssuectlWebhook).not.toHaveBeenCalled();
  });

  it("prompts for repo automation during add and runs local preflight", async () => {
    vi.mocked(getRepo).mockReturnValue(undefined);
    vi.mocked(addRepo).mockReturnValue(makeRepo());
    vi.mocked(confirm)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    vi.mocked(input)
      .mockResolvedValueOnce("~/Desktop/issuectl")
      .mockResolvedValueOnce("claude")
      .mockResolvedValueOnce("raw")
      .mockResolvedValueOnce("https://hooks.example.test/");

    await repoAddCommand("mean-weasel/issuectl", {});

    expect(confirm).toHaveBeenCalledWith({
      message: "Auto-launch issue sessions from webhooks?",
      default: false,
    });
    expect(confirm).toHaveBeenCalledWith({
      message: "Reserve PRs for automatic review from webhooks?",
      default: false,
    });
    expect(execFileSync).toHaveBeenCalledWith("gh", ["auth", "status", "--show-token-scopes"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(execFileSync).toHaveBeenCalledWith("cloudflared", ["--version"], { stdio: "ignore" });
    expect(addRepo).toHaveBeenCalledWith(mockDb, {
      owner: "mean-weasel",
      name: "issuectl",
      localPath: "~/Desktop/issuectl",
    });
    expect(setSetting).toHaveBeenCalledWith(mockDb, "public_webhook_base_url", "https://hooks.example.test");
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(mockDb, 1, {
      autoLaunchIssues: true,
      autoReviewPrs: false,
      issueAgent: "claude",
      webhookPayloadMode: "raw",
    });
    expect(createIssuectlWebhook).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      owner: "mean-weasel",
      repo: "issuectl",
      url: "https://hooks.example.test/api/webhook/github/1",
      secret: expect.any(String),
    }));
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(mockDb, 1, {
      webhookId: 123,
      webhookSecret: expect.any(String),
    });
  });

  it("defaults interactive webhook automation to opt-in and skips automation prompts when declined", async () => {
    vi.mocked(getRepo).mockReturnValue(undefined);
    vi.mocked(addRepo).mockReturnValue(makeRepo());
    vi.mocked(confirm)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    vi.mocked(input).mockResolvedValueOnce("");

    await repoAddCommand("mean-weasel/issuectl", {});

    expect(confirm).toHaveBeenCalledWith({
      message: "Auto-launch issue sessions from webhooks?",
      default: false,
    });
    expect(confirm).toHaveBeenCalledWith({
      message: "Reserve PRs for automatic review from webhooks?",
      default: false,
    });
    expect(input).toHaveBeenCalledTimes(1);
    expect(execFileSync).not.toHaveBeenCalled();
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(mockDb, 1, {
      autoLaunchIssues: false,
      autoReviewPrs: false,
    });
    expect(createIssuectlWebhook).not.toHaveBeenCalled();
  });

  it("defaults prompted automation agents to claude", async () => {
    vi.mocked(getRepo).mockReturnValue(undefined);
    vi.mocked(addRepo).mockReturnValue(makeRepo());
    vi.mocked(confirm)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    vi.mocked(input)
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("metadata")
      .mockResolvedValueOnce("");

    await repoAddCommand("mean-weasel/issuectl", {});

    expect(input).toHaveBeenCalledWith(expect.objectContaining({
      message: "Issue session agent",
      default: "claude",
    }));
    expect(input).toHaveBeenCalledWith(expect.objectContaining({
      message: "PR review agent",
      default: "claude",
    }));
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(mockDb, 1, {
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "claude",
      reviewAgent: "claude",
      webhookPayloadMode: "metadata",
    });
  });

  it("updates webhook automation settings on an existing repo", async () => {
    vi.mocked(getRepo).mockReturnValue(makeRepo());
    vi.mocked(updateRepoWebhookSettings).mockReturnValue(makeRepo({
      autoLaunchIssues: true,
      autoReviewPrs: false,
      issueAgent: "codex",
    }));

    await repoUpdateCommand("mean-weasel/issuectl", {
      autoLaunchIssues: true,
      autoReviewPrs: false,
      issueAgent: "codex",
    });

    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(mockDb, 1, {
      autoLaunchIssues: true,
      autoReviewPrs: false,
      issueAgent: "codex",
    });
  });

  it("sets automation settings with explicit true/false command shape", async () => {
    vi.mocked(getRepo).mockReturnValue(makeRepo({
      autoLaunchIssues: true,
      autoReviewPrs: false,
    }));
    vi.mocked(updateRepoWebhookSettings).mockReturnValue(makeRepo({
      autoLaunchIssues: false,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    }));

    await repoSetCommand("mean-weasel/issuectl", {
      autoLaunchIssues: "false",
      autoReviewPrs: "true",
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
      webhookBaseUrl: "https://hooks.example.test/",
    });

    expect(setSetting).toHaveBeenCalledWith(mockDb, "public_webhook_base_url", "https://hooks.example.test");
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(mockDb, 1, {
      autoLaunchIssues: false,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    });
  });

  it.each([
    ["auto-launch boolean", () => repoSetCommand("mean-weasel/issuectl", { autoLaunchIssues: "yes" }), "--auto-launch-issues must be true or false."],
    ["issue agent", () => repoUpdateCommand("mean-weasel/issuectl", { issueAgent: "cursor" }), "--issue-agent must be claude or codex."],
    ["payload mode", () => repoUpdateCommand("mean-weasel/issuectl", { webhookPayloadMode: "full" }), "--webhook-payload-mode must be metadata or raw."],
    ["webhook URL", () => repoSetCommand("mean-weasel/issuectl", { webhookBaseUrl: "hooks.example.test" }), "--webhook-base-url must be an http(s) URL."],
  ])("rejects invalid %s before writing", async (_name, run, message) => {
    vi.mocked(getRepo).mockReturnValue(makeRepo());

    await expect(run()).rejects.toThrow(message);

    expect(updateRepoWebhookSettings).not.toHaveBeenCalled();
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("ends active webhook sessions when disabling repo automation", async () => {
    vi.mocked(getRepo).mockReturnValue(makeRepo({
      autoLaunchIssues: true,
      autoReviewPrs: true,
    }));
    vi.mocked(updateRepoWebhookSettings).mockReturnValue(makeRepo({
      autoLaunchIssues: false,
      autoReviewPrs: false,
    }));
    vi.mocked(getActiveWebhookDeploymentsForRepoTarget)
      .mockReturnValueOnce([{
        id: 10,
        repoId: 1,
        issueNumber: 506,
        targetType: "issue",
        targetNumber: 506,
        agent: "claude",
        branchName: "issue-506",
        workspaceMode: "worktree",
        workspacePath: "/tmp/issue",
        linkedPrNumber: null,
        state: "active",
        terminalBackend: "ttyd",
        triggeredBy: "webhook",
        parentDeploymentId: null,
        webhookDepth: 0,
        launchedAt: "2026-05-23T00:00:00.000Z",
        endedAt: null,
        terminalReason: null,
        completionToken: null,
        completionResultJson: null,
        notificationSentAt: null,
        ttydPort: 7700,
        ttydPid: 123,
        idleSince: null,
      }])
      .mockReturnValueOnce([{
        id: 11,
        repoId: 1,
        issueNumber: null,
        targetType: "pr",
        targetNumber: 44,
        agent: "claude",
        branchName: "pr-44",
        workspaceMode: "worktree",
        workspacePath: "/tmp/pr",
        linkedPrNumber: null,
        state: "active",
        terminalBackend: "pty_bridge",
        triggeredBy: "webhook",
        parentDeploymentId: null,
        webhookDepth: 0,
        launchedAt: "2026-05-23T00:00:00.000Z",
        endedAt: null,
        terminalReason: null,
        completionToken: null,
        completionResultJson: null,
        notificationSentAt: null,
        ttydPort: null,
        ttydPid: null,
        idleSince: null,
      }]);

    await repoUpdateCommand("mean-weasel/issuectl", {
      autoLaunchIssues: false,
      autoReviewPrs: false,
    });

    expect(killTtyd).toHaveBeenCalledWith(123, "issuectl-issuectl-issue-506");
    expect(killTmuxSession).toHaveBeenCalledWith("issuectl-issuectl-pr-44");
    expect(endDeployment).toHaveBeenCalledWith(mockDb, 10, "killed_by_label");
    expect(endDeployment).toHaveBeenCalledWith(mockDb, 11, "killed_by_label");
    expect(markActivePrReviewForDeploymentTerminal).toHaveBeenCalledWith(mockDb, 11, {
      completedAt: expect.any(Number),
      status: "superseded",
      reason: "killed_by_label",
    });
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      event: "repo.automation_disabled",
      source: "cli",
      data: expect.objectContaining({ targetType: "issue", affectedSessionIds: [10] }),
    }));
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      event: "repo.automation_disabled",
      source: "cli",
      data: expect.objectContaining({ targetType: "pr", affectedSessionIds: [11] }),
    }));
  });

  it("shows webhook configuration without secrets", () => {
    vi.mocked(getRepo).mockReturnValue(makeRepo({
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    }));
    let stderr = "";
    const spy = vi.spyOn(console, "error").mockImplementation((value?: unknown) => {
      stderr += `${String(value)}\n`;
    });

    repoShowCommand("mean-weasel/issuectl");

    expect(stderr).toContain("auto-launch issues: true");
    expect(stderr).toContain("auto-review PRs: true");
    expect(stderr).toContain("issue agent: codex");
    expect(stderr).toContain("review agent: claude");
    expect(stderr).toContain("payload mode: raw");
    expect(stderr).not.toContain("secret");
    spy.mockRestore();
  });

  it("best-effort deletes stored GitHub webhook during remove", async () => {
    const deleteWebhook = vi.fn(async () => ({ data: {} }));
    vi.mocked(getRepo).mockReturnValue(makeRepo({ webhookId: 789 }));
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(withAuthRetry).mockImplementation(async (fn: (octokit: never) => unknown) =>
      fn({
        rest: {
          issues: {
            getLabel: vi.fn(),
            createLabel: vi.fn(),
          },
          repos: { deleteWebhook },
        },
      } as never),
    );

    await repoRemoveCommand("mean-weasel/issuectl");

    expect(deleteWebhook).toHaveBeenCalledWith({
      owner: "mean-weasel",
      repo: "issuectl",
      hook_id: 789,
    });
    expect(removeRepo).toHaveBeenCalledWith(mockDb, 1);
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      event: "repo.removed",
      source: "cli",
      data: expect.objectContaining({ hookId: 789 }),
    }));
  });
});
