import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  withConsoleErrorSilenced,
  withConsoleWarnSilenced,
} from "../test-utils/console.js";

// vi.mock is hoisted, so we cannot reference a const declared above it.
// Use vi.hoisted() to create spies before hoisting occurs, then reference them.
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

// Spy factories — created via vi.hoisted() so they are available inside
// vi.mock() factory functions (which are also hoisted).
const getDb = vi.hoisted(() => vi.fn());
const getDeploymentById = vi.hoisted(() => vi.fn());
const getRepo = vi.hoisted(() => vi.fn());
const getRepoById = vi.hoisted(() => vi.fn());
const getSetting = vi.hoisted(() => vi.fn());
const killTtyd = vi.hoisted(() => vi.fn());
const coreEndDeployment = vi.hoisted(() => vi.fn());
const cleanupStaleContextFiles = vi.hoisted(() => vi.fn());
const isTmuxSessionAlive = vi.hoisted(() => vi.fn());
const executeLaunch = vi.hoisted(() => vi.fn());
const withAuthRetry = vi.hoisted(() => vi.fn());
const withIdempotency = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getDeploymentById: (...args: unknown[]) => getDeploymentById(...args),
  getRepo: (...args: unknown[]) => getRepo(...args),
  getRepoById: (...args: unknown[]) => getRepoById(...args),
  getSetting: (...args: unknown[]) => getSetting(...args),
  killTtyd: (...args: unknown[]) => killTtyd(...args),
  endDeployment: (...args: unknown[]) => coreEndDeployment(...args),
  cleanupStaleContextFiles: (...args: unknown[]) => cleanupStaleContextFiles(...args),
  tmuxSessionName: (repo: string, issueNumber: number) =>
    `issuectl-${repo}-${issueNumber}`,
  isTmuxSessionAlive: (...args: unknown[]) => isTmuxSessionAlive(...args),
  executeLaunch: (...args: unknown[]) => executeLaunch(...args),
  withAuthRetry: (...args: unknown[]) => withAuthRetry(...args),
  withIdempotency: (...args: unknown[]) => withIdempotency(...args),
  DuplicateInFlightError: class DuplicateInFlightError extends Error {},
  formatErrorForUser: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

// Import AFTER mocks so the mocked module is in place.
import { endSession, checkSessionAlive, launchIssue } from "./launch.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal Deployment-shaped object with a non-null ttydPid. */
function makeDeployment(ttydPid: number | null = 42) {
  return {
    id: 1,
    repoId: 1,
    issueNumber: 7,
    agent: "claude" as const,
    branchName: "feat/x",
    workspaceMode: "worktree" as const,
    workspacePath: "/tmp/x",
    linkedPrNumber: null,
    state: "active" as const,
    launchedAt: new Date().toISOString(),
    endedAt: null,
    ttydPort: null,
    ttydPid,
  };
}

function makeRepoRecord() {
  return { id: 1, owner: "owner", name: "repo", localPath: "/tmp/repo" };
}

const ARGS = [1, "owner", "repo", 7] as const;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let dbRunSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  revalidatePath.mockReset();
  getDb.mockReset();
  getDeploymentById.mockReset();
  getRepo.mockReset();
  getRepoById.mockReset();
  getSetting.mockReset();
  killTtyd.mockReset();
  coreEndDeployment.mockReset();
  cleanupStaleContextFiles.mockReset();

  isTmuxSessionAlive.mockReset();
  executeLaunch.mockReset();
  withAuthRetry.mockReset();
  withIdempotency.mockReset();

  // Sensible defaults: DB exists, deployment found with a PID, repo found.
  dbRunSpy = vi.fn();
  getDb.mockReturnValue({
    prepare: vi.fn(() => ({
      get: vi.fn(() => ({ name: "repo" })),
      run: dbRunSpy,
    })),
  });
  getDeploymentById.mockReturnValue(makeDeployment(42));
  getRepo.mockReturnValue(makeRepoRecord());
  getRepoById.mockReturnValue(makeRepoRecord());
  getSetting.mockReturnValue("test-api-token");
  coreEndDeployment.mockReturnValue(undefined);
  cleanupStaleContextFiles.mockReturnValue(Promise.resolve());
  executeLaunch.mockResolvedValue({ deploymentId: 123, labelWarning: null });
  withAuthRetry.mockImplementation((fn) => fn({}));
  withIdempotency.mockImplementation((_db, _action, _key, fn) => fn());
});

describe("launchIssue", () => {
  const baseLaunchInput = {
    owner: "owner",
    repo: "repo",
    issueNumber: 7,
    branchName: "issue-7",
    workspaceMode: "worktree" as const,
    selectedCommentIndices: [0],
    selectedFilePaths: ["src/main.ts"],
  };

  it("passes the selected codex agent to executeLaunch", async () => {
    const result = await launchIssue({
      ...baseLaunchInput,
      agent: "codex",
    });

    expect(result).toMatchObject({ success: true, deploymentId: 123 });
    expect(executeLaunch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        agent: "codex",
        owner: "owner",
        repo: "repo",
        issueNumber: 7,
      }),
    );
  });

  it("rejects an invalid launch agent before starting launch", async () => {
    const result = await launchIssue({
      ...baseLaunchInput,
      agent: "cursor" as never,
    });

    expect(result).toMatchObject({
      success: false,
      error: "Invalid launch agent",
    });
    expect(executeLaunch).not.toHaveBeenCalled();
  });

  it("leaves agent undefined when omitted so core can use the saved default", async () => {
    await launchIssue(baseLaunchInput);

    expect(executeLaunch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        agent: undefined,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("endSession", () => {
  it("kills ttyd before ending deployment", async () => {
    const result = await withConsoleWarnSilenced(() => endSession(...ARGS));

    expect(killTtyd).toHaveBeenCalledWith(42, "issuectl-repo-7");
    expect(coreEndDeployment).toHaveBeenCalled();
    expect(result).toMatchObject({ success: true });
  });

  it("succeeds even when killTtyd throws", async () => {
    killTtyd.mockImplementation(() => {
      throw Object.assign(new Error("Operation not permitted"), { code: "EPERM" });
    });

    const result = await withConsoleWarnSilenced(() => endSession(...ARGS));

    // Kill failure must not prevent the DB update.
    expect(coreEndDeployment).toHaveBeenCalled();
    expect(result).toMatchObject({ success: true });
  });

  it("skips kill when deployment has no ttydPid", async () => {
    getDeploymentById.mockReturnValue(makeDeployment(null));

    const result = await endSession(...ARGS);

    expect(killTtyd).not.toHaveBeenCalled();
    expect(coreEndDeployment).toHaveBeenCalled();
    expect(result).toMatchObject({ success: true });
  });

  it("handles missing deployment gracefully", async () => {
    getDeploymentById.mockReturnValue(undefined);

    const result = await endSession(...ARGS);

    // Deployment not found returns early — no kill or end attempted.
    expect(killTtyd).not.toHaveBeenCalled();
    expect(coreEndDeployment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, error: "Deployment not found" });
  });

  it("rejects when deployment does not match the specified issue", async () => {
    // Deployment belongs to a different repo.
    getRepo.mockReturnValue({ id: 99, owner: "owner", name: "repo", localPath: "/tmp/repo" });

    const result = await endSession(...ARGS);

    expect(killTtyd).not.toHaveBeenCalled();
    expect(coreEndDeployment).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      error: "Deployment does not match the specified issue",
    });
  });
});

describe("checkSessionAlive", () => {
  it("returns alive when tmux session exists (even if ttyd is dead)", async () => {
    isTmuxSessionAlive.mockReturnValue(true);

    const result = await withConsoleErrorSilenced(() => checkSessionAlive(1));

    expect(result).toEqual({ alive: true });
    expect(coreEndDeployment).not.toHaveBeenCalled();
  });

  it("ends deployment and returns not alive when tmux session is gone", async () => {
    isTmuxSessionAlive.mockReturnValue(false);

    const result = await withConsoleErrorSilenced(() => checkSessionAlive(1));

    expect(result).toEqual({ alive: false });
    expect(coreEndDeployment).toHaveBeenCalled();
  });

  it("returns not alive when deployment is already ended", async () => {
    getDeploymentById.mockReturnValue({ ...makeDeployment(42), endedAt: "2026-01-01" });

    const result = await withConsoleErrorSilenced(() => checkSessionAlive(1));

    expect(result).toEqual({ alive: false });
    expect(isTmuxSessionAlive).not.toHaveBeenCalled();
  });

  it("returns not alive when deployment does not exist", async () => {
    getDeploymentById.mockReturnValue(undefined);

    const result = await checkSessionAlive(1);

    expect(result).toEqual({ alive: false });
  });

  it("returns not alive when repo is not found", async () => {
    getRepoById.mockReturnValue(undefined);

    const result = await checkSessionAlive(1);

    expect(result).toEqual({ alive: false });
    expect(isTmuxSessionAlive).not.toHaveBeenCalled();
    expect(coreEndDeployment).not.toHaveBeenCalled();
  });

  it("returns error when health check throws", async () => {
    getDeploymentById.mockImplementation(() => {
      throw new Error("DB locked");
    });

    const result = await withConsoleErrorSilenced(() => checkSessionAlive(1));

    expect(result).toEqual({ alive: false, error: "Health check failed" });
  });
});
