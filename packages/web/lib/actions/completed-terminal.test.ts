import { describe, expect, it, beforeEach, vi } from "vitest";

const execFileSync = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFileSync }));

const getDb = vi.hoisted(() => vi.fn());
const getDeploymentById = vi.hoisted(() => vi.fn());
const getRepo = vi.hoisted(() => vi.fn());
const isTmuxSessionAlive = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getDeploymentById: (...args: unknown[]) => getDeploymentById(...args),
  getRepo: (...args: unknown[]) => getRepo(...args),
  isTmuxSessionAlive: (...args: unknown[]) => isTmuxSessionAlive(...args),
  tmuxSessionName: (repo: string, targetNumber: number, targetType = "issue") =>
    targetType === "issue"
      ? `issuectl-${repo}-${targetNumber}`
      : `issuectl-${repo}-${targetType}-${targetNumber}`,
  formatErrorForUser: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

import { getCompletedSessionTranscript } from "./completed-terminal";

beforeEach(() => {
  execFileSync.mockReset();
  getDb.mockReset();
  getDeploymentById.mockReset();
  getRepo.mockReset();
  isTmuxSessionAlive.mockReset();

  getDb.mockReturnValue({});
  getDeploymentById.mockReturnValue(deployment({ endedAt: "2026-05-28T11:10:05.000Z" }));
  getRepo.mockReturnValue({ id: 1, owner: "owner", name: "repo" });
  isTmuxSessionAlive.mockReturnValue(true);
  execFileSync.mockReturnValue("terminal output\n");
});

describe("getCompletedSessionTranscript", () => {
  it("captures a read-only transcript for ended deployments with retained tmux sessions", async () => {
    execFileSync.mockReturnValue("done through issuectl agent complete\n");

    const result = await getCompletedSessionTranscript(input());

    expect(result).toEqual({
      success: true,
      sessionName: "issuectl-repo-7",
      transcript: "done through issuectl agent complete",
    });
    expect(execFileSync).toHaveBeenCalledWith(
      "tmux",
      ["capture-pane", "-p", "-t", "issuectl-repo-7", "-S", "-240"],
      { encoding: "utf8", maxBuffer: 512 * 1024 },
    );
  });

  it("reports completed transcript unavailable when tmux session is gone", async () => {
    isTmuxSessionAlive.mockReturnValue(false);

    const result = await getCompletedSessionTranscript(input());

    expect(result).toMatchObject({
      success: false,
      unavailable: true,
      error: "Completed terminal is no longer available on this machine.",
    });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("does not capture active sessions through the completed transcript path", async () => {
    getDeploymentById.mockReturnValue(deployment({ endedAt: null }));

    const result = await getCompletedSessionTranscript(input());

    expect(result).toMatchObject({
      success: false,
      error: "Session is still active. Open the live terminal instead.",
    });
    expect(execFileSync).not.toHaveBeenCalled();
  });
});

function input() {
  return {
    deploymentId: 1,
    owner: "owner",
    repo: "repo",
    targetType: "issue" as const,
    targetNumber: 7,
  };
}

function deployment(overrides: { endedAt: string | null }) {
  return {
    id: 1,
    repoId: 1,
    issueNumber: 7,
    targetType: "issue" as const,
    targetNumber: 7,
    branchName: "issue-7",
    endedAt: overrides.endedAt,
  };
}
