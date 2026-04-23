import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.mock is hoisted, so we cannot reference a const declared above it.
// Use vi.hoisted() to create spies before hoisting occurs, then reference them.
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

// Spy factories — created via vi.hoisted() so they are available inside
// vi.mock() factory functions (which are also hoisted).
const getDb = vi.hoisted(() => vi.fn());
const getDeploymentById = vi.hoisted(() => vi.fn());
const getRepo = vi.hoisted(() => vi.fn());
const killTtyd = vi.hoisted(() => vi.fn());
const coreEndDeployment = vi.hoisted(() => vi.fn());
const cleanupStaleContextFiles = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getDeploymentById: (...args: unknown[]) => getDeploymentById(...args),
  getRepo: (...args: unknown[]) => getRepo(...args),
  killTtyd: (...args: unknown[]) => killTtyd(...args),
  endDeployment: (...args: unknown[]) => coreEndDeployment(...args),
  cleanupStaleContextFiles: (...args: unknown[]) => cleanupStaleContextFiles(...args),
  tmuxSessionName: (repo: string, issueNumber: number) =>
    `issuectl-${repo}-${issueNumber}`,
  // The rest of the exports used only by launchIssue — provide stubs so
  // TypeScript/vitest don't trip over missing exports.
  isTtydAlive: vi.fn(),
  executeLaunch: vi.fn(),
  withAuthRetry: vi.fn(),
  withIdempotency: vi.fn(),
  DuplicateInFlightError: class DuplicateInFlightError extends Error {},
  formatErrorForUser: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

// Import AFTER mocks so the mocked module is in place.
import { endSession } from "./launch.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal Deployment-shaped object with a non-null ttydPid. */
function makeDeployment(ttydPid: number | null = 42) {
  return {
    id: 1,
    repoId: 1,
    issueNumber: 7,
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

beforeEach(() => {
  revalidatePath.mockReset();
  getDb.mockReset();
  getDeploymentById.mockReset();
  getRepo.mockReset();
  killTtyd.mockReset();
  coreEndDeployment.mockReset();
  cleanupStaleContextFiles.mockReset();

  // Sensible defaults: DB exists, deployment found with a PID, repo found.
  getDb.mockReturnValue({});
  getDeploymentById.mockReturnValue(makeDeployment(42));
  getRepo.mockReturnValue(makeRepoRecord());
  coreEndDeployment.mockReturnValue(undefined);
  cleanupStaleContextFiles.mockReturnValue(Promise.resolve());
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("endSession", () => {
  it("kills ttyd before ending deployment", async () => {
    const result = await endSession(...ARGS);

    expect(killTtyd).toHaveBeenCalledWith(42, "issuectl-repo-7");
    expect(coreEndDeployment).toHaveBeenCalled();
    expect(result).toMatchObject({ success: true });
  });

  it("succeeds even when killTtyd throws", async () => {
    killTtyd.mockImplementation(() => {
      throw Object.assign(new Error("Operation not permitted"), { code: "EPERM" });
    });

    const result = await endSession(...ARGS);

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
