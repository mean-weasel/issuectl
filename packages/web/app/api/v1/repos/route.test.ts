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

vi.mock("@issuectl/core", () => ({
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
  getDb: () => getDb(),
  getRepo: (...args: unknown[]) => getRepo(...args),
  listRepos: (...args: unknown[]) => listRepos(...args),
}));

vi.mock("@/lib/actions/repos", () => ({
  addRepo: (...args: unknown[]) => addRepo(...args),
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
  addRepo.mockReset();
  addRepo.mockResolvedValue({
    success: true,
    addedRepo: repo,
    install: { webhook: "skipped", labels: [], firstPing: "skipped" },
  });
});

describe("/api/v1/repos", () => {
  it("GET returns tracked repos", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/repos"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.repos).toEqual([repo]);
  });

  it("POST uses the shared repo add workflow and returns compatible parity fields", async () => {
    getRepo.mockReturnValue({
      ...repo,
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    });
    addRepo.mockResolvedValue({
      success: true,
      addedRepo: repo,
      install: {
        webhook: "installed",
        labels: ["issuectl:auto-launch", "issuectl:auto-review"],
        firstPing: "received",
        webhookId: 123,
        url: "https://hooks.example.test/api/webhook/github/1",
        createdBy: "octocat",
      },
    });

    const response = await POST(request({
      owner: "mean-weasel",
      name: "issuectl",
      localPath: "/tmp/issuectl",
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      reviewPreamble: "Use the repo-specific review voice.",
      webhookPayloadMode: "raw",
      installWebhook: true,
      firstPingTimeoutMs: 0,
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(addRepo).toHaveBeenCalledWith("mean-weasel", "issuectl", "/tmp/issuectl", {
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      reviewPreamble: "Use the repo-specific review voice.",
      webhookPayloadMode: "raw",
      installWebhook: true,
      firstPingTimeoutMs: 0,
    });
    expect(json).toEqual({
      success: true,
      repo: expect.objectContaining({ id: 1, autoLaunchIssues: true }),
      addedRepo: repo,
      install: {
        webhook: "installed",
        labels: ["issuectl:auto-launch", "issuectl:auto-review"],
        firstPing: "received",
        webhookId: 123,
        url: "https://hooks.example.test/api/webhook/github/1",
        createdBy: "octocat",
      },
    });
  });

  it("POST accepts a null review preamble", async () => {
    const response = await POST(request({
      owner: "mean-weasel",
      name: "issuectl",
      reviewPreamble: null,
    }));

    expect(response.status).toBe(200);
    expect(addRepo).toHaveBeenCalledWith("mean-weasel", "issuectl", undefined, {
      autoLaunchIssues: undefined,
      autoReviewPrs: undefined,
      issueAgent: undefined,
      reviewAgent: undefined,
      reviewPreamble: null,
      webhookPayloadMode: undefined,
      installWebhook: undefined,
      firstPingTimeoutMs: undefined,
    });
  });

  it("POST rejects non-string review preambles", async () => {
    const response = await POST(request({
      owner: "mean-weasel",
      name: "issuectl",
      reviewPreamble: 123,
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("reviewPreamble must be a string or null");
    expect(addRepo).not.toHaveBeenCalled();
  });

  it("POST maps shared duplicate failures to the existing conflict status", async () => {
    addRepo.mockResolvedValue({ success: false, error: "Repository already tracked" });

    const response = await POST(request({
      owner: "mean-weasel",
      name: "issuectl",
    }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual({ success: false, error: "Repository already tracked" });
  });
});
