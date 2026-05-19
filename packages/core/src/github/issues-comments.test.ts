import { describe, it, expect } from "vitest";
import { getComments, addComment, updateComment, deleteComment } from "./issues.js";
import { RAW_COMMENT, makeOctokit } from "./issues-test-helpers.js";

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

/* ---------- updateComment ---------- */

describe("updateComment", () => {
  it("updates a comment and returns mapped result", async () => {
    const { octokit, updateComment: updateCommentMock } = makeOctokit();
    const updatedRaw = { ...RAW_COMMENT, body: "Updated body" };
    updateCommentMock.mockResolvedValue({ data: updatedRaw });

    const result = await updateComment(octokit, "owner", "repo", 100, "Updated body");
    expect(result.body).toBe("Updated body");
    expect(result.id).toBe(100);
    expect(result.user?.login).toBe("bob");
    expect(updateCommentMock).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      comment_id: 100,
      body: "Updated body",
    });
  });

  it("propagates API errors", async () => {
    const { octokit, updateComment: updateCommentMock } = makeOctokit();
    updateCommentMock.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );

    await expect(updateComment(octokit, "owner", "repo", 999, "body")).rejects.toThrow("Not Found");
  });
});

/* ---------- deleteComment ---------- */

describe("deleteComment", () => {
  it("deletes a comment", async () => {
    const { octokit, deleteComment: deleteCommentMock } = makeOctokit();
    deleteCommentMock.mockResolvedValue(undefined);

    await deleteComment(octokit, "owner", "repo", 100);
    expect(deleteCommentMock).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      comment_id: 100,
    });
  });

  it("propagates API errors", async () => {
    const { octokit, deleteComment: deleteCommentMock } = makeOctokit();
    deleteCommentMock.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );

    await expect(deleteComment(octokit, "owner", "repo", 999)).rejects.toThrow("Not Found");
  });
});
