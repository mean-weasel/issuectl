import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

const loggerError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({
  default: {
    error: (...args: unknown[]) => loggerError(...args),
  },
}));

const getDb = vi.hoisted(() => vi.fn());
const listRepos = vi.hoisted(() => vi.fn());
const listWebhookLogEntries = vi.hoisted(() => vi.fn());
vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  listRepos: (...args: unknown[]) => listRepos(...args),
  listWebhookLogEntries: (...args: unknown[]) => listWebhookLogEntries(...args),
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

import { GET } from "./route";

const db = { db: true };
const repos = [
  {
    id: 1,
    owner: "mean-weasel",
    name: "issuectl",
    localPath: "/tmp/issuectl",
    branchPattern: null,
    autoLaunchIssues: true,
    autoReviewPrs: true,
    issueAgent: "codex",
    reviewAgent: "codex",
    webhookId: 123,
    reviewPreamble: null,
    webhookPayloadMode: "metadata",
    createdAt: "2026-05-24T00:00:00.000Z",
  },
];

beforeEach(() => {
  requireAuth.mockReset();
  loggerError.mockReset();
  getDb.mockReset();
  listRepos.mockReset();
  listWebhookLogEntries.mockReset();

  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue(db);
  listRepos.mockReturnValue(repos);
  listWebhookLogEntries.mockReturnValue([
    {
      id: 801,
      deliveryId: "delivery-801",
      repoId: 1,
      eventType: "pull_request",
      action: "synchronize",
      senderLogin: "octocat",
      targetType: "pr",
      targetNumber: 44,
      payloadJson: "{\"secret\":\"do-not-return\"}",
      receivedAt: 1_779_000_000_000,
      intentId: 901,
      result: "fired",
      resultDetail: "deployment 701",
      actionId: "dep_701",
      intent: {
        id: 901,
        repoId: 1,
        targetType: "pr",
        targetNumber: 44,
        firstSignalAt: 1_778_999_900_000,
        lastSignalAt: 1_779_000_000_000,
        scheduledAt: 1_779_000_060_000,
        processingStartedAt: 1_779_000_070_000,
        leaseExpiresAt: 1_779_000_130_000,
        generation: 2,
        desiredHeadSha: "abc123",
        requestedAgent: "codex",
        reviewMode: "full",
        signalCount: 2,
        status: "launched",
        resolvedAt: 1_779_000_090_000,
        deploymentId: 701,
        failureReason: null,
      },
    },
  ]);
});

describe("/api/v1/webhooks/events", () => {
  it("returns mobile-safe webhook events with repo, target, and intent summaries", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/v1/webhooks/events?repo=mean-weasel/issuectl&targetType=pr&targetNumber=44&limit=25",
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(listWebhookLogEntries).toHaveBeenCalledWith(db, {
      repoId: 1,
      targetType: "pr",
      targetNumber: 44,
      limit: 25,
    });
    expect(json).toEqual({
      events: [
        expect.objectContaining({
          id: 801,
          deliveryId: "delivery-801",
          repoId: 1,
          repoFullName: "mean-weasel/issuectl",
          owner: "mean-weasel",
          repoName: "issuectl",
          eventType: "pull_request",
          action: "synchronize",
          senderLogin: "octocat",
          targetType: "pr",
          targetNumber: 44,
          targetLabel: "PR #44",
          receivedAt: 1_779_000_000_000,
          receivedAtIso: "2026-05-17T06:40:00.000Z",
          result: "fired",
          resultDetail: "deployment 701",
          actionId: "dep_701",
          intent: expect.objectContaining({
            id: 901,
            status: "launched",
            signalCount: 2,
            deploymentId: 701,
            scheduledAtIso: "2026-05-17T06:41:00.000Z",
          }),
        }),
      ],
      repos: [{ id: 1, fullName: "mean-weasel/issuectl" }],
      filters: {
        repo: "mean-weasel/issuectl",
        targetType: "pr",
        targetNumber: 44,
        limit: 25,
      },
      summary: {
        count: 1,
        latestReceivedAt: 1_779_000_000_000,
        latestReceivedAtIso: "2026-05-17T06:40:00.000Z",
        resultCounts: { fired: 1 },
      },
    });
    expect(JSON.stringify(json)).not.toContain("do-not-return");
    expect(JSON.stringify(json)).not.toContain("payloadJson");
  });

  it("returns a 404 for an unknown repo filter", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/webhooks/events?repo=mean-weasel/missing"));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "Repository not tracked" });
    expect(listWebhookLogEntries).not.toHaveBeenCalled();
  });

  it("requires API auth", async () => {
    requireAuth.mockReturnValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await GET(new NextRequest("http://localhost/api/v1/webhooks/events"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(getDb).not.toHaveBeenCalled();
  });
});
