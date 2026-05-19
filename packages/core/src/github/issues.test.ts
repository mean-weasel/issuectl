import { describe, it, expect } from "vitest";
import { listIssues, getIssue, createIssue, updateIssue, closeIssue, reopenIssue } from "./issues.js";
import { RAW_ISSUE, makeOctokit } from "./issues-test-helpers.js";

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

/* ---------- reopenIssue ---------- */

describe("reopenIssue", () => {
  it("reopens an issue by setting state to open", async () => {
    const { octokit, update } = makeOctokit();
    update.mockResolvedValue({ data: { ...RAW_ISSUE, state: "open" } });

    await reopenIssue(octokit, "owner", "repo", 1);
    expect(update).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 1,
      state: "open",
    });
  });

  it("propagates 404 errors", async () => {
    const { octokit, update } = makeOctokit();
    update.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );

    await expect(reopenIssue(octokit, "owner", "repo", 999)).rejects.toThrow("Not Found");
  });
});
