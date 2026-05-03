import { describe, it, expect, vi, beforeEach } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import {
  derivePreviewStatus,
  getSessionPreviews,
  normalizeCapturedPane,
  resetSessionPreviewCache,
} from "./session-previews";
import type { ActiveDeploymentWithRepo } from "@issuectl/core";

function deployment(port: number | null = 7700, issueNumber = 42): ActiveDeploymentWithRepo {
  return {
    id: issueNumber,
    repoId: 1,
    issueNumber,
    agent: "codex",
    branchName: "issue-42-preview",
    workspaceMode: "worktree",
    workspacePath: "/tmp/worktree",
    linkedPrNumber: null,
    state: "active",
    launchedAt: "2026-05-03T00:00:00Z",
    endedAt: null,
    ttydPort: port,
    ttydPid: 123,
    idleSince: null,
    owner: "org",
    repoName: "api",
  };
}

describe("session-previews", () => {
  beforeEach(() => {
    resetSessionPreviewCache();
    execFileMock.mockReset();
  });

  it("normalizes captured pane text into the last non-empty preview lines", () => {
    const output = "one\r\n\u001b[31mtwo\u001b[0m\n\nthree   \n";
    expect(normalizeCapturedPane(output)).toEqual(["one", "two", "three"]);
  });

  it("strips OSC and single-character terminal escape sequences", () => {
    const output = "\u001b]0;issuectl terminal\u0007ready\u001b(B\n\u001b]2;tab title\u001b\\done\n";
    expect(normalizeCapturedPane(output)).toEqual(["ready", "done"]);
  });

  it("truncates very long preview lines", () => {
    const [line] = normalizeCapturedPane(`${"x".repeat(260)}\n`);
    expect(line).toHaveLength(240);
    expect(line.endsWith("...")).toBe(true);
  });

  it("marks recent changed output as active", () => {
    expect(derivePreviewStatus(["running tests"], 10_000, 12_000)).toBe("active");
  });

  it("marks old changed output as idle", () => {
    expect(derivePreviewStatus(["waiting"], 10_000, 45_000)).toBe("idle");
  });

  it("marks empty captured output as idle", () => {
    expect(derivePreviewStatus([], 10_000, 12_000)).toBe("idle");
  });

  it("marks error output as error", () => {
    expect(derivePreviewStatus(["Error: failed to build"], 10_000, 45_000)).toBe("error");
  });

  it("captures tmux panes for deployments with ports", async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, callback) => {
      callback(null, "pnpm test\npass\n", "");
    });

    const previews = await getSessionPreviews([deployment()], 1_000);

    expect(execFileMock).toHaveBeenCalledWith(
      "tmux",
      ["capture-pane", "-p", "-t", "issuectl-api-42", "-S", "-40"],
      { timeout: 750, maxBuffer: 64 * 1024 },
      expect.any(Function),
    );
    expect(previews["7700"]).toEqual({
      lines: ["pnpm test", "pass"],
      lastUpdatedMs: 1_000,
      lastChangedMs: 1_000,
      status: "active",
    });
  });

  it("returns unavailable when tmux capture fails without a cache entry", async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, callback) => {
      callback(new Error("missing session"));
    });

    await expect(getSessionPreviews([deployment()], 1_000)).resolves.toEqual({
      "7700": {
        lines: [],
        lastUpdatedMs: 1_000,
        lastChangedMs: null,
        status: "unavailable",
      },
    });
  });

  it("returns stale cached lines as unavailable when a later capture fails", async () => {
    execFileMock.mockImplementationOnce((_bin, _args, _opts, callback) => {
      callback(null, "first\n", "");
    });
    await getSessionPreviews([deployment()], 1_000);

    execFileMock.mockImplementationOnce((_bin, _args, _opts, callback) => {
      callback(new Error("timeout"));
    });

    await expect(getSessionPreviews([deployment()], 2_000)).resolves.toEqual({
      "7700": {
        lines: ["first"],
        lastUpdatedMs: 2_000,
        lastChangedMs: 1_000,
        status: "unavailable",
      },
    });
  });

  it("skips deployments without a ttyd port", async () => {
    const previews = await getSessionPreviews([deployment(null)], 1_000);
    expect(previews).toEqual({});
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("bounds concurrent tmux captures", async () => {
    let active = 0;
    let peakActive = 0;
    const callbacks: Array<() => void> = [];
    execFileMock.mockImplementation((_bin, _args, _opts, callback) => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      callbacks.push(() => {
        active -= 1;
        callback(null, "ready\n", "");
      });
    });

    const promise = getSessionPreviews(
      Array.from({ length: 10 }, (_, index) => deployment(7700 + index, 100 + index)),
      1_000,
    );
    await vi.waitFor(() => expect(execFileMock).toHaveBeenCalledTimes(6));
    expect(peakActive).toBe(6);

    while (callbacks.length > 0) {
      callbacks.shift()?.();
      await Promise.resolve();
    }

    const previews = await promise;
    expect(Object.keys(previews)).toHaveLength(10);
    expect(peakActive).toBe(6);
  });

  it("reuses a short-lived aggregate preview response cache", async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, callback) => {
      callback(null, "cached\n", "");
    });

    const first = await getSessionPreviews([deployment()], 1_000);
    const second = await getSessionPreviews([deployment()], 1_500);
    const third = await getSessionPreviews([deployment()], 2_100);

    expect(first).toEqual(second);
    expect(execFileMock).toHaveBeenCalledTimes(2);
    expect(third["7700"].lastUpdatedMs).toBe(2_100);
  });

  it("coalesces simultaneous aggregate preview requests while capture is in flight", async () => {
    const callbacks: Array<() => void> = [];
    execFileMock.mockImplementation((_bin, _args, _opts, callback) => {
      callbacks.push(() => callback(null, "in flight\n", ""));
    });

    const first = getSessionPreviews([deployment()], 1_000);
    const second = getSessionPreviews([deployment()], 1_000);

    await vi.waitFor(() => expect(execFileMock).toHaveBeenCalledTimes(1));
    callbacks.shift()?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        "7700": {
          lines: ["in flight"],
          lastUpdatedMs: 1_000,
          lastChangedMs: 1_000,
          status: "active",
        },
      },
      {
        "7700": {
          lines: ["in flight"],
          lastUpdatedMs: 1_000,
          lastChangedMs: 1_000,
          status: "active",
        },
      },
    ]);
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it("does not reuse the aggregate cache when a port is reused by another session", async () => {
    execFileMock
      .mockImplementationOnce((_bin, _args, _opts, callback) => {
        callback(null, "first session\n", "");
      })
      .mockImplementationOnce((_bin, _args, _opts, callback) => {
        callback(null, "second session\n", "");
      });

    const first = await getSessionPreviews([deployment(7700, 42)], 1_000);
    const second = await getSessionPreviews([deployment(7700, 43)], 1_500);

    expect(first["7700"].lines).toEqual(["first session"]);
    expect(second["7700"].lines).toEqual(["second session"]);
    expect(execFileMock).toHaveBeenCalledTimes(2);
  });

  it("does not return stale per-port cached lines when a reused port capture fails", async () => {
    execFileMock
      .mockImplementationOnce((_bin, _args, _opts, callback) => {
        callback(null, "old session\n", "");
      })
      .mockImplementationOnce((_bin, _args, _opts, callback) => {
        callback(new Error("new session not ready"));
      });

    await getSessionPreviews([deployment(7700, 42)], 1_000);
    const second = await getSessionPreviews([deployment(7700, 43)], 1_500);

    expect(second["7700"]).toEqual({
      lines: [],
      lastUpdatedMs: 1_500,
      lastChangedMs: null,
      status: "unavailable",
    });
  });
});
