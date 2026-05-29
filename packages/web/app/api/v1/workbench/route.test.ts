/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const getSessionPreviews = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session-previews", () => ({
  getSessionPreviews: (...args: unknown[]) => getSessionPreviews(...args),
}));

const getDb = vi.hoisted(() => vi.fn());
const listRepos = vi.hoisted(() => vi.fn());
const getActiveDeployments = vi.hoisted(() => vi.fn());
const getIssues = vi.hoisted(() => vi.fn());
const listDrafts = vi.hoisted(() => vi.fn());
const listPrReviewsForRepo = vi.hoisted(() => vi.fn());
const listPrioritiesForRepo = vi.hoisted(() => vi.fn());
const listRecentTerminalDeploymentsByRepo = vi.hoisted(() => vi.fn());
const listWebhookEvents = vi.hoisted(() => vi.fn());
const getSettings = vi.hoisted(() => vi.fn());
const withAuthRetry = vi.hoisted(() => vi.fn());
const getPulls = vi.hoisted(() => vi.fn());
const getPullDetail = vi.hoisted(() => vi.fn());
const mapLimit = vi.hoisted(() => vi.fn());
const checkGhAuth = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  DEFAULT_REPO_FANOUT: 6,
  getDb: () => getDb(),
  listRepos: (...args: unknown[]) => listRepos(...args),
  getActiveDeployments: (...args: unknown[]) => getActiveDeployments(...args),
  getIssues: (...args: unknown[]) => getIssues(...args),
  listDrafts: (...args: unknown[]) => listDrafts(...args),
  listPrReviewsForRepo: (...args: unknown[]) => listPrReviewsForRepo(...args),
  listPrioritiesForRepo: (...args: unknown[]) => listPrioritiesForRepo(...args),
  listRecentTerminalDeploymentsByRepo: (...args: unknown[]) => listRecentTerminalDeploymentsByRepo(...args),
  listWebhookEvents: (...args: unknown[]) => listWebhookEvents(...args),
  getSettings: (...args: unknown[]) => getSettings(...args),
  withAuthRetry: (...args: unknown[]) => withAuthRetry(...args),
  checkGhAuth: (...args: unknown[]) => checkGhAuth(...args),
  mapLimit: (...args: unknown[]) => mapLimit(...args),
  getPulls: (...args: unknown[]) => getPulls(...args),
  getPullDetail: (...args: unknown[]) => getPullDetail(...args),
  formatErrorForUser: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

import { GET } from "./route";

const db = {};
const octokit = {
  rest: {
    users: {
      getAuthenticated: vi.fn(),
    },
  },
};

const repos = [
  repo(1, "neonwatty", "issuectl"),
  repo(2, "neonwatty", "bugdrop"),
  repo(3, "neonwatty", "api"),
  repo(4, "neonwatty", "web"),
];

const deployments = [
  deployment(101, 1, "issuectl", 12, 7701, "active", null),
  deployment(102, 1, "issuectl", 14, 7702, "active", null),
  deployment(103, 1, "issuectl", 16, 7703, "active", null),
  deployment(201, 2, "bugdrop", 22, 7710, "active", null),
  deployment(301, 1, "issuectl", 18, 7788, "pending", null),
  deployment(302, 1, "issuectl", 20, 7799, "active", "2026-05-15T12:00:00.000Z"),
];

const issuesByRepo: Record<string, unknown[]> = {
  issuectl: [
    issue(12, "Preview terminal failures", "high"),
    issue(14, "Settings launch options", "normal"),
    issue(16, "Worktree status polish", "low"),
    issue(18, "Deferred pending deployment", "normal"),
  ],
  bugdrop: [issue(22, "Add repo board", "high"), issue(23, "Quiet empty state", "normal")],
  api: [],
  web: [],
};

const prioritiesByRepoId = new Map([
  [1, [
    { repoId: 1, issueNumber: 12, priority: "high", updatedAt: 1 },
    { repoId: 1, issueNumber: 16, priority: "low", updatedAt: 2 },
  ]],
  [2, [{ repoId: 2, issueNumber: 22, priority: "high", updatedAt: 3 }]],
]);

beforeEach(() => {
  requireAuth.mockReset();
  getDb.mockReset();
  listRepos.mockReset();
  getActiveDeployments.mockReset();
  getIssues.mockReset();
  listDrafts.mockReset();
  listPrReviewsForRepo.mockReset();
  listPrioritiesForRepo.mockReset();
  listRecentTerminalDeploymentsByRepo.mockReset();
  listWebhookEvents.mockReset();
  getSettings.mockReset();
  getSessionPreviews.mockReset();
  withAuthRetry.mockReset();
  getPulls.mockReset();
  getPullDetail.mockReset();
  mapLimit.mockReset();
  checkGhAuth.mockReset();
  octokit.rest.users.getAuthenticated.mockReset();

  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue(db);
  listRepos.mockReturnValue(repos);
  getActiveDeployments.mockReturnValue(deployments);
  listDrafts.mockReturnValue([
    {
      id: "draft-1",
      title: "Draft next dashboard batch",
      body: "Carry the web board contract into iOS.",
      priority: "high",
      createdAt: 1_779_000_000,
      updatedAt: 1_779_000_100,
    },
  ]);
  getSettings.mockReturnValue([
    { key: "branch_pattern", value: "issue-{number}-{slug}" },
    { key: "launch_agent", value: "codex" },
    { key: "codex_extra_args", value: "--sandbox danger-full-access" },
    { key: "public_webhook_base_url", value: "https://hooks.example.test" },
    { key: "api_token", value: "secret" },
  ]);
  listPrReviewsForRepo.mockImplementation((_db, repoId: number) =>
    repoId === 1
      ? [{
        id: 701,
        repoId: 1,
        prNumber: 44,
        deploymentId: 101,
        startedHeadSha: "head-b",
        completedHeadSha: "head-b",
        reviewBaseSha: "base-a",
        reviewedFromSha: "head-a",
        reviewedToSha: "head-b",
        headRepoFullName: "neonwatty/issuectl",
        headRef: "feature/webhooks",
        status: "completed",
        triggeredBy: "webhook",
        resultJson: JSON.stringify({ status: "no_changes" }),
        startedAt: 1_779_000_000_000,
        completedAt: 1_779_000_100_000,
      }]
      : [],
  );
  listRecentTerminalDeploymentsByRepo.mockImplementation((_db, repoId: number) =>
    repoId === 1
      ? [{
        ...deployment(401, 1, "issuectl", 44, 7781, "active", "2026-05-16T18:00:00.000Z"),
        targetType: "pr",
        issueNumber: null,
        terminalReason: "completed",
        completionResultJson: JSON.stringify({ status: "completed", summary: "review complete" }),
      }]
      : [],
  );
  listWebhookEvents.mockImplementation((_db, input: { repoId?: number }) =>
    input.repoId === 1
      ? [{
        id: 801,
        deliveryId: "delivery-801",
        repoId: 1,
        eventType: "pull_request",
        action: "synchronize",
        senderLogin: "octocat",
        targetType: "pr",
        targetNumber: 44,
        payloadJson: null,
        receivedAt: 1_779_000_000_000,
        intentId: 901,
      }]
      : [],
  );
  listPrioritiesForRepo.mockImplementation((_db, repoId: number) =>
    prioritiesByRepoId.get(repoId) ?? [],
  );
  getIssues.mockImplementation((_db, _octokit, _owner: string, repoName: string) =>
    Promise.resolve({
      issues: issuesByRepo[repoName] ?? [],
      fromCache: repoName === "issuectl",
      cachedAt: new Date("2026-05-16T16:00:00.000Z"),
    }),
  );
  getSessionPreviews.mockResolvedValue({
    "7701": preview("active"),
    "7702": preview("idle"),
    "7703": preview("error"),
    "7710": preview("active"),
  });
  checkGhAuth.mockResolvedValue({ ok: true, username: "jeremy" });
  octokit.rest.users.getAuthenticated.mockResolvedValue({ data: { login: "jeremy" } });
  withAuthRetry.mockImplementation((fn: (client: unknown) => unknown) => fn(octokit));
  mapLimit.mockImplementation(
    (items: unknown[], _limit: number, fn: (item: unknown, index: number) => unknown) =>
      Promise.all(items.map(fn)),
  );
});

describe("/api/v1/workbench", () => {
  it("requires API auth", async () => {
    requireAuth.mockReturnValueOnce(NextResponse.json({ error: "denied" }, { status: 401 }));

    const response = await GET(new NextRequest("http://localhost/api/v1/workbench"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "denied" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("returns the aggregate workbench payload without pending deployments or PR detail fetches", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/workbench"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.repos[0].badgeCount).toBe(3);
    expect(json.drafts).toEqual([
      expect.objectContaining({
        id: "draft-1",
        title: "Draft next dashboard batch",
        priority: "high",
      }),
    ]);
    expect(json.repos[0].issues).toHaveLength(4);
    expect(json.repos[0].deployments).toHaveLength(3);
    expect(json.repos[0].recentCompletions).toEqual([
      expect.objectContaining({
        targetType: "pr",
        targetNumber: 44,
        terminalReason: "completed",
        completionResultJson: expect.stringContaining("review complete"),
      }),
    ]);
    expect(json.repos[0].webhookEvents).toEqual([
      expect.objectContaining({
        eventType: "pull_request",
        targetType: "pr",
        targetNumber: 44,
      }),
    ]);
    expect(json.repos[0].prReviews).toEqual([
      expect.objectContaining({
        prNumber: 44,
        reviewedFromSha: "head-a",
        reviewedToSha: "head-b",
      }),
    ]);
    expect(json.repos[0].previews["7703"].status).toBe("error");
    expect(json.repos[3].issues).toHaveLength(0);
    expect(json.repos[0].issues[0]).toMatchObject({
      number: 12,
      priority: "high",
      hasActiveDeployment: true,
    });
    expect(json.settings).toMatchObject({
      branch_pattern: "issue-{number}-{slug}",
      launch_agent: "codex",
      codex_extra_args: "--sandbox danger-full-access",
      public_webhook_base_url: "https://hooks.example.test",
    });
    expect(json.settings.api_token).toBeUndefined();
    expect(json.user).toEqual({ login: "jeremy", error: null });
    expect(json.health).toMatchObject({ ok: true, error: null });
    expect(json.deployments.map((item: { id: number }) => item.id)).toEqual([101, 102, 103, 201]);
    expect(JSON.stringify(json)).not.toContain("namedShell");
    expect(getPulls).not.toHaveBeenCalled();
    expect(getPullDetail).not.toHaveBeenCalled();
  });

  it("keeps partial repo data when a repo issue fetch fails", async () => {
    getIssues.mockImplementation((_db, _octokit, _owner: string, repoName: string) => {
      if (repoName === "api") {
        return Promise.reject(new Error("GitHub unavailable for api"));
      }
      return Promise.resolve({
        issues: issuesByRepo[repoName] ?? [],
        fromCache: false,
        cachedAt: null,
      });
    });

    const response = await GET(new NextRequest("http://localhost/api/v1/workbench"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.repos.find((item: { name: string }) => item.name === "issuectl").issues).toHaveLength(4);
    const apiRepo = json.repos.find((item: { name: string }) => item.name === "api");
    expect(apiRepo.issues).toEqual([]);
    expect(apiRepo.issueError).toBe("GitHub unavailable for api");
  });
});

function repo(id: number, owner: string, name: string) {
  return {
    id,
    owner,
    name,
    localPath: `/workspace/${name}`,
    branchPattern: null,
    createdAt: "2026-05-16T15:00:00.000Z",
    autoLaunchIssues: false,
    autoReviewPrs: false,
    issueAgent: "claude",
    reviewAgent: "claude",
    webhookId: null,
    reviewPreamble: null,
    webhookPayloadMode: "metadata",
  };
}

function deployment(
  id: number,
  repoId: number,
  repoName: string,
  issueNumber: number,
  ttydPort: number,
  state: "active" | "pending",
  endedAt: string | null,
) {
  return {
    id,
    repoId,
    issueNumber,
    targetType: "issue",
    targetNumber: issueNumber,
    triggeredBy: "manual",
    parentDeploymentId: null,
    webhookDepth: 0,
    terminalReason: null,
    completionToken: null,
    completionResultJson: null,
    notificationSentAt: null,
    agent: "codex",
    branchName: `issue-${issueNumber}`,
    workspaceMode: "worktree",
    workspacePath: `/workspace/${repoName}`,
    linkedPrNumber: null,
    state,
    launchedAt: "2026-05-16T15:10:00.000Z",
    endedAt,
    ttydPort,
    ttydPid: 1234,
    idleSince: null,
    owner: "neonwatty",
    repoName,
  };
}

function issue(number: number, title: string, priority: string) {
  return {
    number,
    title,
    body: null,
    state: "open",
    labels: [{ name: priority, color: "ffffff", description: null }],
    assignees: [],
    user: { login: "jeremy", avatarUrl: "" },
    commentCount: 0,
    createdAt: "2026-05-15T15:00:00.000Z",
    updatedAt: "2026-05-16T15:30:00.000Z",
    closedAt: null,
    htmlUrl: `https://github.com/neonwatty/issuectl/issues/${number}`,
  };
}

function preview(status: "active" | "idle" | "error" | "unavailable") {
  return {
    lines: [`${status} preview`],
    lastUpdatedMs: 1_779_000_000_000,
    lastChangedMs: status === "idle" ? null : 1_779_000_000_000,
    status,
  };
}
