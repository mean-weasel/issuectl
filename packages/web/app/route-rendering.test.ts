/* eslint-disable max-lines */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Repo, WebhookLogEntry } from "@issuectl/core";

const core = vi.hoisted(() => ({
  db: {},
  dbExists: vi.fn(),
  getDb: vi.fn(),
  getRepo: vi.fn(),
  getSetting: vi.fn(),
  listRepos: vi.fn(),
  listWebhookLogEntries: vi.fn(),
  queryDiagnosticEvents: vi.fn(),
  getActiveDeployments: vi.fn(),
  getActiveWebhookDeploymentsForRepoTarget: vi.fn(),
  getDeploymentsForTarget: vi.fn(),
  listPrReviewsForRepo: vi.fn(),
  listRecentTerminalDeploymentsByRepo: vi.fn(),
  listWebhookEvents: vi.fn(),
  getOctokit: vi.fn(),
  getIssueHeader: vi.fn(),
  getPullDetail: vi.fn(),
  getPriority: vi.fn(),
  getSettings: vi.fn(),
  listLabels: vi.fn(),
}));

const data = vi.hoisted(() => ({
  getSessionsOverviewData: vi.fn(),
  normalizeSessionsFilters: vi.fn(),
  getReviewDetailData: vi.fn(),
}));

const webhookHealth = vi.hoisted(() => ({
  getWebhookAutomationHealth: vi.fn(),
}));

vi.mock("@issuectl/core", () => core);
vi.mock("@/lib/sessions-data", () => data);
vi.mock("@/lib/review-detail-data", () => data);
vi.mock("@/lib/webhook-health", () => webhookHealth);
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: (props: Record<string, unknown>) => React.createElement("mock-page-header", props),
}));
vi.mock("@/components/sessions/SessionsReviewList", () => ({
  SessionsReviewList: (props: Record<string, unknown>) => React.createElement("mock-sessions-review-list", props),
}));
vi.mock("@/components/reviews/ReviewDetailPanel", () => ({
  ReviewDetailPanel: (props: Record<string, unknown>) => React.createElement("mock-review-detail-panel", props),
}));
vi.mock("@/components/repos/RepoSettingsPanel", () => ({
  RepoSettingsPanel: (props: Record<string, unknown>) => React.createElement("mock-repo-settings-panel", props),
}));
vi.mock("@/components/detail/IssueDetail", () => ({
  IssueDetail: (props: Record<string, unknown>) => React.createElement("mock-issue-detail", props, props.children as React.ReactNode),
}));
vi.mock("@/components/detail/IssueDetailContent", () => ({
  IssueDetailContent: (props: Record<string, unknown>) => React.createElement("mock-issue-detail-content", props),
}));
vi.mock("@/components/detail/PrDetail", () => ({
  PrDetail: (props: Record<string, unknown>) => React.createElement("mock-pr-detail", props),
}));
vi.mock("@/components/detail/ImageLightbox", () => ({
  LightboxProvider: (props: Record<string, unknown>) => React.createElement("mock-lightbox-provider", props, props.children as React.ReactNode),
}));
vi.mock("@/components/ui/PullToRefreshWrapper", () => ({
  PullToRefreshWrapper: (props: Record<string, unknown>) => React.createElement("mock-pull-to-refresh", props, props.children as React.ReactNode),
}));
vi.mock("./logs/webhooks/WebhookLiveTail", () => ({
  WebhookLiveTail: (props: Record<string, unknown>) => React.createElement("mock-webhook-live-tail", props),
}));

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
  reviewPreamble: "Focus on regressions.",
  webhookPayloadMode: "metadata",
  createdAt: "2026-05-24T00:00:00.000Z",
};

beforeEach(() => {
  core.dbExists.mockReturnValue(true);
  core.getDb.mockReturnValue(core.db);
  core.getRepo.mockReturnValue(repo);
  core.getSetting.mockReturnValue("https://hooks.example.test");
  core.listRepos.mockReturnValue([repo]);
  core.listWebhookLogEntries.mockReturnValue([webhookEntry()]);
  core.queryDiagnosticEvents.mockReturnValue([]);
  core.getActiveDeployments.mockReturnValue([]);
  core.getActiveWebhookDeploymentsForRepoTarget.mockReturnValue([]);
  core.getDeploymentsForTarget.mockReturnValue([]);
  core.listPrReviewsForRepo.mockReturnValue([]);
  core.listRecentTerminalDeploymentsByRepo.mockReturnValue([]);
  core.listWebhookEvents.mockReturnValue([webhookEntry()]);
  webhookHealth.getWebhookAutomationHealth.mockResolvedValue({
    state: "ok",
    summary: "GitHub webhook delivery looks healthy",
    detail: "The GitHub hook URL matches local settings and the latest visible delivery succeeded.",
    recovery: null,
    expectedUrl: "https://hooks.example.test/api/webhook/github/1",
    hookId: 123,
    githubUrl: "https://hooks.example.test/api/webhook/github/1",
    latestDelivery: null,
  });
  core.getOctokit.mockResolvedValue({});
  core.getIssueHeader.mockResolvedValue({
    issue: {
      number: 26,
      title: "Manual QA",
      body: "body",
      state: "open",
      labels: [],
      assignees: [],
      user: null,
      commentCount: 0,
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
      closedAt: null,
      htmlUrl: "https://github.com/mean-weasel/issuectl/issues/26",
    },
    deployments: [],
    referencedFiles: [],
  });
  core.getPullDetail.mockResolvedValue({
    pull: {
      number: 44,
      title: "Review labels",
      body: "body",
      state: "open",
      labels: [{ name: "issuectl:auto-review", color: "a371f7", description: null }],
      draft: false,
      merged: false,
      user: null,
      headRef: "feature/review-labels",
      baseRef: "main",
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
      mergedAt: null,
      closedAt: null,
      htmlUrl: "https://github.com/mean-weasel/issuectl/pull/44",
    },
    checks: [],
    files: [],
    reviews: [],
    linkedIssue: null,
  });
  core.getPriority.mockReturnValue("normal");
  core.getSettings.mockReturnValue([{ key: "launch_agent", value: "codex" }]);
  core.listLabels.mockResolvedValue([
    { name: "bug", color: "d73a4a", description: null },
    { name: "issuectl:auto-launch", color: "0e8a16", description: null },
    { name: "issuectl:auto-review", color: "a371f7", description: null },
  ]);
  data.normalizeSessionsFilters.mockReturnValue({ tab: "sessions" });
  data.getSessionsOverviewData.mockResolvedValue({ summary: { activeSessions: 1 } });
  data.getReviewDetailData.mockReturnValue({
    links: {
      githubPr: "https://github.com/mean-weasel/issuectl/pull/44",
    },
  });
});

describe("operator route rendering", () => {
  it("renders webhook logs with live-tail props from filtered route data", async () => {
    const { default: WebhookLogsPage } = await import("./logs/webhooks/page");
    core.listWebhookLogEntries.mockReturnValue([
      webhookEntry({
        payloadJson: JSON.stringify({
          action: "created",
          issue: { number: 507, body: "private body text" },
          comment: { body: "private comment text" },
          token: "ghp_1234567890abcdef",
        }),
      }),
    ]);

    const tree = await WebhookLogsPage({
      searchParams: Promise.resolve({ repo: "1" }),
    });

    expect(core.listWebhookLogEntries).toHaveBeenCalledWith(core.db, {
      limit: 200,
      repoId: 1,
    });
    const liveTail = findElementWhere(tree, (props) => props.endpoint === "/api/webhooks/events/stream");
    expect(liveTail?.props).toMatchObject({
      endpoint: "/api/webhooks/events/stream",
      initialEntries: [expect.objectContaining({ deliveryId: "delivery-1" })],
      initialCounts: expect.objectContaining({ fired: 1, total: 1 }),
    });
    const renderedText = renderToStaticMarkup(tree);
    expect(renderedText).toContain("[redacted]");
    expect(renderedText).not.toContain("private body text");
    expect(renderedText).not.toContain("private comment text");
    expect(renderedText).not.toContain("ghp_1234567890abcdef");
  });

  it("renders sessions overview with normalized filters and built data", async () => {
    const { default: SessionsPage } = await import("./sessions/page");

    const tree = await SessionsPage({
      searchParams: Promise.resolve({ tab: "reviews", trigger: "webhook" }),
    });

    expect(data.normalizeSessionsFilters).toHaveBeenCalledWith({
      tab: "reviews",
      trigger: "webhook",
    });
    expect(data.getSessionsOverviewData).toHaveBeenCalledWith({ tab: "sessions" });
    expect(findElementWhere(tree, (props) =>
      isRecord(props.data) &&
      isRecord(props.data.summary) &&
      props.data.summary.activeSessions === 1,
    )?.props.data).toEqual({
      summary: { activeSessions: 1 },
    });
  });

  it("renders review detail with action handlers and detail data", async () => {
    const { default: ReviewDetailPage } = await import("./reviews/[reviewId]/page");

    const tree = await ReviewDetailPage({
      params: Promise.resolve({ reviewId: "7" }),
    });

    expect(data.getReviewDetailData).toHaveBeenCalledWith(7);
    const panel = findElementWhere(tree, (props) => typeof props.retryAction === "function");
    expect(panel?.props.data).toMatchObject({
      links: { githubPr: "https://github.com/mean-weasel/issuectl/pull/44" },
    });
    expect(panel?.props.retryAction).toEqual(expect.any(Function));
    expect(panel?.props.fullRerunAction).toEqual(expect.any(Function));
  });

  it("renders repo settings with activity, webhook URL, and recent deliveries", async () => {
    const { default: RepoSettingsPage } = await import("./repos/[owner]/[repo]/settings/page");

    const tree = await RepoSettingsPage({
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }),
    });

    expect(core.getRepo).toHaveBeenCalledWith(core.db, "mean-weasel", "issuectl");
    expect(core.listWebhookEvents).toHaveBeenCalledWith(core.db, { repoId: 1, limit: 10 });
    expect(webhookHealth.getWebhookAutomationHealth).toHaveBeenCalledWith(core.db, repo);
    const panel = findElementWhere(tree, (props) => props.repo === repo);
    expect(panel?.props).toMatchObject({
      repo,
      webhookUrl: "https://hooks.example.test/api/webhook/github/1",
      webhookHealth: expect.objectContaining({ state: "ok" }),
      activity: {
        activeSessions: 0,
        activeIssueSessions: 0,
        activePrSessions: 0,
        recentCompletions: 0,
        webhookEvents: 1,
        prReviews: 0,
      },
      recentDeliveries: [expect.objectContaining({ deliveryId: "delivery-1" })],
      settingsHref: "/settings/repos",
    });
  });

  it("renders issue detail with repo labels for editing existing issues", async () => {
    const { default: IssueDetailPage } = await import("./issues/[owner]/[repo]/[number]/page");

    const tree = await IssueDetailPage({
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl", number: "26" }),
    });

    expect(core.listLabels).toHaveBeenCalledWith({}, "mean-weasel", "issuectl");
    const detail = findElementWhere(tree, (props) => Array.isArray(props.availableLabels));
    expect(webhookHealth.getWebhookAutomationHealth).toHaveBeenCalledWith(core.db, repo);
    expect(detail?.props.availableLabels).toEqual([
      { name: "bug", color: "d73a4a", description: null },
      { name: "issuectl:auto-launch", color: "0e8a16", description: null },
      { name: "issuectl:auto-review", color: "a371f7", description: null },
    ]);
  });

  it("renders PR detail with repo labels for editing PR automation labels", async () => {
    const { default: PullDetailPage } = await import("./pulls/[owner]/[repo]/[number]/page");
    core.getDeploymentsForTarget.mockReturnValueOnce([
      {
        id: 77,
        repoId: 1,
        issueNumber: null,
        targetType: "pr",
        targetNumber: 44,
        agent: "claude",
        branchName: "pr-44-review",
        workspaceMode: "worktree",
        workspacePath: "/tmp/pr-44",
        linkedPrNumber: null,
        state: "active",
        terminalBackend: "ttyd",
        triggeredBy: "webhook",
        parentDeploymentId: null,
        webhookDepth: 0,
        launchedAt: "2026-05-27T00:00:00.000Z",
        endedAt: null,
        terminalReason: null,
        completionToken: null,
        completionResultJson: null,
        notificationSentAt: null,
        ttydPort: 7777,
        ttydPid: 12345,
        idleSince: null,
      },
    ]);

    const tree = await PullDetailPage({
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl", number: "44" }),
    });

    expect(core.getPullDetail).toHaveBeenCalledWith(core.db, {}, "mean-weasel", "issuectl", 44);
    expect(core.getDeploymentsForTarget).toHaveBeenCalledWith(core.db, 1, "pr", 44);
    expect(core.listLabels).toHaveBeenCalledWith({}, "mean-weasel", "issuectl");
    const detail = findElementWhere(tree, (props) => Array.isArray(props.availableLabels));
    expect(webhookHealth.getWebhookAutomationHealth).toHaveBeenCalledWith(core.db, repo);
    expect(detail?.props.availableLabels).toEqual([
      { name: "bug", color: "d73a4a", description: null },
      { name: "issuectl:auto-launch", color: "0e8a16", description: null },
      { name: "issuectl:auto-review", color: "a371f7", description: null },
    ]);
    expect(detail?.props.pull).toEqual(
      expect.objectContaining({
        number: 44,
        labels: [{ name: "issuectl:auto-review", color: "a371f7", description: null }],
      }),
    );
    expect(detail?.props.deployments).toEqual([
      expect.objectContaining({ id: 77, targetType: "pr", targetNumber: 44 }),
    ]);
  });
});

function webhookEntry(overrides: Partial<WebhookLogEntry> = {}): WebhookLogEntry {
  return {
    id: 1,
    deliveryId: "delivery-1",
    repoId: repo.id,
    eventType: "issues",
    action: "opened",
    senderLogin: "octocat",
    targetType: "issue",
    targetNumber: 507,
    intentId: 3,
    receivedAt: 1_000,
    result: "fired",
    resultDetail: null,
    actionId: null,
    payloadJson: null,
    intent: null,
    ...overrides,
  };
}

function findElementWhere(
  value: unknown,
  predicate: (props: Record<string, unknown>) => boolean,
): React.ReactElement<Record<string, unknown>> | null {
  if (!React.isValidElement(value)) return null;
  const element = value as React.ReactElement<Record<string, unknown>>;
  if (predicate(element.props)) {
    return element;
  }

  const children = React.Children.toArray(element.props.children as React.ReactNode);
  for (const child of children) {
    const match = findElementWhere(child, predicate);
    if (match) return match;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
