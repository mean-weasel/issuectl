import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @issuectl/core before importing the module under test
vi.mock("@issuectl/core", () => ({
  getDb: vi.fn(),
  getSetting: vi.fn(),
}));

import { validateApiToken } from "./api-auth.js";
import { getDb, getSetting } from "@issuectl/core";

describe("validateApiToken", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue({} as any);
  });

  it("returns true for a valid bearer token", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers({ Authorization: "Bearer abc123" });
    expect(validateApiToken(headers)).toBe(true);
  });

  it("returns false for a missing Authorization header", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers();
    expect(validateApiToken(headers)).toBe(false);
  });

  it("returns false for wrong token", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers({ Authorization: "Bearer wrong" });
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
