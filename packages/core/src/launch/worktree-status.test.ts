import { describe, it, expect, vi, beforeEach } from "vitest";

const { accessMock, execFileMock, rmMock, branchMocks } = vi.hoisted(() => {
  const accessMock = vi.fn();
  const execFileMock = vi.fn();
  const rmMock = vi.fn();
  const branchMocks = {
    isWorkingTreeClean: vi.fn(),
  };
  return { accessMock, execFileMock, rmMock, branchMocks };
});

vi.mock("node:fs/promises", () => ({
  access: accessMock,
  rm: rmMock,
}));

vi.mock("node:util", () => ({
  promisify: () => execFileMock,
}));

vi.mock("./branch.js", () => ({
  isWorkingTreeClean: branchMocks.isWorkingTreeClean,
}));

const { checkWorktreeStatus, resetWorktree } = await import("./worktree-status.js");

beforeEach(() => {
  accessMock.mockReset();
  execFileMock.mockReset();
  rmMock.mockReset().mockResolvedValue(undefined);
  branchMocks.isWorkingTreeClean.mockReset();
});

describe("checkWorktreeStatus", () => {
  it("returns exists: false when directory does not exist", async () => {
    accessMock.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = await checkWorktreeStatus("/worktrees", "myrepo", 42);
    expect(result).toEqual({ exists: false, dirty: false, path: "/worktrees/myrepo-issue-42" });
  });

  it("returns exists: true, dirty: false for a clean worktree", async () => {
    accessMock.mockResolvedValue(undefined);
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" });
    branchMocks.isWorkingTreeClean.mockResolvedValue(true);

    const result = await checkWorktreeStatus("/worktrees", "myrepo", 42);
    expect(result).toEqual({ exists: true, dirty: false, path: "/worktrees/myrepo-issue-42" });
  });

  it("returns exists: true, dirty: true for a dirty worktree", async () => {
    accessMock.mockResolvedValue(undefined);
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" });
    branchMocks.isWorkingTreeClean.mockResolvedValue(false);

    const result = await checkWorktreeStatus("/worktrees", "myrepo", 42);
    expect(result).toEqual({ exists: true, dirty: true, path: "/worktrees/myrepo-issue-42" });
  });

  it("returns exists: false when directory exists but is not a git repo", async () => {
    accessMock.mockResolvedValue(undefined);
    execFileMock.mockRejectedValue(new Error("not a git repository"));

    const result = await checkWorktreeStatus("/worktrees", "myrepo", 42);
    expect(result).toEqual({ exists: false, dirty: false, path: "/worktrees/myrepo-issue-42" });
  });
});

describe("resetWorktree", () => {
  it("removes the directory and prunes worktree references", async () => {
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" });

    await resetWorktree("/worktrees/myrepo-issue-42", "/repos/myrepo");
    expect(rmMock).toHaveBeenCalledWith("/worktrees/myrepo-issue-42", { recursive: true, force: true });
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["worktree", "prune"],
      expect.objectContaining({ cwd: "/repos/myrepo" }),
    );
  });

  it("throws when rm fails", async () => {
    rmMock.mockRejectedValue(new Error("EPERM"));

    await expect(resetWorktree("/worktrees/myrepo-issue-42", "/repos/myrepo"))
      .rejects.toThrow("EPERM");
  });

  it("does not throw when prune fails (non-fatal)", async () => {
    rmMock.mockResolvedValue(undefined);
    execFileMock.mockRejectedValue(new Error("git not found"));

    await expect(resetWorktree("/worktrees/myrepo-issue-42", "/repos/myrepo"))
      .resolves.toBeUndefined();
    expect(rmMock).toHaveBeenCalledWith("/worktrees/myrepo-issue-42", { recursive: true, force: true });
  });
});
