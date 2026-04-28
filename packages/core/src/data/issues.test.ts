import { describe, it, expect, vi, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import type { GitHubIssue, GitHubComment, GitHubPull } from "../github/types.js";
import { createTestDb } from "../db/test-helpers.js";
import { setCached } from "../db/cache.js";
import { addRepo } from "../db/repos.js";

/* ---------- mock github modules so they don't make real API calls ---------- */

const { githubMocks, pullsMocks, reconcileMock } = vi.hoisted(() => {
  const githubMocks = {
    listIssues: vi.fn(),
    getIssue: vi.fn(),
    getComments: vi.fn(),
  };
  const pullsMocks = {
    findLinkedPRs: vi.fn(),
  };
  const reconcileMock = vi.fn();
  return { githubMocks, pullsMocks, reconcileMock };
});

vi.mock("../github/issues.js", () => ({
  listIssues: githubMocks.listIssues,
  getIssue: githubMocks.getIssue,
  getComments: githubMocks.getComments,
}));

vi.mock("../github/pulls.js", () => ({
  findLinkedPRs: pullsMocks.findLinkedPRs,
}));

vi.mock("../lifecycle/reconcile.js", () => ({
  reconcileIssueLifecycle: reconcileMock,
}));

const { getIssues, getIssueDetail } = await import("./issues.js");

/* ---------- helpers ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = ReturnType<typeof vi.fn<(...args: any[]) => any>>;

function fakeOctokit(): Octokit {
  return {} as unknown as Octokit;
}

function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 1,
    title: "Test issue",
    body: "Check `src/index.ts` and https://github.com/owner/repo/blob/main/lib/utils.ts for context",
    state: "open",
    labels: [],
    assignees: [],
    user: null,
    commentCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    closedAt: null,
    htmlUrl: "https://github.com/owner/repo/issues/1",
    ...overrides,
  };
}

function makeComment(): GitHubComment {
  return {
    id: 1,
    body: "A comment",
    user: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    htmlUrl: "https://github.com/owner/repo/issues/1#issuecomment-1",
  };
}

function makePR(): GitHubPull {
  return {
    number: 10,
    title: "Fix",
    body: "closes #1",
    state: "open",
    draft: false,
    merged: false,
    user: null,
    headRef: "fix",
    baseRef: "main",
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    mergedAt: null,
    closedAt: null,
    htmlUrl: "https://github.com/owner/repo/pull/10",
  };
}

/* ---------- tests ---------- */

describe("getIssues", () => {
  let db: Database.Database;
  let octokit: Octokit;

  beforeEach(() => {
    db = createTestDb();
    octokit = fakeOctokit();
    githubMocks.listIssues.mockReset();
    githubMocks.getIssue.mockReset();
    githubMocks.getComments.mockReset();
    pullsMocks.findLinkedPRs.mockReset();
    reconcileMock.mockReset();
  });

  it("cold cache: calls Octokit, caches result, returns issues", async () => {
    const issues = [makeIssue()];
    githubMocks.listIssues.mockResolvedValue(issues);

    const result = await getIssues(db, octokit, "owner", "repo");
    expect(result.issues).toHaveLength(1);
    expect(result.fromCache).toBe(false);
    expect(result.cachedAt).toBeInstanceOf(Date);
    expect(githubMocks.listIssues).toHaveBeenCalledOnce();
  });

  it("warm cache: returns cached data without calling Octokit", async () => {
    // Pre-populate cache
    const issues = [makeIssue()];
    setCached(db, "issues:owner/repo", issues);
    // Set a very long TTL so the cache stays fresh
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cache_ttl', '99999')").run();

    const result = await getIssues(db, octokit, "owner", "repo");
    expect(result.issues).toHaveLength(1);
    expect(result.fromCache).toBe(true);
    expect(githubMocks.listIssues).not.toHaveBeenCalled();
  });

  it("forceRefresh bypasses cache", async () => {
    // Pre-populate cache
    setCached(db, "issues:owner/repo", [makeIssue({ number: 99 })]);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cache_ttl', '99999')").run();

    const freshIssues = [makeIssue({ number: 42 })];
    githubMocks.listIssues.mockResolvedValue(freshIssues);

    const result = await getIssues(db, octokit, "owner", "repo", { forceRefresh: true });
    expect(result.issues[0].number).toBe(42);
    expect(result.fromCache).toBe(false);
    expect(githubMocks.listIssues).toHaveBeenCalledOnce();
  });

  it("API error on cold cache propagates", async () => {
    githubMocks.listIssues.mockRejectedValue(new Error("rate limited"));
    await expect(getIssues(db, octokit, "owner", "repo")).rejects.toThrow("rate limited");
  });
});

describe("getIssueDetail", () => {
  let db: Database.Database;
  let octokit: Octokit;

  beforeEach(() => {
    db = createTestDb();
    octokit = fakeOctokit();
    githubMocks.listIssues.mockReset();
    githubMocks.getIssue.mockReset();
    githubMocks.getComments.mockReset();
    pullsMocks.findLinkedPRs.mockReset();
    reconcileMock.mockResolvedValue({});
  });

  it("returns issue, comments, linkedPRs, deployments, and referenced files", async () => {
    const issue = makeIssue();
    githubMocks.getIssue.mockResolvedValue(issue);
    githubMocks.getComments.mockResolvedValue([makeComment()]);
    pullsMocks.findLinkedPRs.mockResolvedValue([makePR()]);

    const result = await getIssueDetail(db, octokit, "owner", "repo", 1);
    expect(result.issue.number).toBe(1);
    expect(result.comments).toHaveLength(1);
    expect(result.linkedPRs).toHaveLength(1);
    expect(result.deployments).toEqual([]);
    expect(result.fromCache).toBe(false);
  });

  it("extracts file paths from issue body (backtick and GitHub blob URL)", async () => {
    const issue = makeIssue({
      body: "Check `src/index.ts` and https://github.com/owner/repo/blob/main/lib/utils.ts for details",
    });
    githubMocks.getIssue.mockResolvedValue(issue);
    githubMocks.getComments.mockResolvedValue([]);
    pullsMocks.findLinkedPRs.mockResolvedValue([]);

    const result = await getIssueDetail(db, octokit, "owner", "repo", 1);
    expect(result.referencedFiles).toContain("src/index.ts");
    expect(result.referencedFiles).toContain("lib/utils.ts");
  });

  it("returns empty referencedFiles when body is null", async () => {
    const issue = makeIssue({ body: null });
    githubMocks.getIssue.mockResolvedValue(issue);
    githubMocks.getComments.mockResolvedValue([]);
    pullsMocks.findLinkedPRs.mockResolvedValue([]);

    const result = await getIssueDetail(db, octokit, "owner", "repo", 1);
    expect(result.referencedFiles).toEqual([]);
  });

  it("warm cache: returns cached detail without calling Octokit", async () => {
    const issue = makeIssue();
    const comments = [makeComment()];
    const linkedPRs = [makePR()];
    setCached(db, "issue-detail:owner/repo#1", { issue, comments, linkedPRs });
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cache_ttl', '99999')").run();

    const result = await getIssueDetail(db, octokit, "owner", "repo", 1);
    expect(result.fromCache).toBe(true);
    expect(result.issue.number).toBe(1);
    expect(githubMocks.getIssue).not.toHaveBeenCalled();
  });

  it("includes deployments from DB when repo exists", async () => {
    const repo = addRepo(db, { owner: "owner", name: "repo" });
    // Insert a deployment
    db.prepare(
      "INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path) VALUES (?, ?, ?, ?, ?)",
    ).run(repo.id, 1, "issue-1-fix", "existing", "/tmp/ws");

    githubMocks.getIssue.mockResolvedValue(makeIssue());
    githubMocks.getComments.mockResolvedValue([]);
    pullsMocks.findLinkedPRs.mockResolvedValue([]);

    const result = await getIssueDetail(db, octokit, "owner", "repo", 1);
    expect(result.deployments).toHaveLength(1);
    expect(result.deployments[0].branchName).toBe("issue-1-fix");
  });
});
