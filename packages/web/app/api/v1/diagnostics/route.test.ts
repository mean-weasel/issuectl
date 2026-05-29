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
      id: 51,
      timestamp: 1_779_000_000_000,
      level: "warn",
      event: "reconcile.tmux_missing",
      source: "lifecycle",
      correlationId: "launch-1",
      owner: "mean-weasel",
      repo: "issuectl",
      issueNumber: null,
      targetType: "pr",
      targetNumber: 44,
      deploymentId: 701,
      sessionName: "issuectl-701",
      ttydPort: 7701,
      ttydPid: null,
      status: "ended",
      message: "tmux session disappeared",
      data: { sessionName: "issuectl-701" },
    },
  ]);
});

describe("/api/v1/diagnostics", () => {
  it("returns deployment diagnostics for the iOS client contract", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/v1/diagnostics?deploymentId=701&limit=5",
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(queryDiagnosticEvents).toHaveBeenCalledWith(db, {
      deploymentId: 701,
      limit: 5,
    });
    expect(json).toEqual({
      events: [
        expect.objectContaining({
          id: 51,
          timestamp: 1_779_000_000_000,
          timestampIso: "2026-05-17T06:40:00.000Z",
          event: "reconcile.tmux_missing",
          targetLabel: "PR #44",
          deploymentId: 701,
        }),
      ],
      filters: {
        deploymentId: 701,
        targetType: null,
        targetNumber: null,
        limit: 5,
      },
      summary: {
        count: 1,
        levelCounts: { warn: 1 },
        latestTimestamp: 1_779_000_000_000,
        latestTimestampIso: "2026-05-17T06:40:00.000Z",
      },
    });
  });

  it("requires deploymentId", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/diagnostics"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "Missing deployment id" });
    expect(queryDiagnosticEvents).not.toHaveBeenCalled();
  });

  it("requires API auth", async () => {
    requireAuth.mockReturnValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await GET(new NextRequest("http://localhost/api/v1/diagnostics?deploymentId=701"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(queryDiagnosticEvents).not.toHaveBeenCalled();
  });
});
