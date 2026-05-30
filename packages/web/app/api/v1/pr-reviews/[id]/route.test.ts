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

const getReviewDetailData = vi.hoisted(() => vi.fn());
vi.mock("@/lib/review-detail-data", () => ({
  getReviewDetailData: (...args: unknown[]) => getReviewDetailData(...args),
}));

vi.mock("@issuectl/core", () => ({
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

import { GET } from "./route";

beforeEach(() => {
  requireAuth.mockReset();
  loggerError.mockReset();
  getReviewDetailData.mockReset();

  requireAuth.mockReturnValue(null);
  getReviewDetailData.mockReturnValue(reviewDetailData());
});

describe("/api/v1/pr-reviews/[id]", () => {
  it("returns a mobile-safe review detail payload", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/pr-reviews/901"),
      { params: Promise.resolve({ id: "901" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(getReviewDetailData).toHaveBeenCalledWith(901);
    expect(json.review).toEqual(expect.objectContaining({
      id: 901,
      repoFullName: "mean-weasel/issuectl",
      prNumber: 44,
      summary: "found one issue",
      findingCount: 1,
      rangeLabel: "4444555..7777888",
      detailHref: "/reviews/901",
    }));
    expect(json.lineage).toEqual([
      expect.objectContaining({ id: 901, active: true, label: "4444555..7777888" }),
      expect.objectContaining({ id: 900, active: false, label: "full 4444555" }),
    ]);
    expect(json.diagnostics.events).toEqual([
      expect.objectContaining({
        id: 52,
        timestampIso: "2026-05-17T06:40:00.500Z",
        targetLabel: "PR #44",
      }),
    ]);
    expect(json.actions).toEqual({
      canRetry: true,
      canFullRerun: true,
      disabledReason: null,
      mobileWriteActionsEnabled: false,
    });
    expect(JSON.stringify(json)).not.toContain("resultJson");
    expect(JSON.stringify(json)).not.toContain("completionToken");
  });

  it("rejects an invalid review id", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/pr-reviews/nope"),
      { params: Promise.resolve({ id: "nope" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "Invalid review id" });
    expect(getReviewDetailData).not.toHaveBeenCalled();
  });

  it("returns 404 for missing review details", async () => {
    getReviewDetailData.mockReturnValueOnce(null);

    const response = await GET(
      new NextRequest("http://localhost/api/v1/pr-reviews/999"),
      { params: Promise.resolve({ id: "999" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "Review not found" });
  });

  it("requires API auth", async () => {
    requireAuth.mockReturnValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await GET(
      new NextRequest("http://localhost/api/v1/pr-reviews/901"),
      { params: Promise.resolve({ id: "901" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(getReviewDetailData).not.toHaveBeenCalled();
  });
});

function reviewDetailData() {
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
  const review = {
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
  };
  const deployment = {
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
    state: "ended",
    terminalBackend: "ttyd",
    triggeredBy: "webhook",
    parentDeploymentId: null,
    webhookDepth: 1,
    launchedAt: "2026-05-16T16:00:00.000Z",
    endedAt: "2026-05-16T16:10:00.000Z",
    terminalReason: "completed",
    completionToken: "secret-token",
    completionResultJson: JSON.stringify({ summary: "done" }),
    notificationSentAt: null,
    ttydPort: 7701,
    ttydPid: null,
    idleSince: null,
  };
  const diagnostic = {
    id: 52,
    timestamp: 1_779_000_000_500,
    level: "info",
    event: "webhook.pr_launched",
    source: "webhook-worker",
    correlationId: null,
    owner: "mean-weasel",
    repo: "issuectl",
    issueNumber: null,
    targetType: "pr",
    targetNumber: 44,
    deploymentId: 701,
    sessionName: "issuectl-701",
    ttydPort: 7701,
    ttydPid: null,
    status: "completed",
    message: "launched",
    data: null,
  };
  return {
    initialized: true,
    review,
    repo,
    deployment,
    lineage: [
      {
        ...review,
        active: true,
        result: JSON.parse(review.resultJson),
        label: "4444555..7777888",
      },
      {
        ...review,
        id: 900,
        reviewedFromSha: null,
        reviewedToSha: "444455556666",
        active: false,
        result: {},
        label: "full 4444555",
      },
    ],
    diagnostics: [diagnostic],
    result: JSON.parse(review.resultJson),
    deploymentResult: { summary: "done" },
    metadata: {
      currentReviewPreamble: null,
      triggerEvent: diagnostic,
    },
    banners: [{ tone: "info", title: "Follow-up requested", body: "A newer PR head was coalesced while this review was active." }],
    actions: {
      canRetry: true,
      canFullRerun: true,
      disabledReason: null,
    },
    links: {
      githubPr: "https://github.com/mean-weasel/issuectl/pull/44",
      githubReview: null,
      githubReviewFiles: "https://github.com/mean-weasel/issuectl/pull/44/files",
      workbench: "/workbench?repo=mean-weasel%2Fissuectl",
      repoSettings: "/repos/mean-weasel/issuectl/settings",
      sessions: "/sessions?tab=reviews&repo=mean-weasel%2Fissuectl&q=PR%20%2344",
      webhookLogs: "/logs/webhooks?q=mean-weasel%2Fissuectl%2344",
      diagnosticsCli: "pnpm --dir packages/cli exec issuectl diag show --pr mean-weasel/issuectl#44",
    },
  };
}
