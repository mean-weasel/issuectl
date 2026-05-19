import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { reassignIssue } from "./issues.js";
import { createTestDb } from "../db/test-helpers.js";
import { addRepo } from "../db/repos.js";
import { setPriority, getPriority } from "../db/priority.js";
import { setCached, getCached } from "../db/cache.js";
import { RAW_ISSUE, RAW_COMMENT, makeOctokit } from "./issues-test-helpers.js";

describe("reassignIssue", () => {
  let db: Database.Database;
  let oldRepoId: number;
  let newRepoId: number;

  const RAW_NEW_ISSUE = {
    ...RAW_ISSUE,
    number: 42,
    html_url: "https://github.com/other-owner/other-repo/issues/42",
  };

  function makeReassignOctokit() {
    const kit = makeOctokit();
    // getIssue — fetch old issue
    kit.get.mockResolvedValue({ data: RAW_ISSUE });
    // createIssue — create on new repo
    kit.create.mockResolvedValue({ data: RAW_NEW_ISSUE });
    // addComment — cross-reference
    kit.createComment.mockResolvedValue({ data: RAW_COMMENT });
    // closeIssue — close old
    kit.update.mockResolvedValue({ data: { ...RAW_ISSUE, state: "closed" } });
    return kit;
  }

  beforeEach(() => {
    db = createTestDb();
    const oldRepo = addRepo(db, { owner: "owner", name: "repo" });
    const newRepo = addRepo(db, { owner: "other-owner", name: "other-repo" });
    oldRepoId = oldRepo.id;
    newRepoId = newRepo.id;
  });

  it("happy path: creates new issue, comments, closes old, returns result without cleanupWarning", async () => {
    const { octokit, create, createComment, update } = makeReassignOctokit();

    const result = await reassignIssue(db, octokit, oldRepoId, 1, newRepoId);

    // Verify new issue created on target repo with correct title/body
    expect(create).toHaveBeenCalledWith({
      owner: "other-owner",
      repo: "other-repo",
      title: "Bug report",
      body: "Something is broken",
      labels: undefined,
    });

    // Verify cross-reference comment added to old issue
    expect(createComment).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 1,
      body: "Moved to other-owner/other-repo#42",
    });

    // Verify old issue closed
    expect(update).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 1,
      state: "closed",
    });

    // Verify return value
    expect(result).toEqual({
      newIssueNumber: 42,
      newIssueUrl: "https://github.com/other-owner/other-repo/issues/42",
      newOwner: "other-owner",
      newRepo: "other-repo",
    });
    expect(result.cleanupWarning).toBeUndefined();
  });

  it("throws when old and new repo IDs are the same", async () => {
    const { octokit } = makeReassignOctokit();

    await expect(
      reassignIssue(db, octokit, oldRepoId, 1, oldRepoId),
    ).rejects.toThrow("Cannot re-assign an issue to the same repo");
  });

  it("throws when old repo ID does not exist in DB", async () => {
    const { octokit } = makeReassignOctokit();

    await expect(
      reassignIssue(db, octokit, 9999, 1, newRepoId),
    ).rejects.toThrow("Old repo (id 9999) not found");
  });

  it("throws when new repo ID does not exist in DB", async () => {
    const { octokit } = makeReassignOctokit();

    await expect(
      reassignIssue(db, octokit, oldRepoId, 1, 9999),
    ).rejects.toThrow("New repo (id 9999) not found");
  });

  it("returns result with cleanupWarning when closeIssue fails after create succeeds", async () => {
    const { octokit, update } = makeReassignOctokit();

    // addComment succeeds (uses createComment), but closeIssue (uses update) fails.
    update.mockRejectedValue(new Error("API rate limit exceeded"));

    const result = await reassignIssue(db, octokit, oldRepoId, 1, newRepoId);

    // Should NOT throw
    expect(result.newIssueNumber).toBe(42);
    expect(result.newIssueUrl).toBe("https://github.com/other-owner/other-repo/issues/42");
    expect(result.cleanupWarning).toContain("could not be closed");
    expect(result.cleanupWarning).toContain("API rate limit exceeded");
  });

  it("returns result with cleanupWarning when addComment fails after create succeeds", async () => {
    const { octokit, createComment } = makeReassignOctokit();

    createComment.mockRejectedValue(new Error("Forbidden"));

    const result = await reassignIssue(db, octokit, oldRepoId, 1, newRepoId);

    expect(result.newIssueNumber).toBe(42);
    expect(result.cleanupWarning).toContain("could not be closed");
    expect(result.cleanupWarning).toContain("Forbidden");
  });

  it("migrates priority from old repo/issue to new repo/issue", async () => {
    const { octokit } = makeReassignOctokit();

    // Seed a priority on the old repo/issue
    setPriority(db, oldRepoId, 1, "high");

    await reassignIssue(db, octokit, oldRepoId, 1, newRepoId);

    // New repo/issue should have the priority
    expect(getPriority(db, newRepoId, 42)).toBe("high");
    // Old repo/issue priority should be deleted (returns default "normal")
    expect(getPriority(db, oldRepoId, 1)).toBe("normal");
  });

  it("clears all 5 cache keys after reassignment", async () => {
    const { octokit } = makeReassignOctokit();

    // Seed cache entries for all 5 keys that reassignIssue should clear
    const cacheKeys = [
      "issues:owner/repo",
      "issue-detail:owner/repo#1",
      "issue-header:owner/repo#1",
      "issue-content:owner/repo#1",
      "issues:other-owner/other-repo",
    ];
    for (const key of cacheKeys) {
      setCached(db, key, { placeholder: true });
    }

    // Verify they exist before
    for (const key of cacheKeys) {
      expect(getCached(db, key)).not.toBeNull();
    }

    await reassignIssue(db, octokit, oldRepoId, 1, newRepoId);

    // All 5 cache keys should be cleared
    for (const key of cacheKeys) {
      expect(getCached(db, key)).toBeNull();
    }
  });
});
