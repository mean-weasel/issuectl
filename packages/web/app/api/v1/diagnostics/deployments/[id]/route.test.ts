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

const dbExists = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
const queryDiagnosticEvents = vi.hoisted(() => vi.fn());
vi.mock("@issuectl/core", () => ({
  dbExists: () => dbExists(),
  getDb: () => getDb(),
  queryDiagnosticEvents: (...args: unknown[]) => queryDiagnosticEvents(...args),
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

import { GET } from "./route";

const db = { db: true };

beforeEach(() => {
  requireAuth.mockReset();
  loggerError.mockReset();
  dbExists.mockReset();
  getDb.mockReset();
  queryDiagnosticEvents.mockReset();

  requireAuth.mockReturnValue(null);
  dbExists.mockReturnValue(true);
  getDb.mockReturnValue(db);
  queryDiagnosticEvents.mockReturnValue([
    {
      id: 52,
      timestamp: 1_779_000_000_500,
      level: "error",
      event: "ensure_ttyd.failed",
      source: "terminal",
      correlationId: "launch-1",
      owner: "mean-weasel",
      repo: "issuectl",
      issueNumber: 44,
      targetType: "issue",
      targetNumber: 44,
      deploymentId: 701,
      sessionName: "issuectl-701",
      ttydPort: null,
      ttydPid: null,
      status: "failed",
      message: "ttyd unavailable",
      data: null,
    },
  ]);
});

describe("/api/v1/diagnostics/deployments/[id]", () => {
  it("returns diagnostics for a deployment path with a clamped limit", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/diagnostics/deployments/701?limit=250"),
      { params: Promise.resolve({ id: "701" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(queryDiagnosticEvents).toHaveBeenCalledWith(db, {
      deploymentId: 701,
      limit: 200,
    });
    expect(json).toEqual({
      events: [
        expect.objectContaining({
          id: 52,
          timestamp: 1_779_000_000_500,
          timestampIso: "2026-05-17T06:40:00.500Z",
          event: "ensure_ttyd.failed",
          targetLabel: "Issue #44",
          deploymentId: 701,
        }),
      ],
      filters: {
        deploymentId: 701,
        targetType: null,
        targetNumber: null,
        limit: 200,
      },
      summary: {
        count: 1,
        levelCounts: { error: 1 },
        latestTimestamp: 1_779_000_000_500,
        latestTimestampIso: "2026-05-17T06:40:00.500Z",
      },
    });
  });

  it("rejects an invalid deployment id", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/diagnostics/deployments/not-a-number"),
      { params: Promise.resolve({ id: "not-a-number" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "Invalid deployment id" });
    expect(queryDiagnosticEvents).not.toHaveBeenCalled();
  });

  it("requires API auth", async () => {
    requireAuth.mockReturnValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await GET(
      new NextRequest("http://localhost/api/v1/diagnostics/deployments/701"),
      { params: Promise.resolve({ id: "701" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(queryDiagnosticEvents).not.toHaveBeenCalled();
  });
});
