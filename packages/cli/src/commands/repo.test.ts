import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRepo,
  endDeployment,
  getRepo,
  getActiveWebhookDeploymentsForRepoTarget,
  killTmuxSession,
  killTtyd,
  setSetting,
  tmuxSessionName,
  updateRepo,
  updateRepoWebhookSettings,
  type Repo,
} from "@issuectl/core";
import { requireDb } from "../utils/db.js";
import { repoAddCommand, repoSetCommand, repoShowCommand, repoUpdateCommand } from "./repo.js";

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
  input: vi.fn(async () => ""),
}));

vi.mock("@issuectl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@issuectl/core")>();
  return {
    ...actual,
    addRepo: vi.fn(),
    getRepo: vi.fn(),
    getActiveWebhookDeploymentsForRepoTarget: vi.fn(),
    endDeployment: vi.fn(),
    killTmuxSession: vi.fn(),
    killTtyd: vi.fn(),
    setSetting: vi.fn(),
    tmuxSessionName: vi.fn((repo: string, targetNumber: number, targetType = "issue") => `issuectl-${repo}-${targetType}-${targetNumber}`),
    updateRepo: vi.fn(),
    updateRepoWebhookSettings: vi.fn(),
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
  vi.mocked(addRepo).mockReset();
  vi.mocked(getRepo).mockReset();
  vi.mocked(getActiveWebhookDeploymentsForRepoTarget).mockReset();
  vi.mocked(getActiveWebhookDeploymentsForRepoTarget).mockReturnValue([]);
  vi.mocked(endDeployment).mockReset();
  vi.mocked(killTmuxSession).mockReset();
  vi.mocked(killTtyd).mockReset();
  vi.mocked(setSetting).mockReset();
  vi.mocked(tmuxSessionName).mockClear();
  vi.mocked(updateRepo).mockReset();
  vi.mocked(updateRepoWebhookSettings).mockReset();
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
});
