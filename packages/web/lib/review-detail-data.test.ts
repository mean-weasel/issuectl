import { describe, expect, it } from "vitest";
import type { Deployment, DiagnosticEvent, PrReview, Repo } from "@issuectl/core";
import { buildReviewActionRequest, buildReviewDetailData } from "./review-detail-data";

const repo: Repo = {
  id: 1,
  owner: "mean-weasel",
  name: "issuectl",
  localPath: "/tmp/issuectl",
  branchPattern: null,
  autoLaunchIssues: false,
  autoReviewPrs: true,
  issueAgent: "codex",
  reviewAgent: "codex",
  webhookId: 1,
  reviewPreamble: null,
  webhookPayloadMode: "metadata",
  createdAt: "2026-05-24T00:00:00.000Z",
};

describe("review-detail-data", () => {
  it("derives lineage labels, links, and follow-up banners", () => {
    const current = review({
      id: 2,
      reviewedFromSha: "bbbbbbb2222222",
      reviewedToSha: "ccccccc3333333",
      resultJson: JSON.stringify({
        desiredHeadSha: "ddddddd4444444",
        followUpGeneration: 1,
        githubReviewUrl: "https://github.com/mean-weasel/issuectl/pull/44#pullrequestreview-1",
      }),
    });
    const data = buildReviewDetailData({
      repo,
      review: current,
      lineage: [current, review({ id: 1, reviewedFromSha: null, reviewedToSha: "bbbbbbb2222222" })],
      diagnostics: [diagnostic()],
    });

    expect(data.lineage.map((item) => item.label)).toEqual(["bbbbbbb..ccccccc", "full bbbbbbb"]);
    expect(data.lineage[0].active).toBe(true);
    expect(data.banners).toEqual([
      expect.objectContaining({ tone: "info", title: "Follow-up requested" }),
    ]);
    expect(data.links.githubPr).toBe("https://github.com/mean-weasel/issuectl/pull/44");
    expect(data.links.githubReview).toBe("https://github.com/mean-weasel/issuectl/pull/44#pullrequestreview-1");
    expect(data.links.githubReviewFiles).toBe("https://github.com/mean-weasel/issuectl/pull/44/files");
    expect(data.links.sessions).toContain("tab=reviews");
    expect(data.links.webhookLogs).toContain("q=mean-weasel%2Fissuectl%2344");
    expect(data.links.diagnosticsCli).toBe("pnpm --dir packages/cli exec issuectl diag show --pr mean-weasel/issuectl#44");
    expect(data.actions.canRetry).toBe(true);
    expect(data.diagnostics).toHaveLength(1);
    expect(data.metadata).toEqual({
      currentReviewPreamble: null,
      triggerEvent: expect.objectContaining({ event: "webhook.pr_launched" }),
    });
  });

  it("shows failed and superseded banners from status and result json", () => {
    const data = buildReviewDetailData({
      repo,
      review: review({ status: "failed", resultJson: JSON.stringify({ reason: "liveness_missing" }) }),
      deployment: deployment({ completionResultJson: JSON.stringify({ status: "failed" }) }),
    });
    const superseded = buildReviewDetailData({
      repo,
      review: review({ status: "superseded", resultJson: JSON.stringify({ reason: "force_push" }) }),
    });

    expect(data.banners).toEqual([
      expect.objectContaining({ tone: "bad", body: "liveness_missing" }),
    ]);
    expect(superseded.banners).toEqual([
      expect.objectContaining({ tone: "warn", title: "Reviewed range superseded" }),
    ]);
  });

  it("builds local webhook intent requests for retry and full rerun", () => {
    const retry = buildReviewActionRequest({ repo, review: review(), mode: "retry", now: 10 });
    const full = buildReviewActionRequest({ repo, review: review(), mode: "full", now: 11 });

    expect(retry).toEqual({
      intent: expect.objectContaining({
        repoId: repo.id,
        targetType: "pr",
        targetNumber: 44,
        desiredHeadSha: "ccccccc3333333",
        requestedAgent: "codex",
        reviewMode: "auto",
      }),
      diagnosticEvent: "pr_review.retry",
      diagnosticMessage: "PR review retry requested.",
    });
    expect(full.intent.reviewMode).toBe("full");
    expect(full.diagnosticEvent).toBe("pr_review.manual_rerun");
  });

  it("disables retry actions while any run for the PR is in flight", () => {
    const data = buildReviewDetailData({
      repo,
      review: review({ id: 2, status: "failed" }),
      lineage: [
        review({ id: 3, status: "in_progress", completedAt: null }),
        review({ id: 2, status: "failed" }),
      ],
    });

    expect(data.actions).toEqual({
      canRetry: false,
      canFullRerun: false,
      disabledReason: "Run #3 is still in progress.",
    });
  });
});

function review(overrides: Partial<PrReview> = {}): PrReview {
  return {
    id: 1,
    repoId: repo.id,
    prNumber: 44,
    deploymentId: 12,
    startedHeadSha: "ccccccc3333333",
    completedHeadSha: null,
    reviewBaseSha: "aaaaaaa1111111",
    reviewedFromSha: "bbbbbbb2222222",
    reviewedToSha: "ccccccc3333333",
    headRepoFullName: "mean-weasel/issuectl",
    headRef: "feature/review",
    status: "completed",
    triggeredBy: "webhook",
    resultJson: null,
    startedAt: 1_000,
    completedAt: 2_000,
    ...overrides,
  };
}

function deployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: 12,
    repoId: repo.id,
    issueNumber: null,
    targetType: "pr",
    targetNumber: 44,
    agent: "codex",
    branchName: "review-44",
    workspaceMode: "worktree",
    workspacePath: "/tmp/review",
    linkedPrNumber: null,
    state: "active",
    terminalBackend: "ttyd",
    triggeredBy: "webhook",
    parentDeploymentId: null,
    webhookDepth: 0,
    launchedAt: "2026-05-24T00:00:00.000Z",
    endedAt: "2026-05-24T00:10:00.000Z",
    terminalReason: "completed",
    completionToken: null,
    completionResultJson: null,
    notificationSentAt: null,
    ttydPort: null,
    ttydPid: null,
    idleSince: null,
    ...overrides,
  };
}

function diagnostic(): DiagnosticEvent {
  return {
    id: 5,
    timestamp: 10,
    level: "info",
    event: "webhook.pr_launched",
    source: "webhook-worker",
    correlationId: null,
    owner: repo.owner,
    repo: repo.name,
    issueNumber: null,
    targetType: "pr",
    targetNumber: 44,
    deploymentId: 12,
    sessionName: null,
    ttydPort: null,
    ttydPid: null,
    status: null,
    message: "launched",
    data: null,
  };
}
