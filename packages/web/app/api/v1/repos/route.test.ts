import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const addRepo = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
const getRepo = vi.hoisted(() => vi.fn());
const listRepos = vi.hoisted(() => vi.fn());
const updateRepoWebhookSettings = vi.hoisted(() => vi.fn());
const withAuthRetry = vi.hoisted(() => vi.fn((fn: (octokit: unknown) => unknown) =>
  fn({ rest: { repos: { get: vi.fn() } } }),
));

vi.mock("@issuectl/core", () => ({
  addRepo: (...args: unknown[]) => addRepo(...args),
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
  getDb: () => getDb(),
  getRepo: (...args: unknown[]) => getRepo(...args),
  listRepos: (...args: unknown[]) => listRepos(...args),
  updateRepoWebhookSettings: (...args: unknown[]) => updateRepoWebhookSettings(...args),
  withAuthRetry: (fn: (octokit: unknown) => unknown) => withAuthRetry(fn),
}));

import { GET, POST } from "./route";

const repo = {
  id: 1,
  owner: "mean-weasel",
  name: "issuectl",
};

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/repos", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue({});
  getRepo.mockReturnValue(undefined);
  listRepos.mockReturnValue([repo]);
  addRepo.mockReturnValue(repo);
  updateRepoWebhookSettings.mockReset();
  withAuthRetry.mockClear();
});

describe("/api/v1/repos", () => {
  it("GET returns tracked repos", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/repos"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.repos).toEqual([repo]);
  });

  it("POST persists onboarding automation choices", async () => {
    const response = await POST(request({
      owner: "mean-weasel",
      name: "issuectl",
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, repo });
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(expect.anything(), 1, {
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    });
  });
});
