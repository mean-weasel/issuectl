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
const getRepo = vi.hoisted(() => vi.fn());
const listWebhookLogEntries = vi.hoisted(() => vi.fn());
vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getRepo: (...args: unknown[]) => getRepo(...args),
  listWebhookLogEntries: (...args: unknown[]) => listWebhookLogEntries(...args),
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

import { GET } from "./route";

const db = { db: true };
const repo = {
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
};

function request(url = "http://localhost/api/v1/repos/mean-weasel/issuectl/webhook/events"): NextRequest {
  return new NextRequest(url);
}

function context(owner = "mean-weasel", repoName = "issuectl") {
  return {
    params: Promise.resolve({ owner, repo: repoName }),
  };
}

beforeEach(() => {
  requireAuth.mockReset();
  loggerError.mockReset();
  getDb.mockReset();
  getRepo.mockReset();
  listWebhookLogEntries.mockReset();

  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue(db);
  getRepo.mockReturnValue(repo);
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
      intent: null,
    },
  ]);
});

describe("/api/v1/repos/[owner]/[repo]/webhook/events", () => {
  it("returns repo-scoped webhook events in the iOS-decoded response shape", async () => {
    const response = await GET(request(
      "http://localhost/api/v1/repos/mean-weasel/issuectl/webhook/events?targetType=pr&targetNumber=44&limit=25",
    ), context());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(getRepo).toHaveBeenCalledWith(db, "mean-weasel", "issuectl");
    expect(listWebhookLogEntries).toHaveBeenCalledWith(db, {
      repoId: 1,
      targetType: "pr",
      targetNumber: 44,
      limit: 25,
    });
    expect(json).toEqual(expect.objectContaining({
      events: [
        expect.objectContaining({
          id: 801,
          deliveryId: "delivery-801",
          repoId: 1,
          eventType: "pull_request",
          action: "synchronize",
          senderLogin: "octocat",
          targetType: "pr",
          targetNumber: 44,
          receivedAt: 1_779_000_000_000,
          intentId: 901,
        }),
      ],
      fromCache: false,
      cachedAt: null,
    }));
    expect(JSON.stringify(json)).not.toContain("do-not-return");
    expect(JSON.stringify(json)).not.toContain("payloadJson");
  });

  it("returns 404 when the repo is not tracked", async () => {
    getRepo.mockReturnValueOnce(null);

    const response = await GET(request(), context("mean-weasel", "missing"));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "Repository not tracked" });
    expect(listWebhookLogEntries).not.toHaveBeenCalled();
  });

  it("requires API auth", async () => {
    requireAuth.mockReturnValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await GET(request(), context());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(getDb).not.toHaveBeenCalled();
  });
});
