import { describe, expect, it } from "vitest";
import type { ActiveDeploymentWithRepo, Deployment, PrReview, Repo } from "@issuectl/core";
import { buildSessionsOverview, normalizeSessionsFilters } from "./sessions-data";

const repo: Repo = {
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

describe("sessions-data", () => {
  it("normalizes unknown filters to safe defaults", () => {
    expect(normalizeSessionsFilters({
      tab: "wat",
      trigger: "bot",
      state: "stuck",
      status: "???",
      q: "  PR #44  ",
    })).toEqual({
      tab: "sessions",
      q: "PR #44",
      repo: "",
      trigger: "all",
      state: "all",
      status: "all",
    });
  });

  it("groups active and ended sessions by repo target with trigger filtering", () => {
    const data = buildSessionsOverview({
      repos: [repo],
      activeDeployments: [
        activeDeployment({ id: 10, targetType: "issue", targetNumber: 507, triggeredBy: "webhook" }),
        activeDeployment({ id: 11, targetType: "issue", targetNumber: 507, triggeredBy: "webhook", parentDeploymentId: 10 }),
      ],
      recentDeploymentsByRepo: new Map([
        [repo.id, [endedDeployment({ id: 9, targetType: "issue", targetNumber: 507, triggeredBy: "manual" })]],
      ]),
      reviewsByRepo: new Map(),
      previews: { "7710": { status: "active", lines: ["running tests"], lastUpdatedMs: 1, lastChangedMs: 1 } },
      filters: normalizeSessionsFilters({ trigger: "webhook" }),
    });

    expect(data.summary.activeSessions).toBe(2);
    expect(data.summary.endedSessions).toBe(1);
    expect(data.sessionGroups).toHaveLength(1);
    expect(data.sessionGroups[0].targetLabel).toBe("Issue #507");
    expect(data.sessionGroups[0].sessions).toHaveLength(2);
    expect(data.sessionGroups[0].sessions.find((session) => session.id === 10)?.childDeploymentCount).toBe(1);
    expect(data.sessionGroups[0].sessions.find((session) => session.id === 11)?.parentDeploymentId).toBe(10);
    expect(data.sessionGroups[0].sessions.find((session) => session.id === 10)?.preview?.lines).toEqual(["running tests"]);
  });

  it("groups review runs by PR and supports status search", () => {
    const data = buildSessionsOverview({
      repos: [repo],
      activeDeployments: [activeDeployment({ id: 20, targetType: "pr", targetNumber: 44, triggeredBy: "comment_command" })],
      recentDeploymentsByRepo: new Map(),
      reviewsByRepo: new Map([
        [repo.id, [
          review({ id: 3, prNumber: 44, deploymentId: 20, status: "in_progress", startedAt: 30 }),
          review({
            id: 2,
            prNumber: 44,
            deploymentId: null,
            status: "completed",
            startedAt: 20,
            resultJson: JSON.stringify({ summary: "two comments", findings: [{ path: "a.ts" }, { path: "b.ts" }] }),
          }),
        ]],
      ]),
      previews: {},
      filters: normalizeSessionsFilters({ tab: "reviews", status: "in_progress", q: "feature" }),
    });

    expect(data.summary.reviewRuns).toBe(2);
    expect(data.summary.activeReviewRuns).toBe(1);
    expect(data.reviewGroups).toHaveLength(1);
    expect(data.reviewGroups[0].prNumber).toBe(44);
    expect(data.reviewGroups[0].runs).toHaveLength(1);
    expect(data.reviewGroups[0].runs[0].deployment?.id).toBe(20);
    expect(data.reviewGroups[0].runs[0].detailHref).toBe("/reviews/3");
    expect(data.reviewGroups[0].runs[0].rangeLabel).toBe("2222222..3333333");
  });

  it("derives review summaries and finding counts for navigable rows", () => {
    const data = buildSessionsOverview({
      repos: [repo],
      activeDeployments: [],
      recentDeploymentsByRepo: new Map(),
      reviewsByRepo: new Map([
        [repo.id, [
          review({
            id: 7,
            prNumber: 44,
            deploymentId: null,
            status: "completed",
            startedAt: 40,
            reviewedFromSha: null,
            resultJson: JSON.stringify({ summary: "clean pass", findingCount: 0 }),
          }),
        ]],
      ]),
      previews: {},
      filters: normalizeSessionsFilters({ tab: "reviews" }),
    });

    expect(data.reviewGroups[0].runs[0]).toEqual(expect.objectContaining({
      detailHref: "/reviews/7",
      rangeLabel: "full 3333333",
      summary: "clean pass",
      findingCount: 0,
    }));
  });
});

function activeDeployment(input: {
  id: number;
  targetType: "issue" | "pr";
  targetNumber: number;
  triggeredBy: "manual" | "webhook" | "comment_command";
  parentDeploymentId?: number | null;
}): ActiveDeploymentWithRepo {
  return {
    ...baseDeployment(input),
    state: "active",
    endedAt: null,
    owner: repo.owner,
    repoName: repo.name,
  };
}

function endedDeployment(input: {
  id: number;
  targetType: "issue" | "pr";
  targetNumber: number;
  triggeredBy: "manual" | "webhook" | "comment_command";
}): Deployment {
  return {
    ...baseDeployment(input),
    state: "active",
    endedAt: "2026-05-24T01:00:00.000Z",
    terminalReason: "completed",
  };
}

function baseDeployment(input: {
  id: number;
  targetType: "issue" | "pr";
  targetNumber: number;
  triggeredBy: "manual" | "webhook" | "comment_command";
  parentDeploymentId?: number | null;
}): Deployment {
  return {
    id: input.id,
    repoId: repo.id,
    issueNumber: input.targetType === "issue" ? input.targetNumber : null,
    targetType: input.targetType,
    targetNumber: input.targetNumber,
    agent: "codex",
    branchName: input.targetType === "pr" ? "review/feature-branch" : "issue-507-ux",
    workspaceMode: "worktree",
    workspacePath: "/tmp/worktree",
    linkedPrNumber: input.targetType === "issue" ? 44 : null,
    state: "active",
    terminalBackend: "ttyd",
    triggeredBy: input.triggeredBy,
    parentDeploymentId: input.parentDeploymentId ?? null,
    webhookDepth: input.triggeredBy === "webhook" ? 1 : 0,
    launchedAt: "2026-05-24T00:00:00.000Z",
    endedAt: null,
    terminalReason: null,
    completionToken: null,
    completionResultJson: null,
    notificationSentAt: null,
    ttydPort: input.id === 10 ? 7710 : null,
    ttydPid: null,
    idleSince: null,
  };
}

function review(input: {
  id: number;
  prNumber: number;
  deploymentId: number | null;
  status: "in_progress" | "completed";
  startedAt: number;
  reviewedFromSha?: string | null;
  resultJson?: string | null;
}): PrReview {
  return {
    id: input.id,
    repoId: repo.id,
    prNumber: input.prNumber,
    deploymentId: input.deploymentId,
    startedHeadSha: "abcdef123456",
    completedHeadSha: input.status === "completed" ? "fedcba654321" : null,
    reviewBaseSha: "111111111111",
    reviewedFromSha: input.reviewedFromSha === undefined ? "222222222222" : input.reviewedFromSha,
    reviewedToSha: "333333333333",
    headRepoFullName: repo.owner + "/" + repo.name,
    headRef: "feature-branch",
    status: input.status,
    triggeredBy: "comment_command",
    resultJson: input.resultJson ?? null,
    startedAt: input.startedAt,
    completedAt: input.status === "completed" ? input.startedAt + 5 : null,
  };
}
