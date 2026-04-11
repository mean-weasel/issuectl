import { describe, it, expect, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import {
  listIssues,
  getIssue,
  createIssue,
  updateIssue,
  closeIssue,
  getComments,
  addComment,
} from "./issues.js";

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
