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

const getSessionsOverviewData = vi.hoisted(() => vi.fn());
const normalizeSessionsFilters = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sessions-data", () => ({
  getSessionsOverviewData: (...args: unknown[]) => getSessionsOverviewData(...args),
  normalizeSessionsFilters: (...args: unknown[]) => normalizeSessionsFilters(...args),
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
const overview = {
  initialized: true,
  filters: {
    tab: "reviews",
    q: "",
    repo: "mean-weasel/issuectl",
    trigger: "all",
    state: "all",
    status: "all",
  },
  repos: [{ id: 1, fullName: "mean-weasel/issuectl" }],
  sessionGroups: [],
  reviewGroups: [],
  summary: {
    activeSessions: 1,
    endedSessions: 2,
    reviewRuns: 3,
    activeReviewRuns: 1,
  },
};

beforeEach(() => {
  requireAuth.mockReset();
  loggerError.mockReset();
  getSessionsOverviewData.mockReset();
  normalizeSessionsFilters.mockReset();
  dbExists.mockReset();
  getDb.mockReset();
  queryDiagnosticEvents.mockReset();

  requireAuth.mockReturnValue(null);
  normalizeSessionsFilters.mockReturnValue(overview.filters);
  getSessionsOverviewData.mockResolvedValue(overview);
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

describe("/api/v1/sessions/overview", () => {
  it("returns session overview data with mobile-safe recent diagnostics", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/v1/sessions/overview?tab=reviews&repo=mean-weasel/issuectl&targetType=pr&targetNumber=44&diagnosticLimit=5",
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(normalizeSessionsFilters).toHaveBeenCalledWith({
      tab: "reviews",
      repo: "mean-weasel/issuectl",
      targetType: "pr",
      targetNumber: "44",
      diagnosticLimit: "5",
    });
    expect(getSessionsOverviewData).toHaveBeenCalledWith(overview.filters);
    expect(queryDiagnosticEvents).toHaveBeenCalledWith(db, {
      target: {
        owner: "mean-weasel",
        repo: "issuectl",
        targetType: "pr",
        targetNumber: 44,
      },
      limit: 5,
    });
    expect(json).toEqual({
      overview,
      diagnostics: {
        events: [
          expect.objectContaining({
            id: 51,
            timestamp: 1_779_000_000_000,
            timestampIso: "2026-05-17T06:40:00.000Z",
            level: "warn",
            event: "reconcile.tmux_missing",
            source: "lifecycle",
            targetLabel: "PR #44",
            deploymentId: 701,
            message: "tmux session disappeared",
          }),
        ],
        filters: {
          deploymentId: null,
          targetType: "pr",
          targetNumber: 44,
          limit: 5,
        },
        summary: {
          count: 1,
          levelCounts: { warn: 1 },
          latestTimestamp: 1_779_000_000_000,
          latestTimestampIso: "2026-05-17T06:40:00.000Z",
        },
      },
      generatedAt: expect.any(String),
    });
  });

  it("requires target owner and repo when target diagnostics are requested", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/sessions/overview?targetType=pr&targetNumber=44"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "Target diagnostics require repo, targetType, and targetNumber" });
    expect(getSessionsOverviewData).not.toHaveBeenCalled();
  });

  it("requires API auth", async () => {
    requireAuth.mockReturnValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await GET(new NextRequest("http://localhost/api/v1/sessions/overview"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(getSessionsOverviewData).not.toHaveBeenCalled();
  });
});
