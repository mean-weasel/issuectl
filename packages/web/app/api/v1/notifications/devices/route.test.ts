import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

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
const upsertPushDevice = vi.hoisted(() => vi.fn());
const disablePushDevice = vi.hoisted(() => vi.fn());
const deletePushDevice = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  upsertPushDevice: (...args: unknown[]) => upsertPushDevice(...args),
  disablePushDevice: (...args: unknown[]) => disablePushDevice(...args),
  deletePushDevice: (...args: unknown[]) => deletePushDevice(...args),
  formatErrorForUser: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

import { DELETE, POST } from "./route";

const token = "a".repeat(64);

function request(method: string, body: unknown, url = "http://localhost/api/v1/notifications/devices") {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuth.mockReset();
  getDb.mockReset();
  upsertPushDevice.mockReset();
  disablePushDevice.mockReset();
  deletePushDevice.mockReset();
  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue({});
  upsertPushDevice.mockReturnValue({
    id: 1,
    platform: "ios",
    token,
    environment: "development",
    preferences: {
      idleTerminals: true,
      newIssues: false,
      mergedPullRequests: true,
    },
    enabled: true,
    lastRegisteredAt: "2026-05-03T00:00:00Z",
  });
});

describe("/api/v1/notifications/devices", () => {
  it("registers an iOS APNs token with preferences", async () => {
    const response = await POST(request("POST", {
      platform: "ios",
      token: token.toUpperCase(),
      environment: "development",
      preferences: {
        idleTerminals: true,
        newIssues: false,
        mergedPullRequests: true,
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(upsertPushDevice).toHaveBeenCalledWith(expect.anything(), {
      platform: "ios",
      token,
      environment: "development",
      enabled: true,
      preferences: {
        idleTerminals: true,
        newIssues: false,
        mergedPullRequests: true,
      },
    });
  });

  it("rejects malformed tokens", async () => {
    const response = await POST(request("POST", {
      platform: "ios",
      token: "not-a-token",
      preferences: {
        idleTerminals: true,
        newIssues: true,
        mergedPullRequests: true,
      },
    }));

    expect(response.status).toBe(400);
    expect(upsertPushDevice).not.toHaveBeenCalled();
  });

  it("rejects odd-length hex tokens", async () => {
    const response = await POST(request("POST", {
      platform: "ios",
      token: `${"a".repeat(64)}b`,
      preferences: {
        idleTerminals: true,
        newIssues: true,
        mergedPullRequests: true,
      },
    }));

    expect(response.status).toBe(400);
    expect(upsertPushDevice).not.toHaveBeenCalled();
  });

  it("disables devices by default on DELETE", async () => {
    disablePushDevice.mockReturnValue(true);

    const response = await DELETE(request("DELETE", {
      platform: "ios",
      token,
    }));

    expect(response.status).toBe(200);
    expect(disablePushDevice).toHaveBeenCalledWith(expect.anything(), "ios", token);
    expect(deletePushDevice).not.toHaveBeenCalled();
  });

  it("validates tokens on DELETE", async () => {
    const response = await DELETE(request("DELETE", {
      platform: "ios",
      token: "not-a-token",
    }));

    expect(response.status).toBe(400);
    expect(disablePushDevice).not.toHaveBeenCalled();
  });

  it("honors auth denials", async () => {
    requireAuth.mockReturnValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await POST(request("POST", {
      platform: "ios",
      token,
      preferences: {
        idleTerminals: true,
        newIssues: true,
        mergedPullRequests: true,
      },
    }));

    expect(response.status).toBe(401);
  });
});
