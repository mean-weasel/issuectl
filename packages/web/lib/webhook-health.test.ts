import { describe, expect, it, vi } from "vitest";
import type { Repo } from "@issuectl/core";
import { getWebhookAutomationHealth } from "./webhook-health";

const db = {};

const repo = {
  id: 1,
  owner: "mean-weasel",
  name: "issuectl",
  localPath: null,
  branchPattern: null,
  autoLaunchIssues: true,
  autoReviewPrs: true,
  issueAgent: "codex",
  reviewAgent: "claude",
  webhookId: 123,
  reviewPreamble: null,
  webhookPayloadMode: "metadata",
  createdAt: "2026-05-28T00:00:00.000Z",
} satisfies Repo;

describe("getWebhookAutomationHealth", () => {
  it("reports missing public webhook base URL", async () => {
    const result = await getWebhookAutomationHealth(db as never, repo, {
      getBaseUrl: () => "",
      inspectGitHubHook: vi.fn(),
    });

    expect(result).toMatchObject({
      state: "error",
      summary: "Webhook receiver URL is not configured",
      expectedUrl: null,
      hookId: 123,
    });
  });

  it("reports a stored hook URL that does not match local settings", async () => {
    const result = await getWebhookAutomationHealth(db as never, repo, {
      getBaseUrl: () => "https://current.example.test",
      inspectGitHubHook: vi.fn().mockResolvedValue({
        active: true,
        url: "https://old.example.test/api/webhook/github/1",
        deliveries: [{ status_code: 502, event: "issues", action: "labeled", delivered_at: "2026-05-28T00:00:00Z" }],
      }),
    });

    expect(result).toMatchObject({
      state: "error",
      summary: "GitHub webhook URL is stale",
      expectedUrl: "https://current.example.test/api/webhook/github/1",
      githubUrl: "https://old.example.test/api/webhook/github/1",
    });
    expect(result?.recovery).toContain("issuectl webhook rotate mean-weasel/issuectl --yes");
  });

  it("reports recent failed deliveries when the URL matches", async () => {
    const result = await getWebhookAutomationHealth(db as never, repo, {
      getBaseUrl: () => "https://hooks.example.test",
      inspectGitHubHook: vi.fn().mockResolvedValue({
        active: true,
        url: "https://hooks.example.test/api/webhook/github/1",
        deliveries: [{ status_code: 502, event: "issues", action: "labeled", delivered_at: "2026-05-28T00:00:00Z" }],
      }),
    });

    expect(result).toMatchObject({
      state: "error",
      summary: "Webhook delivery infrastructure failed with 502",
      latestDelivery: {
        event: "issues",
        action: "labeled",
        status: null,
        statusCode: 502,
      },
    });
  });

  it("reports GitHub delivery transport failures without a status code", async () => {
    const result = await getWebhookAutomationHealth(db as never, repo, {
      getBaseUrl: () => "https://hooks.example.test",
      inspectGitHubHook: vi.fn().mockResolvedValue({
        active: true,
        url: "https://hooks.example.test/api/webhook/github/1",
        deliveries: [{ status: "failure", status_code: null, event: "issues", action: "labeled", delivered_at: "2026-05-28T00:00:00Z" }],
      }),
    });

    expect(result).toMatchObject({
      state: "error",
      summary: "Webhook delivery infrastructure failed: failure",
      latestDelivery: {
        event: "issues",
        action: "labeled",
        status: "failure",
        statusCode: null,
      },
    });
    expect(result?.detail).toContain("did not reach the receiver successfully");
  });

  it("reports healthy matching hook and successful latest delivery", async () => {
    const result = await getWebhookAutomationHealth(db as never, repo, {
      getBaseUrl: () => "https://hooks.example.test",
      inspectGitHubHook: vi.fn().mockResolvedValue({
        active: true,
        url: "https://hooks.example.test/api/webhook/github/1",
        deliveries: [{ status: "OK", status_code: 200, event: "ping", action: null, delivered_at: "2026-05-28T00:00:00Z" }],
      }),
    });

    expect(result).toMatchObject({
      state: "ok",
      summary: "GitHub webhook delivery looks healthy",
    });
  });

  it("degrades to unknown when GitHub hook access is forbidden", async () => {
    const error = new Error("Resource not accessible") as Error & { status: number };
    error.status = 403;
    const result = await getWebhookAutomationHealth(db as never, repo, {
      getBaseUrl: () => "https://hooks.example.test",
      inspectGitHubHook: vi.fn().mockRejectedValue(error),
    });

    expect(result).toMatchObject({
      state: "unknown",
      summary: "GitHub webhook health requires hook access",
    });
  });
});
