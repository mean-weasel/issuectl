import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const getDb = vi.hoisted(() => vi.fn());
const getRepo = vi.hoisted(() => vi.fn());
const getDeploymentById = vi.hoisted(() => vi.fn());
const endDeployment = vi.hoisted(() => vi.fn());
const killTmuxSession = vi.hoisted(() => vi.fn());
const killTtyd = vi.hoisted(() => vi.fn());
const cleanupStaleContextFiles = vi.hoisted(() => vi.fn());
const recordDiagnosticEventSafely = vi.hoisted(() => vi.fn());
const removeLabel = vi.hoisted(() => vi.fn());
const clearCacheKey = vi.hoisted(() => vi.fn());
const withAuthRetry = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getRepo: (...args: unknown[]) => getRepo(...args),
  getDeploymentById: (...args: unknown[]) => getDeploymentById(...args),
  endDeployment: (...args: unknown[]) => endDeployment(...args),
  killTmuxSession: (...args: unknown[]) => killTmuxSession(...args),
  killTtyd: (...args: unknown[]) => killTtyd(...args),
  tmuxSessionName: (repo: string, issueNumber: number) => `issuectl-${repo}-${issueNumber}`,
  cleanupStaleContextFiles: (...args: unknown[]) => cleanupStaleContextFiles(...args),
  recordDiagnosticEventSafely: (...args: unknown[]) => recordDiagnosticEventSafely(...args),
  removeLabel: (...args: unknown[]) => removeLabel(...args),
  LIFECYCLE_LABEL: { inProgress: "issuectl:in-progress" },
  clearCacheKey: (...args: unknown[]) => clearCacheKey(...args),
  withAuthRetry: (...args: unknown[]) => withAuthRetry(...args),
}));

import { POST } from "./route";

const db = { prepare: vi.fn() };
const params = Promise.resolve({ id: "17" });

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/deployments/17/end", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    id: 17,
    repoId: 3,
    issueNumber: 137,
    ttydPid: 444,
    endedAt: null,
    terminalBackend: "ttyd",
    ...overrides,
  };
}

beforeEach(() => {
  requireAuth.mockReset();
  getDb.mockReset();
  getRepo.mockReset();
  getDeploymentById.mockReset();
  endDeployment.mockReset();
  killTmuxSession.mockReset();
  killTtyd.mockReset();
  cleanupStaleContextFiles.mockReset();
  recordDiagnosticEventSafely.mockReset();
  removeLabel.mockReset();
  clearCacheKey.mockReset();
  withAuthRetry.mockReset();

  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue(db);
  getRepo.mockReturnValue({ id: 3, owner: "mean-weasel", name: "issuectl-test-repo" });
  getDeploymentById.mockReturnValue(deployment());
  cleanupStaleContextFiles.mockResolvedValue(undefined);
  withAuthRetry.mockImplementation((fn: (octokit: unknown) => unknown) => fn({}));
});

describe("POST /api/v1/deployments/[id]/end", () => {
  it("kills ttyd for TTYD deployments before ending the row", async () => {
    const response = await POST(makeRequest({
      owner: "mean-weasel",
      repo: "issuectl-test-repo",
      issueNumber: 137,
    }), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(killTtyd).toHaveBeenCalledWith(444, "issuectl-issuectl-test-repo-137");
    expect(killTmuxSession).not.toHaveBeenCalled();
    expect(endDeployment).toHaveBeenCalledWith(db, 17);
  });

  it("kills tmux directly for PTY bridge deployments with no ttyd PID", async () => {
    getDeploymentById.mockReturnValue(deployment({
      ttydPid: null,
      terminalBackend: "pty_bridge",
    }));

    const response = await POST(makeRequest({
      owner: "mean-weasel",
      repo: "issuectl-test-repo",
      issueNumber: 137,
    }), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(killTtyd).not.toHaveBeenCalled();
    expect(killTmuxSession).toHaveBeenCalledWith("issuectl-issuectl-test-repo-137");
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        level: "info",
        event: "pty.tmux_killed",
        source: "web.end-session",
        owner: "mean-weasel",
        repo: "issuectl-test-repo",
        issueNumber: 137,
        deploymentId: 17,
        sessionName: "issuectl-issuectl-test-repo-137",
      }),
    );
    expect(endDeployment).toHaveBeenCalledWith(db, 17);
  });

  it("returns auth denials before touching the database", async () => {
    requireAuth.mockReturnValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await POST(makeRequest({
      owner: "mean-weasel",
      repo: "issuectl-test-repo",
      issueNumber: 137,
    }), { params });

    expect(response.status).toBe(401);
    expect(getDb).not.toHaveBeenCalled();
  });
});
