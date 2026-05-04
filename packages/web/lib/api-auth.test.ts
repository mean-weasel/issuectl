import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock @issuectl/core before importing the module under test
vi.mock("@issuectl/core", () => ({
  getDb: vi.fn(),
  getSetting: vi.fn(),
}));

import { validateApiToken, requireAuth, resetApiTokenCache } from "./api-auth.js";
import { getDb, getSetting } from "@issuectl/core";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3847/api/v1/test", { headers });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("validateApiToken", () => {
  beforeEach(() => {
    resetApiTokenCache();
    vi.mocked(getDb).mockReturnValue({} as any);
    vi.mocked(getSetting).mockReset();
  });

  it("returns true for a valid bearer token", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers({ Authorization: "Bearer abc123" });
    expect(validateApiToken(headers)).toBe(true);
  });

  it("reuses the stored token after the first successful lookup", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers({ Authorization: "Bearer abc123" });

    expect(validateApiToken(headers)).toBe(true);
    expect(validateApiToken(headers)).toBe(true);
    expect(getSetting).toHaveBeenCalledTimes(1);
  });

  it("refreshes the cached token after the cache ttl", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T00:00:00Z"));
    vi.mocked(getSetting)
      .mockReturnValueOnce("abc123")
      .mockReturnValueOnce("def456");

    expect(validateApiToken(new Headers({ Authorization: "Bearer abc123" }))).toBe(true);

    vi.setSystemTime(new Date("2026-05-03T00:00:31Z"));

    expect(validateApiToken(new Headers({ Authorization: "Bearer def456" }))).toBe(true);
    expect(getSetting).toHaveBeenCalledTimes(2);
  });

  it("does not cache a missing stored token", () => {
    vi.mocked(getSetting)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce("abc123");

    expect(validateApiToken(new Headers({ Authorization: "Bearer abc123" }))).toBe(false);
    expect(validateApiToken(new Headers({ Authorization: "Bearer abc123" }))).toBe(true);
    expect(getSetting).toHaveBeenCalledTimes(2);
  });

  it("returns false for a missing Authorization header", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers();
    expect(validateApiToken(headers)).toBe(false);
  });

  it("returns false for same-length wrong token (exercises timingSafeEqual)", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers({ Authorization: "Bearer xyz789" });
    expect(validateApiToken(headers)).toBe(false);
  });

  it("returns false for different-length wrong token", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers({ Authorization: "Bearer wrong" });
    expect(validateApiToken(headers)).toBe(false);
  });

  it("returns false for empty bearer token", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers({ Authorization: "Bearer " });
    expect(validateApiToken(headers)).toBe(false);
  });

  it("returns false when no token is configured", () => {
    vi.mocked(getSetting).mockReturnValue(undefined);
    const headers = new Headers({ Authorization: "Bearer anything" });
    expect(validateApiToken(headers)).toBe(false);
  });

  it("ignores non-Bearer schemes", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers({ Authorization: "Basic abc123" });
    expect(validateApiToken(headers)).toBe(false);
  });

});

describe("requireAuth", () => {
  beforeEach(() => {
    resetApiTokenCache();
    vi.mocked(getDb).mockReturnValue({} as any);
    vi.mocked(getSetting).mockReset();
  });

  it("returns null when token is valid (allows route to proceed)", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const result = requireAuth(makeRequest({ Authorization: "Bearer abc123" }));
    expect(result).toBeNull();
  });

  it("returns 401 when token is invalid", async () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const result = requireAuth(makeRequest({ Authorization: "Bearer wrong" }));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
    const body = await result!.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when no Authorization header is present", async () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const result = requireAuth(makeRequest());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 500 when database is unavailable", async () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("SQLITE_CANTOPEN");
    });
    const result = requireAuth(makeRequest({ Authorization: "Bearer abc123" }));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(500);
    const body = await result!.json();
    expect(body.error).toBe("Internal server error");
  });
});
