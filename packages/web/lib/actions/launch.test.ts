import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.mock is hoisted, so we cannot reference a const declared above it.
// Use vi.hoisted() to create spies before hoisting occurs, then reference them.
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

// Spy factories — created via vi.hoisted() so they are available inside
// vi.mock() factory functions (which are also hoisted).
const getDb = vi.hoisted(() => vi.fn());
const getDeploymentById = vi.hoisted(() => vi.fn());
const killTtyd = vi.hoisted(() => vi.fn());
const coreEndDeployment = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getDeploymentById: (...args: unknown[]) => getDeploymentById(...args),
  killTtyd: (...args: unknown[]) => killTtyd(...args),
  endDeployment: (...args: unknown[]) => coreEndDeployment(...args),
  // The rest of the exports used only by launchIssue — provide stubs so
  // TypeScript/vitest don't trip over missing exports.
  getRepo: vi.fn(),
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

const ARGS = [1, "owner", "repo", 7] as const;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  revalidatePath.mockReset();
  getDb.mockReset();
  getDeploymentById.mockReset();
  killTtyd.mockReset();
  coreEndDeployment.mockReset();

  // Sensible defaults: DB exists, deployment found with a PID.
  getDb.mockReturnValue({});
  getDeploymentById.mockReturnValue(makeDeployment(42));
  coreEndDeployment.mockReturnValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("endSession", () => {
  it("kills ttyd before ending deployment", async () => {
    const result = await endSession(...ARGS);

    expect(killTtyd).toHaveBeenCalledWith(42);
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
    // No deployment found — coreEndDeployment will be attempted and may throw.
    getDeploymentById.mockReturnValue(undefined);
    coreEndDeployment.mockImplementation(() => {
      throw new Error("Deployment not found");
    });

    const result = await endSession(...ARGS);

    // The outer catch converts the error to a { success: false } response.
    expect(coreEndDeployment).toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
});
