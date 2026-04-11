import { describe, it, expect, beforeEach, vi } from "vitest";
import type Database from "better-sqlite3";
import type { GitHubIssue, GitHubPull } from "../github/types.js";
import { LIFECYCLE_LABEL } from "../github/labels.js";
import { createTestDb } from "../db/test-helpers.js";
import { addRepo } from "../db/repos.js";
import { recordDeployment } from "../db/deployments.js";
import { reconcileIssueLifecycle } from "./reconcile.js";

/* ---------- helpers ---------- */

function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 1,
    title: "Test issue",
    body: "body",
    state: "open",
    labels: [],
    user: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    closedAt: null,
    htmlUrl: "https://github.com/owner/repo/issues/1",
    ...overrides,
  };
}

function makePR(overrides: Partial<GitHubPull> = {}): GitHubPull {
  return {
    number: 10,
    title: "PR title",
    body: "closes #1",
    state: "open",
    merged: false,
    user: null,
    headRef: "feature",
    baseRef: "main",
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    mergedAt: null,
    closedAt: null,
    htmlUrl: "https://github.com/owner/repo/pull/10",
    ...overrides,
  };
}

function fakeOctokit() {
  return {
    rest: {
      issues: {
        getLabel: vi.fn().mockResolvedValue({}),
        createLabel: vi.fn().mockResolvedValue({}),
        addLabels: vi.fn().mockResolvedValue({}),
        removeLabel: vi.fn().mockResolvedValue({}),
      },
    },
  } as unknown as import("@octokit/rest").Octokit;
}

/* ---------- tests ---------- */

describe("reconcileIssueLifecycle", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("no-ops when issue lacks the deployed label", async () => {
    const octokit = fakeOctokit();
    const issue = makeIssue({ labels: [] });
    const result = await reconcileIssueLifecycle(db, octokit, "owner", "repo", issue, []);
    expect(result.labelsAdded).toEqual([]);
    expect(result.labelsRemoved).toEqual([]);
    expect(result.linkedPR).toBeNull();
  });

  it("no-ops when issue has deployed label but no linked PRs", async () => {
    const octokit = fakeOctokit();
    const issue = makeIssue({
      labels: [{ name: LIFECYCLE_LABEL.deployed, color: "", description: null }],
    });
    const result = await reconcileIssueLifecycle(db, octokit, "owner", "repo", issue, []);
    expect(result.labelsAdded).toEqual([]);
    expect(result.linkedPR).toBeNull();
  });

  it("adds prOpen label when there is an open linked PR", async () => {
    const octokit = fakeOctokit();
    const issue = makeIssue({
      labels: [{ name: LIFECYCLE_LABEL.deployed, color: "", description: null }],
    });
    const linkedPRs = [makePR({ state: "open", merged: false })];
    const result = await reconcileIssueLifecycle(db, octokit, "owner", "repo", issue, linkedPRs);
    expect(result.labelsAdded).toContain(LIFECYCLE_LABEL.prOpen);
    expect(result.linkedPR).toEqual({ number: 10, state: "open" });
  });

  it("adds done label and removes prOpen when PR is merged and issue closed", async () => {
    const octokit = fakeOctokit();
    const issue = makeIssue({
      state: "closed",
      labels: [
        { name: LIFECYCLE_LABEL.deployed, color: "", description: null },
        { name: LIFECYCLE_LABEL.prOpen, color: "", description: null },
      ],
    });
    const linkedPRs = [makePR({ state: "closed", merged: true, mergedAt: "2026-01-02T00:00:00Z" })];
    const result = await reconcileIssueLifecycle(db, octokit, "owner", "repo", issue, linkedPRs);
    expect(result.labelsAdded).toContain(LIFECYCLE_LABEL.done);
    expect(result.labelsRemoved).toContain(LIFECYCLE_LABEL.prOpen);
    expect(result.linkedPR).toEqual({ number: 10, state: "merged" });
  });

  it("does not add prOpen redundantly when already present", async () => {
    const octokit = fakeOctokit();
    const issue = makeIssue({
      labels: [
        { name: LIFECYCLE_LABEL.deployed, color: "", description: null },
        { name: LIFECYCLE_LABEL.prOpen, color: "", description: null },
      ],
    });
    const linkedPRs = [makePR({ state: "open", merged: false })];
    const result = await reconcileIssueLifecycle(db, octokit, "owner", "repo", issue, linkedPRs);
    expect(result.labelsAdded).toEqual([]);
    expect(result.labelsRemoved).toEqual([]);
  });

  it("prefers merged PR over open PR", async () => {
    const octokit = fakeOctokit();
    const issue = makeIssue({
      state: "closed",
      labels: [{ name: LIFECYCLE_LABEL.deployed, color: "", description: null }],
    });
    const linkedPRs = [
      makePR({ number: 20, state: "open", merged: false }),
      makePR({ number: 30, state: "closed", merged: true }),
    ];
    const result = await reconcileIssueLifecycle(db, octokit, "owner", "repo", issue, linkedPRs);
    expect(result.linkedPR?.number).toBe(30);
    expect(result.linkedPR?.state).toBe("merged");
  });

  it("updates deployment linked_pr_number in DB when repo exists", async () => {
    const octokit = fakeOctokit();
    const repo = addRepo(db, { owner: "owner", name: "repo" });
    recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 1,
      branchName: "issue-1-test",
      workspaceMode: "existing",
      workspacePath: "/tmp/workspace",
    });
    const issue = makeIssue({
      labels: [{ name: LIFECYCLE_LABEL.deployed, color: "", description: null }],
    });
    const linkedPRs = [makePR({ number: 42, state: "open", merged: false })];
    await reconcileIssueLifecycle(db, octokit, "owner", "repo", issue, linkedPRs);

    // Verify the deployment was updated with the PR number
    const rows = db.prepare("SELECT linked_pr_number FROM deployments WHERE issue_number = 1").all() as Array<{ linked_pr_number: number | null }>;
    expect(rows[0].linked_pr_number).toBe(42);
  });

  it("returns correct ReconcileResult shape", async () => {
    const octokit = fakeOctokit();
    const issue = makeIssue({
      labels: [{ name: LIFECYCLE_LABEL.deployed, color: "", description: null }],
    });
    const linkedPRs = [makePR({ state: "open", merged: false })];
    const result = await reconcileIssueLifecycle(db, octokit, "owner", "repo", issue, linkedPRs);
    expect(result).toHaveProperty("labelsAdded");
    expect(result).toHaveProperty("labelsRemoved");
    expect(result).toHaveProperty("linkedPR");
    expect(Array.isArray(result.labelsAdded)).toBe(true);
    expect(Array.isArray(result.labelsRemoved)).toBe(true);
  });
});
