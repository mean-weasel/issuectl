import { execFile } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAgentMutationAdapters } from "./mutation-adapters.js";

const execFileMock = vi.mocked(execFile);

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

function mockExecFileSuccess(stdout = ""): void {
  execFileMock.mockImplementation((_cmd, _args, _opts, callback) => {
    callback?.(null, stdout, "");
    return {} as ReturnType<typeof execFile>;
  });
}

describe("defaultAgentMutationAdapters.push", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("uploads the verified local commit with git push and verifies the remote PR ref", async () => {
    execFileMock
      .mockImplementationOnce((_cmd, _args, _opts, callback) => {
        callback?.(null, "", "");
        return {} as ReturnType<typeof execFile>;
      })
      .mockImplementationOnce((_cmd, _args, _opts, callback) => {
        callback?.(null, "", "");
        return {} as ReturnType<typeof execFile>;
      })
      .mockImplementationOnce((_cmd, _args, _opts, callback) => {
        callback?.(null, "", "");
        return {} as ReturnType<typeof execFile>;
      })
      .mockImplementationOnce((_cmd, _args, _opts, callback) => {
        callback?.(null, "head-b\trefs/heads/feature/review\n", "");
        return {} as ReturnType<typeof execFile>;
      });

    await expect(defaultAgentMutationAdapters.push?.({
      owner: "acme",
      repo: "api",
      ref: "heads/feature/review",
      sha: "head-b",
      expectedHeadSha: "head-a",
      workspacePath: "/tmp/issuectl-pr-44",
    })).resolves.toBeUndefined();

    expect(execFileMock).toHaveBeenNthCalledWith(
      1,
      "git",
      ["cat-file", "-e", "head-b^{commit}"],
      { cwd: "/tmp/issuectl-pr-44", timeout: 10_000 },
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenNthCalledWith(
      2,
      "git",
      ["merge-base", "--is-ancestor", "head-a", "head-b"],
      { cwd: "/tmp/issuectl-pr-44", timeout: 10_000 },
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenNthCalledWith(
      3,
      "git",
      ["push", "origin", "head-b:refs/heads/feature/review"],
      { cwd: "/tmp/issuectl-pr-44", timeout: 60_000 },
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenNthCalledWith(
      4,
      "git",
      ["ls-remote", "origin", "refs/heads/feature/review"],
      { cwd: "/tmp/issuectl-pr-44", timeout: 30_000 },
      expect.any(Function),
    );
  });

  it("fails closed when remote verification does not match the pushed commit", async () => {
    mockExecFileSuccess("");
    execFileMock.mockImplementationOnce((_cmd, _args, _opts, callback) => {
      callback?.(null, "", "");
      return {} as ReturnType<typeof execFile>;
    });
    execFileMock.mockImplementationOnce((_cmd, _args, _opts, callback) => {
      callback?.(null, "", "");
      return {} as ReturnType<typeof execFile>;
    });
    execFileMock.mockImplementationOnce((_cmd, _args, _opts, callback) => {
      callback?.(null, "", "");
      return {} as ReturnType<typeof execFile>;
    });
    execFileMock.mockImplementationOnce((_cmd, _args, _opts, callback) => {
      callback?.(null, "head-c\trefs/heads/feature/review\n", "");
      return {} as ReturnType<typeof execFile>;
    });

    await expect(defaultAgentMutationAdapters.push?.({
      owner: "acme",
      repo: "api",
      ref: "heads/feature/review",
      sha: "head-b",
      expectedHeadSha: "head-a",
      workspacePath: "/tmp/issuectl-pr-44",
    })).rejects.toThrow("Remote PR head did not match pushed commit");
  });
});
