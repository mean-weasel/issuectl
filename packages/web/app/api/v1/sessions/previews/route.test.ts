import { describe, it, expect, beforeEach, vi } from "vitest";
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
const getActiveDeployments = vi.hoisted(() => vi.fn());
vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getActiveDeployments: (...args: unknown[]) => getActiveDeployments(...args),
}));

const getSessionPreviews = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session-previews", () => ({
  getSessionPreviews: (...args: unknown[]) => getSessionPreviews(...args),
}));

import { GET } from "./route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/v1/sessions/previews");
}

beforeEach(() => {
  requireAuth.mockReset();
  loggerError.mockReset();
  getDb.mockReset();
  getActiveDeployments.mockReset();
  getSessionPreviews.mockReset();

  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue({ db: true });
  getActiveDeployments.mockReturnValue([{ id: 1, ttydPort: 7700 }]);
  getSessionPreviews.mockResolvedValue({
    "7700": {
      lines: ["pnpm test", "pass"],
      lastUpdatedMs: 1_000,
      lastChangedMs: 1_000,
      status: "active",
    },
  });
});

describe("/api/v1/sessions/previews", () => {
  it("returns previews for active deployments", async () => {
    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(getDb).toHaveBeenCalledOnce();
    expect(getActiveDeployments).toHaveBeenCalledWith({ db: true });
    expect(getSessionPreviews).toHaveBeenCalledWith([{ id: 1, ttydPort: 7700 }]);
    expect(json).toEqual({
      previews: {
        "7700": {
          lines: ["pnpm test", "pass"],
          lastUpdatedMs: 1_000,
          lastChangedMs: 1_000,
          status: "active",
        },
      },
    });
  });

  it("returns the auth denial without touching the database", async () => {
    requireAuth.mockReturnValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(getDb).not.toHaveBeenCalled();
    expect(getSessionPreviews).not.toHaveBeenCalled();
  });

  it("returns a 500 when preview loading fails", async () => {
    getSessionPreviews.mockRejectedValueOnce(new Error("tmux failed"));

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
    expect(loggerError).toHaveBeenCalledWith({
      err: expect.any(Error),
      msg: "api_session_previews_failed",
    });
  });
});
