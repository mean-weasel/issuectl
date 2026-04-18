import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";
import type Database from "better-sqlite3";
import {
  listIssues,
  getIssue,
  createIssue,
  updateIssue,
  closeIssue,
  getComments,
  addComment,
  reassignIssue,
} from "./issues.js";
import { createTestDb } from "../db/test-helpers.js";
import { addRepo } from "../db/repos.js";
import { setPriority, getPriority } from "../db/priority.js";
import { setCached, getCached } from "../db/cache.js";

/* ---------- helpers ---------- */

const RAW_ISSUE = {
  number: 1,
  title: "Bug report",
  body: "Something is broken",
  state: "open",
  labels: [{ name: "bug", color: "d73a4a", description: "Bug label" }],
  user: { login: "alice", avatar_url: "https://avatar.test/alice" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  closed_at: null,
  html_url: "https://github.com/owner/repo/issues/1",
};

const RAW_COMMENT = {
  id: 100,
  body: "A comment",
  user: { login: "bob", avatar_url: "https://avatar.test/bob" },
  created_at: "2026-01-03T00:00:00Z",
  updated_at: "2026-01-03T00:00:00Z",
  html_url: "https://github.com/owner/repo/issues/1#issuecomment-100",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = ReturnType<typeof vi.fn<(...args: any[]) => any>>;

function makeOctokit() {
  const paginate = vi.fn() as MockFn;
  const get = vi.fn() as MockFn;
  const create = vi.fn() as MockFn;
  const update = vi.fn() as MockFn;
  const listComments = vi.fn() as MockFn;
  const createComment = vi.fn() as MockFn;
  const listForRepo = vi.fn() as MockFn;

  const octokit = {
    paginate,
    rest: {
      issues: { listForRepo, get, create, update, listComments, createComment },
    },
  } as unknown as Octokit;

  return { octokit, paginate, get, create, update, listComments, createComment, listForRepo };
}

/* ---------- listIssues ---------- */

describe("listIssues", () => {
  it("returns mapped issues and filters out pull requests", async () => {
    const { octokit, paginate } = makeOctokit();
    const prItem = { ...RAW_ISSUE, number: 2, pull_request: { url: "..." } };
    paginate.mockResolvedValue([RAW_ISSUE, prItem]);

    const issues = await listIssues(octokit, "owner", "repo");
    expect(issues).toHaveLength(1);
    expect(issues[0].number).toBe(1);
    expect(issues[0].title).toBe("Bug report");
    expect(issues[0].createdAt).toBe("2026-01-01T00:00:00Z");
    expect(issues[0].user?.login).toBe("alice");
    expect(issues[0].user?.avatarUrl).toBe("https://avatar.test/alice");
  });

  it("passes state parameter to paginate", async () => {
    const { octokit, paginate } = makeOctokit();
    paginate.mockResolvedValue([]);

    await listIssues(octokit, "owner", "repo", "closed");
    expect(paginate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ state: "closed" }),
    );
  });
});

/* ---------- getIssue ---------- */

describe("getIssue", () => {
  it("fetches a single issue and maps it", async () => {
    const { octokit, get } = makeOctokit();
    get.mockResolvedValue({ data: RAW_ISSUE });

    const issue = await getIssue(octokit, "owner", "repo", 1);
    expect(issue.number).toBe(1);
    expect(issue.body).toBe("Something is broken");
    expect(get).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 1,
    });
  });

  it("propagates API errors", async () => {
    const { octokit, get } = makeOctokit();
    get.mockRejectedValue(new Error("Not Found"));

    await expect(getIssue(octokit, "owner", "repo", 999)).rejects.toThrow("Not Found");
  });
});

/* ---------- createIssue ---------- */

describe("createIssue", () => {
  it("creates an issue and returns mapped result", async () => {
    const { octokit, create } = makeOctokit();
    create.mockResolvedValue({ data: RAW_ISSUE });

    const result = await createIssue(octokit, "owner", "repo", {
      title: "Bug report",
      body: "Something is broken",
    });
    expect(result.title).toBe("Bug report");
    expect(create).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      title: "Bug report",
      body: "Something is broken",
      labels: undefined,
    });
  });

  it("passes labels when provided", async () => {
    const { octokit, create } = makeOctokit();
    create.mockResolvedValue({ data: RAW_ISSUE });

    await createIssue(octokit, "owner", "repo", {
      title: "Bug",
      labels: ["bug", "urgent"],
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["bug", "urgent"] }),
    );
  });

  it("propagates API errors on create", async () => {
    const { octokit, create } = makeOctokit();
    create.mockRejectedValue(new Error("Validation Failed"));

    await expect(
      createIssue(octokit, "owner", "repo", { title: "" }),
    ).rejects.toThrow("Validation Failed");
  });
});

/* ---------- updateIssue ---------- */

describe("updateIssue", () => {
  it("updates title and body", async () => {
    const { octokit, update } = makeOctokit();
    const updated = { ...RAW_ISSUE, title: "Updated title" };
    update.mockResolvedValue({ data: updated });

    const result = await updateIssue(octokit, "owner", "repo", 1, {
      title: "Updated title",
      body: "new body",
    });
    expect(result.title).toBe("Updated title");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 1,
        title: "Updated title",
        body: "new body",
      }),
    );
  });

  it("supports partial update (only title)", async () => {
    const { octokit, update } = makeOctokit();
    update.mockResolvedValue({ data: RAW_ISSUE });

    await updateIssue(octokit, "owner", "repo", 1, { title: "Just title" });
    const call = update.mock.calls[0][0] as Record<string, unknown>;
    expect(call.title).toBe("Just title");
    expect(call.body).toBeUndefined();
  });
});

/* ---------- closeIssue ---------- */

describe("closeIssue", () => {
  it("closes an issue by setting state to closed", async () => {
    const { octokit, update } = makeOctokit();
    update.mockResolvedValue({ data: { ...RAW_ISSUE, state: "closed" } });

    await closeIssue(octokit, "owner", "repo", 1);
    expect(update).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 1,
      state: "closed",
    });
  });

  it("propagates 404 errors", async () => {
    const { octokit, update } = makeOctokit();
    update.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );

    await expect(closeIssue(octokit, "owner", "repo", 999)).rejects.toThrow("Not Found");
  });
});

/* ---------- getComments / addComment ---------- */

describe("getComments", () => {
  it("returns mapped comments", async () => {
    const { octokit, paginate } = makeOctokit();
    paginate.mockResolvedValue([RAW_COMMENT]);

    const comments = await getComments(octokit, "owner", "repo", 1);
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe(100);
    expect(comments[0].body).toBe("A comment");
    expect(comments[0].user?.login).toBe("bob");
  });
});

describe("addComment", () => {
  it("creates a comment and returns mapped result", async () => {
    const { octokit, createComment } = makeOctokit();
    createComment.mockResolvedValue({ data: RAW_COMMENT });

    const result = await addComment(octokit, "owner", "repo", 1, "A comment");
    expect(result.body).toBe("A comment");
    expect(createComment).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 1,
      body: "A comment",
    });
  });
});

/* ---------- reassignIssue ---------- */

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
