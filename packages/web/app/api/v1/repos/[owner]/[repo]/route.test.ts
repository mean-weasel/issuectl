import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const getDb = vi.hoisted(() => vi.fn());
const getRepo = vi.hoisted(() => vi.fn());
const getActiveWebhookDeploymentsForRepoTarget = vi.hoisted(() => vi.fn());
const endDeployment = vi.hoisted(() => vi.fn());
const killTtyd = vi.hoisted(() => vi.fn());
const killTmuxSession = vi.hoisted(() => vi.fn());
const recordDiagnosticEventSafely = vi.hoisted(() => vi.fn());
const tmuxSessionName = vi.hoisted(() => vi.fn((repo: string, targetNumber: number, targetType = "issue") => `issuectl-${repo}-${targetType}-${targetNumber}`));
const updateRepo = vi.hoisted(() => vi.fn());
const updateRepoWebhookSettings = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getRepo: (...args: unknown[]) => getRepo(...args),
  getActiveWebhookDeploymentsForRepoTarget: (...args: unknown[]) => getActiveWebhookDeploymentsForRepoTarget(...args),
  endDeployment: (...args: unknown[]) => endDeployment(...args),
  killTtyd: (...args: unknown[]) => killTtyd(...args),
  killTmuxSession: (...args: unknown[]) => killTmuxSession(...args),
  recordDiagnosticEventSafely: (...args: unknown[]) => recordDiagnosticEventSafely(...args),
  tmuxSessionName: (repo: string, targetNumber: number, targetType?: "issue" | "pr") => tmuxSessionName(repo, targetNumber, targetType),
  updateRepo: (...args: unknown[]) => updateRepo(...args),
  updateRepoWebhookSettings: (...args: unknown[]) => updateRepoWebhookSettings(...args),
  removeRepo: vi.fn(),
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

import { PATCH } from "./route";

const repo = {
  id: 1,
  owner: "mean-weasel",
  name: "issuectl",
  localPath: null,
  branchPattern: null,
  autoLaunchIssues: false,
  autoReviewPrs: false,
  issueAgent: "claude",
  reviewAgent: "codex",
  webhookPayloadMode: "metadata",
};

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/repos/mean-weasel/issuectl", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue({});
  getRepo.mockReturnValue(repo);
  updateRepo.mockReset();
  updateRepo.mockReturnValue(repo);
  updateRepoWebhookSettings.mockReset();
  updateRepoWebhookSettings.mockReturnValue({
    ...repo,
    autoLaunchIssues: true,
    issueAgent: "codex",
    webhookPayloadMode: "raw",
  });
  getActiveWebhookDeploymentsForRepoTarget.mockReset();
  getActiveWebhookDeploymentsForRepoTarget.mockReturnValue([]);
  endDeployment.mockReset();
  killTtyd.mockReset();
  killTmuxSession.mockReset();
  recordDiagnosticEventSafely.mockReset();
  tmuxSessionName.mockClear();
});

describe("/api/v1/repos/[owner]/[repo]", () => {
  it("PATCH updates webhook automation settings without exposing secrets", async () => {
    const response = await PATCH(request({
      autoLaunchIssues: true,
      autoReviewPrs: false,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    }), { params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(expect.anything(), 1, {
      autoLaunchIssues: true,
      autoReviewPrs: false,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    });
    expect(json.repo.webhookSecret).toBeUndefined();
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "repo.automation_enabled",
      owner: "mean-weasel",
      repo: "issuectl",
    }));
  });

  it("PATCH ends active webhook sessions when automation is disabled", async () => {
    getRepo.mockReturnValue({
      ...repo,
      autoReviewPrs: true,
    });
    getActiveWebhookDeploymentsForRepoTarget.mockReturnValue([{
      id: 22,
      targetNumber: 44,
      terminalBackend: "pty_bridge",
      ttydPid: null,
    }]);

    const response = await PATCH(request({ autoReviewPrs: false }), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }),
    });

    expect(response.status).toBe(200);
    expect(killTmuxSession).toHaveBeenCalledWith("issuectl-issuectl-pr-44");
    expect(endDeployment).toHaveBeenCalledWith(expect.anything(), 22, "killed_by_label");
  });

  it("PATCH rejects invalid webhook payload mode", async () => {
    const response = await PATCH(request({ webhookPayloadMode: "full" }), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/webhookPayloadMode/);
    expect(updateRepoWebhookSettings).not.toHaveBeenCalled();
  });
});
