import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateBranchName } from "./branch.js";

/**
 * Mock strategy: the source does `const execFileAsync = promisify(execFile)`.
 * We mock `node:util` so that `promisify` returns our mock function,
 * giving us full control over what `execFileAsync` resolves to.
 */
const { execFileMock } = vi.hoisted(() => {
  const execFileMock = vi.fn();
  return { execFileMock };
});

vi.mock("node:util", () => ({
  promisify: () => execFileMock,
}));

/* Dynamic import so the mock is applied before the module initializes */
const {
  branchExists,
  createOrResetBranchAtRef,
  fetchRemoteRef,
  getCurrentBranch,
  getDefaultBranch,
  getHeadSha,
  getRemoteUrl,
  isWorkingTreeClean,
} = await import("./branch.js");

beforeEach(() => {
  execFileMock.mockReset();
});

async function withConsoleWarnSilenced<T>(fn: () => Promise<T>): Promise<T> {
  const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    return await fn();
  } finally {
    spy.mockRestore();
  }
}

/* ---------- generateBranchName (pure, no mock needed) ---------- */

describe("generateBranchName", () => {
  it("generates basic slug from title", () => {
    const name = generateBranchName("issue-{number}-{slug}", 42, "Add login page");
    expect(name).toBe("issue-42-add-login-page");
  });

  it("strips special characters", () => {
    const name = generateBranchName("issue-{number}-{slug}", 5, "Fix: the $100 bug!!!");
    expect(name).toBe("issue-5-fix-the-100-bug");
  });

  it("truncates long titles to 50 chars", () => {
    const longTitle = "a".repeat(100);
    const name = generateBranchName("issue-{number}-{slug}", 1, longTitle);
    const slug = name.replace("issue-1-", "");
    expect(slug.length).toBeLessThanOrEqual(50);
  });

  it("replaces {number} and {slug} pattern tokens", () => {
    const name = generateBranchName("feat/{number}/{slug}", 7, "New Feature");
    expect(name).toBe("feat/7/new-feature");
  });

  it("falls back to 'untitled' for empty title", () => {
    const name = generateBranchName("issue-{number}-{slug}", 1, "");
    expect(name).toBe("issue-1-untitled");
  });

  it("falls back to 'untitled' for title with only special chars", () => {
    const name = generateBranchName("issue-{number}-{slug}", 1, "!@#$%");
    expect(name).toBe("issue-1-untitled");
  });
});

/* ---------- branchExists ---------- */

describe("branchExists", () => {
  it("returns true when branch exists", async () => {
    execFileMock.mockResolvedValue({ stdout: "abc123\n", stderr: "" });
    const result = await branchExists("/repo", "main");
    expect(result).toBe(true);
  });

  it("returns false when branch does not exist", async () => {
    const err = new Error("fatal: not a valid ref");
    Object.assign(err, { stderr: "fatal: not a valid ref" });
    execFileMock.mockRejectedValue(err);
    const result = await branchExists("/repo", "nonexistent");
    expect(result).toBe(false);
  });

  it("rethrows when not a git repository", async () => {
    const err = new Error("not a git repository");
    Object.assign(err, { stderr: "fatal: not a git repository" });
    execFileMock.mockRejectedValue(err);
    await expect(branchExists("/notgit", "main")).rejects.toThrow();
  });
});

describe("PR head helpers", () => {
  it("fetches a remote ref", async () => {
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" });

    await fetchRemoteRef("/repo", "origin", "feature/review");

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["fetch", "origin", "feature/review"],
      { cwd: "/repo", timeout: 30_000 },
    );
  });

  it("checks out a local branch at an expected ref", async () => {
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" });

    await createOrResetBranchAtRef("/repo", "feature/review", "head-a");

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["checkout", "-B", "feature/review", "head-a"],
      { cwd: "/repo", timeout: 10_000 },
    );
  });

  it("reads current checkout metadata", async () => {
    execFileMock
      .mockResolvedValueOnce({ stdout: "feature/review\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "head-a\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "git@github.com:acme/api.git\n", stderr: "" });

    await expect(getCurrentBranch("/repo")).resolves.toBe("feature/review");
    await expect(getHeadSha("/repo")).resolves.toBe("head-a");
    await expect(getRemoteUrl("/repo")).resolves.toBe("git@github.com:acme/api.git");
  });
});

/* ---------- isWorkingTreeClean ---------- */

describe("isWorkingTreeClean", () => {
  it("returns true when working tree is clean", async () => {
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" });
    const result = await isWorkingTreeClean("/repo");
    expect(result).toBe(true);
  });

  it("returns false when working tree is dirty", async () => {
    execFileMock.mockResolvedValue({ stdout: " M src/file.ts\n", stderr: "" });
    const result = await isWorkingTreeClean("/repo");
    expect(result).toBe(false);
  });
});

/* ---------- getDefaultBranch ---------- */

describe("getDefaultBranch", () => {
  it("returns the remote HEAD branch", async () => {
    execFileMock.mockResolvedValue({ stdout: "origin/main\n", stderr: "" });
    const branch = await getDefaultBranch("/repo");
    expect(branch).toBe("origin/main");
  });

  it("falls back to origin/main when detection fails", async () => {
    const err = new Error("ref not found");
    Object.assign(err, { stderr: "fatal: ref not found" });
    execFileMock.mockRejectedValue(err);
    const branch = await withConsoleWarnSilenced(() => getDefaultBranch("/repo"));
    expect(branch).toBe("origin/main");
  });
});
