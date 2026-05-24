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
const updateRepo = vi.hoisted(() => vi.fn());
const updateRepoWebhookSettings = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getRepo: (...args: unknown[]) => getRepo(...args),
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
