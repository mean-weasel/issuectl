import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const getDb = vi.hoisted(() => vi.fn());
const getRepo = vi.hoisted(() => vi.fn());
const executeLaunch = vi.hoisted(() => vi.fn());
const withAuthRetry = vi.hoisted(() => vi.fn());
const withIdempotency = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getRepo: (...args: unknown[]) => getRepo(...args),
  executeLaunch: (...args: unknown[]) => executeLaunch(...args),
  withAuthRetry: (...args: unknown[]) => withAuthRetry(...args),
  withIdempotency: (...args: unknown[]) => withIdempotency(...args),
  isValidNonce: (value: string) => value.length > 0,
  DuplicateInFlightError: class DuplicateInFlightError extends Error {},
  formatErrorForUser: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

import { POST } from "./route";

const params = Promise.resolve({ owner: "owner", repo: "repo", number: "7" });
const baseBody = {
  branchName: "issue-7",
  workspaceMode: "worktree",
  selectedCommentIndices: [0],
  selectedFilePaths: ["src/main.ts"],
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/launch/owner/repo/7", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuth.mockReset();
  getDb.mockReset();
  getRepo.mockReset();
  executeLaunch.mockReset();
  withAuthRetry.mockReset();
  withIdempotency.mockReset();

  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue({});
  getRepo.mockReturnValue({ id: 1, owner: "owner", name: "repo" });
  executeLaunch.mockResolvedValue({
    deploymentId: 123,
    ttydPort: 7700,
    labelWarning: null,
  });
  withAuthRetry.mockImplementation((fn: (octokit: unknown) => unknown) => fn({}));
  withIdempotency.mockImplementation(
    (_db: unknown, _action: string, _key: string, fn: () => unknown) => fn(),
  );
});

describe("POST /api/v1/launch/[owner]/[repo]/[number]", () => {
  it("accepts codex and passes it to executeLaunch", async () => {
    const response = await POST(makeRequest({ ...baseBody, agent: "codex" }), {
      params,
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, deploymentId: 123, ttydPort: 7700 });
    expect(executeLaunch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ agent: "codex" }),
    );
  });

  it("rejects an invalid launch agent", async () => {
    const response = await POST(makeRequest({ ...baseBody, agent: "cursor" }), {
      params,
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "Invalid launch agent" });
    expect(executeLaunch).not.toHaveBeenCalled();
  });

  it("omits agent when the client omits it so core can use the saved default", async () => {
    const response = await POST(makeRequest(baseBody), { params });

    expect(response.status).toBe(200);
    expect(executeLaunch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ agent: undefined }),
    );
  });
});
