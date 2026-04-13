import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mock child_process and fs so prepareWorkspace never hits the real filesystem.
 * Also mock ./branch.js helpers which are called by the workspace functions.
 */
const { execFileMock, accessMock, mkdirMock, rmMock, branchMocks } = vi.hoisted(() => {
  const execFileMock = vi.fn();
  const accessMock = vi.fn();
  const mkdirMock = vi.fn();
  const rmMock = vi.fn();
  const branchMocks = {
    createOrCheckoutBranch: vi.fn(),
    isWorkingTreeClean: vi.fn(),
    getDefaultBranch: vi.fn(),
  };
  return { execFileMock, accessMock, mkdirMock, rmMock, branchMocks };
});

vi.mock("node:util", () => ({
  promisify: () => execFileMock,
}));

vi.mock("node:fs/promises", () => ({
  access: accessMock,
  mkdir: mkdirMock,
  rm: rmMock,
}));

vi.mock("./branch.js", () => ({
  createOrCheckoutBranch: branchMocks.createOrCheckoutBranch,
  isWorkingTreeClean: branchMocks.isWorkingTreeClean,
  getDefaultBranch: branchMocks.getDefaultBranch,
}));

const { prepareWorkspace } = await import("./workspace.js");

beforeEach(() => {
  execFileMock.mockReset();
  accessMock.mockReset();
  mkdirMock.mockResolvedValue(undefined);
  rmMock.mockResolvedValue(undefined);
  branchMocks.createOrCheckoutBranch.mockReset().mockResolvedValue(undefined);
  branchMocks.isWorkingTreeClean.mockReset().mockResolvedValue(true);
  branchMocks.getDefaultBranch.mockReset().mockResolvedValue("origin/main");
});

const BASE_OPTIONS = {
  repoPath: "/repos/myrepo",
  owner: "owner",
  repo: "myrepo",
  branchName: "issue-1-fix-bug",
  issueNumber: 1,
  worktreeDir: "/tmp/worktrees",
};

/* ---------- existing mode ---------- */

describe("prepareWorkspace — existing mode", () => {
  it("checks out branch in existing repo and returns correct shape", async () => {
    // Mock fetch (git fetch origin) to succeed
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" });

    const result = await prepareWorkspace({ ...BASE_OPTIONS, mode: "existing" });
    expect(result.path).toBe("/repos/myrepo");
    expect(result.mode).toBe("existing");
    expect(result.created).toBe(false);
    expect(branchMocks.createOrCheckoutBranch).toHaveBeenCalledWith(
      "/repos/myrepo",
      "issue-1-fix-bug",
      "origin/main",
    );
  });

  it("throws when working tree is dirty", async () => {
    branchMocks.isWorkingTreeClean.mockResolvedValue(false);
    await expect(
      prepareWorkspace({ ...BASE_OPTIONS, mode: "existing" }),
    ).rejects.toThrow("uncommitted changes");
  });
});

/* ---------- worktree mode ---------- */

describe("prepareWorkspace — worktree mode", () => {
  it("creates a new worktree and returns correct shape", async () => {
    // pathExists → false (access rejects)
    accessMock.mockRejectedValue(new Error("ENOENT"));
    // git worktree add succeeds
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" });

    const result = await prepareWorkspace({ ...BASE_OPTIONS, mode: "worktree" });
    expect(result.path).toBe("/tmp/worktrees/myrepo-issue-1");
    expect(result.mode).toBe("worktree");
    expect(result.created).toBe(true);
    expect(mkdirMock).toHaveBeenCalledWith("/tmp/worktrees", { recursive: true });
  });

  it("reuses existing worktree directory if it is a git repo", async () => {
    // pathExists → true
    accessMock.mockResolvedValue(undefined);
    // isGitRepo check (git rev-parse --git-dir) → success
    execFileMock.mockResolvedValue({ stdout: ".git\n", stderr: "" });

    const result = await prepareWorkspace({ ...BASE_OPTIONS, mode: "worktree" });
    expect(result.path).toBe("/tmp/worktrees/myrepo-issue-1");
    expect(result.created).toBe(false);
    expect(branchMocks.createOrCheckoutBranch).toHaveBeenCalled();
  });

  it("refuses to reuse a dirty existing worktree", async () => {
    // The previous launch left uncommitted work in the reused dir; the
    // existing path silently switched branches and lost it. Now we
    // refuse loudly and the user must commit/stash before relaunching.
    accessMock.mockResolvedValue(undefined);
    execFileMock.mockResolvedValue({ stdout: ".git\n", stderr: "" });
    branchMocks.isWorkingTreeClean.mockResolvedValue(false);

    await expect(
      prepareWorkspace({ ...BASE_OPTIONS, mode: "worktree" }),
    ).rejects.toThrow(/uncommitted changes/);
    expect(branchMocks.createOrCheckoutBranch).not.toHaveBeenCalled();
  });
});

/* ---------- clone mode ---------- */

describe("prepareWorkspace — clone mode", () => {
  it("clones the repo and returns correct shape", async () => {
    // pathExists → false
    accessMock.mockRejectedValue(new Error("ENOENT"));
    // clone and checkout both succeed
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" });

    const result = await prepareWorkspace({ ...BASE_OPTIONS, mode: "clone" });
    expect(result.path).toBe("/tmp/worktrees/myrepo-issue-1");
    expect(result.mode).toBe("clone");
    expect(result.created).toBe(true);
  });

  it("propagates clone errors after cleanup", async () => {
    accessMock.mockRejectedValue(new Error("ENOENT"));
    execFileMock.mockRejectedValue(new Error("clone failed"));

    await expect(
      prepareWorkspace({ ...BASE_OPTIONS, mode: "clone" }),
    ).rejects.toThrow("clone failed");
    expect(rmMock).toHaveBeenCalled();
  });
});
