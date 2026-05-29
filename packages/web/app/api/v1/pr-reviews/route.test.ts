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
const listPrReviewsForPull = vi.hoisted(() => vi.fn());
const listPrReviewsForRepo = vi.hoisted(() => vi.fn());
const listRecentTerminalDeploymentsByRepo = vi.hoisted(() => vi.fn());
vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  listRepos: (...args: unknown[]) => listRepos(...args),
  listPrReviewsForPull: (...args: unknown[]) => listPrReviewsForPull(...args),
  listPrReviewsForRepo: (...args: unknown[]) => listPrReviewsForRepo(...args),
  listRecentTerminalDeploymentsByRepo: (...args: unknown[]) => listRecentTerminalDeploymentsByRepo(...args),
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

beforeEach(() => {
  requireAuth.mockReset();
  loggerError.mockReset();
  getDb.mockReset();
  listRepos.mockReset();
  listPrReviewsForPull.mockReset();
  listPrReviewsForRepo.mockReset();
  listRecentTerminalDeploymentsByRepo.mockReset();

  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue(db);
  listRepos.mockReturnValue([repo]);
  listRecentTerminalDeploymentsByRepo.mockReturnValue([
    {
      id: 701,
      repoId: 1,
      issueNumber: null,
      targetType: "pr",
      targetNumber: 44,
      agent: "codex",
      branchName: "review/pr-44",
      workspaceMode: "worktree",
      workspacePath: "/tmp/review-pr-44",
      linkedPrNumber: null,
      state: "active",
      triggeredBy: "webhook",
      parentDeploymentId: null,
      webhookDepth: 1,
      launchedAt: "2026-05-16T16:00:00.000Z",
      endedAt: "2026-05-16T16:10:00.000Z",
      terminalReason: "completed",
      completionToken: null,
      completionResultJson: null,
      notificationSentAt: null,
      ttydPort: 7701,
      ttydPid: null,
      idleSince: null,
    },
  ]);
  listPrReviewsForPull.mockReturnValue([
    {
      id: 901,
      repoId: 1,
      prNumber: 44,
      deploymentId: 701,
      startedHeadSha: "aaaabbbbcccc",
      completedHeadSha: "ddddeeeeffff",
      reviewBaseSha: "111122223333",
      reviewedFromSha: "444455556666",
      reviewedToSha: "777788889999",
      headRepoFullName: "mean-weasel/issuectl",
      headRef: "feature/mobile-contracts",
      status: "completed",
      triggeredBy: "webhook",
      resultJson: JSON.stringify({ summary: "found one issue", findings: [{ path: "a.ts" }] }),
      startedAt: 1_779_000_000_000,
      completedAt: 1_779_000_600_000,
    },
  ]);
});

describe("/api/v1/pr-reviews", () => {
  it("returns parsed PR review runs with repo metadata and linked deployment summaries", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/v1/pr-reviews?repo=mean-weasel/issuectl&pr=44&limit=12",
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(listPrReviewsForPull).toHaveBeenCalledWith(db, 1, 44, 12);
    expect(listPrReviewsForRepo).not.toHaveBeenCalled();
    expect(json).toEqual({
      reviews: [
        expect.objectContaining({
          id: 901,
          repoId: 1,
          repoFullName: "mean-weasel/issuectl",
          owner: "mean-weasel",
          repoName: "issuectl",
          prNumber: 44,
          status: "completed",
          triggeredBy: "webhook",
          deploymentId: 701,
          startedAt: 1_779_000_000_000,
          startedAtIso: "2026-05-17T06:40:00.000Z",
          completedAt: 1_779_000_600_000,
          completedAtIso: "2026-05-17T06:50:00.000Z",
          rangeLabel: "4444555..7777888",
          summary: "found one issue",
          findingCount: 1,
          detailHref: "/reviews/901",
          deployment: expect.objectContaining({
            id: 701,
            targetLabel: "PR #44",
            branchName: "review/pr-44",
            terminalReason: "completed",
          }),
        }),
      ],
      repos: [{ id: 1, fullName: "mean-weasel/issuectl" }],
      filters: {
        repo: "mean-weasel/issuectl",
        pr: 44,
        status: "all",
        limit: 12,
      },
      summary: {
        count: 1,
        activeCount: 0,
        completedCount: 1,
        failedCount: 0,
        latestStartedAt: 1_779_000_000_000,
        latestStartedAtIso: "2026-05-17T06:40:00.000Z",
      },
    });
    expect(JSON.stringify(json)).not.toContain("resultJson");
  });

  it("rejects invalid pull number filters", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/pr-reviews?pr=abc"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "Invalid pull request number" });
  });

  it("requires API auth", async () => {
    requireAuth.mockReturnValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await GET(new NextRequest("http://localhost/api/v1/pr-reviews"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(getDb).not.toHaveBeenCalled();
  });
});
