import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

const loggerError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({
  default: {
    error: (...args: unknown[]) => loggerError(...args),
  },
}));

const getDb = vi.hoisted(() => vi.fn());
const getRepo = vi.hoisted(() => vi.fn());
const listPrReviewsForPull = vi.hoisted(() => vi.fn());
const listPrReviewsForRepo = vi.hoisted(() => vi.fn());
const listRecentTerminalDeploymentsByRepo = vi.hoisted(() => vi.fn());
vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getRepo: (...args: unknown[]) => getRepo(...args),
  listPrReviewsForPull: (...args: unknown[]) => listPrReviewsForPull(...args),
  listPrReviewsForRepo: (...args: unknown[]) => listPrReviewsForRepo(...args),
  listRecentTerminalDeploymentsByRepo: (...args: unknown[]) => listRecentTerminalDeploymentsByRepo(...args),
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

import { GET } from "./route";

const db = { db: true };
const repo = {
  id: 1,
  owner: "mean-weasel",
  name: "issuectl",
  localPath: "/tmp/issuectl",
  branchPattern: null,
  autoLaunchIssues: true,
  autoReviewPrs: true,
  issueAgent: "codex",
  reviewAgent: "codex",
  webhookId: 123,
  reviewPreamble: null,
  webhookPayloadMode: "metadata",
  createdAt: "2026-05-24T00:00:00.000Z",
};

function request(url = "http://localhost/api/v1/repos/mean-weasel/issuectl/review-runs"): NextRequest {
  return new NextRequest(url);
}

function context(owner = "mean-weasel", repoName = "issuectl") {
  return {
    params: Promise.resolve({ owner, repo: repoName }),
  };
}

beforeEach(() => {
  requireAuth.mockReset();
  loggerError.mockReset();
  getDb.mockReset();
  getRepo.mockReset();
  listPrReviewsForPull.mockReset();
  listPrReviewsForRepo.mockReset();
  listRecentTerminalDeploymentsByRepo.mockReset();

  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue(db);
  getRepo.mockReturnValue(repo);
  listRecentTerminalDeploymentsByRepo.mockReturnValue([]);
  listPrReviewsForPull.mockReturnValue([
    {
      id: 901,
      repoId: 1,
      prNumber: 44,
      deploymentId: 701,
      startedHeadSha: "aaaabbbbcccc",
      completedHeadSha: "ddddeeeeffff",
      reviewBaseSha: "111122223333",
      reviewedFromSha: "444455556666",
      reviewedToSha: "777788889999",
      headRepoFullName: "mean-weasel/issuectl",
      headRef: "feature/mobile-contracts",
      status: "completed",
      triggeredBy: "webhook",
      resultJson: JSON.stringify({ summary: "found one issue", findings: [{ path: "a.ts" }] }),
      startedAt: 1_779_000_000_000,
      completedAt: 1_779_000_600_000,
    },
  ]);
});

describe("/api/v1/repos/[owner]/[repo]/review-runs", () => {
  it("returns repo-scoped PR review runs in the iOS-decoded response shape", async () => {
    const response = await GET(request(
      "http://localhost/api/v1/repos/mean-weasel/issuectl/review-runs?pr=44&limit=12",
    ), context());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(getRepo).toHaveBeenCalledWith(db, "mean-weasel", "issuectl");
    expect(listPrReviewsForPull).toHaveBeenCalledWith(db, 1, 44, 12);
    expect(listPrReviewsForRepo).not.toHaveBeenCalled();
    expect(json).toEqual(expect.objectContaining({
      reviewRuns: [
        expect.objectContaining({
          id: 901,
          repoId: 1,
          prNumber: 44,
          deploymentId: 701,
          startedHeadSha: "aaaabbbbcccc",
          completedHeadSha: "ddddeeeeffff",
          reviewBaseSha: "111122223333",
          reviewedFromSha: "444455556666",
          reviewedToSha: "777788889999",
          headRepoFullName: "mean-weasel/issuectl",
          headRef: "feature/mobile-contracts",
          status: "completed",
          triggeredBy: "webhook",
          startedAt: 1_779_000_000_000,
          completedAt: 1_779_000_600_000,
        }),
      ],
      fromCache: false,
      cachedAt: null,
    }));
    expect(JSON.stringify(json)).not.toContain("resultJson");
  });

  it("returns 404 when the repo is not tracked", async () => {
    getRepo.mockReturnValueOnce(null);

    const response = await GET(request(), context("mean-weasel", "missing"));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "Repository not tracked" });
    expect(listPrReviewsForRepo).not.toHaveBeenCalled();
    expect(listPrReviewsForPull).not.toHaveBeenCalled();
  });

  it("requires API auth", async () => {
    requireAuth.mockReturnValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await GET(request(), context());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(getDb).not.toHaveBeenCalled();
  });
});
