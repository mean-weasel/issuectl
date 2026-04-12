import { describe, it, expect, vi, afterEach } from "vitest";
import { classifyGitHubError, formatErrorForUser } from "./errors.js";

function apiError(
  status: number,
  message: string,
  headers: Record<string, string | number | undefined> = {},
): Error & { status: number; response: { headers: typeof headers } } {
  const err = new Error(message) as Error & {
    status: number;
    response: { headers: typeof headers };
  };
  err.status = status;
  err.response = { headers };
  return err;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("classifyGitHubError", () => {
  it("classifies 401 as auth_expired", () => {
    const result = classifyGitHubError(apiError(401, "Bad credentials"));
    expect(result.kind).toBe("auth_expired");
    expect(result.status).toBe(401);
    expect(result.message).toContain("gh auth refresh");
  });

  it("classifies 429 as rate_limited with retry-after header", () => {
    const result = classifyGitHubError(
      apiError(429, "Too Many Requests", { "retry-after": "42" }),
    );
    expect(result.kind).toBe("rate_limited");
    expect(result.retryAfterSec).toBe(42);
    expect(result.message).toContain("42s");
  });

  it("classifies 429 without retry-after as rate_limited without countdown", () => {
    const result = classifyGitHubError(apiError(429, "Too Many Requests"));
    expect(result.kind).toBe("rate_limited");
    expect(result.retryAfterSec).toBeUndefined();
    expect(result.message).toContain("wait");
  });

  it("classifies 403 with x-ratelimit-remaining:0 as rate_limited", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T00:00:00Z"));
    const resetEpoch = Math.floor(Date.now() / 1000) + 60;
    const result = classifyGitHubError(
      apiError(403, "API rate limit exceeded", {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(resetEpoch),
      }),
    );
    expect(result.kind).toBe("rate_limited");
    expect(result.retryAfterSec).toBe(60);
  });

  it("classifies 403 without rate-limit headers as forbidden", () => {
    const result = classifyGitHubError(
      apiError(403, "Resource not accessible by integration"),
    );
    expect(result.kind).toBe("forbidden");
    expect(result.message).toContain("Resource not accessible");
  });

  it("classifies 404 as not_found", () => {
    const result = classifyGitHubError(apiError(404, "Not Found"));
    expect(result.kind).toBe("not_found");
    expect(result.message).toMatch(/not found/i);
  });

  it("classifies 422 as validation with the original message", () => {
    const result = classifyGitHubError(
      apiError(422, "Validation Failed: title is too long"),
    );
    expect(result.kind).toBe("validation");
    expect(result.message).toContain("title is too long");
  });

  it("classifies 500+ as unknown server error", () => {
    const result = classifyGitHubError(apiError(503, "Service Unavailable"));
    expect(result.kind).toBe("unknown");
    expect(result.message).toContain("503");
  });

  it("classifies Node network errors (ECONNREFUSED) as network", () => {
    const err = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const result = classifyGitHubError(err);
    expect(result.kind).toBe("network");
    expect(result.message).toContain("Network error");
  });

  it("classifies ENOTFOUND as network", () => {
    const err = Object.assign(new Error("dns failure"), { code: "ENOTFOUND" });
    expect(classifyGitHubError(err).kind).toBe("network");
  });

  it("classifies AbortError as timeout", () => {
    const err = new Error("operation aborted");
    err.name = "AbortError";
    const result = classifyGitHubError(err);
    expect(result.kind).toBe("timeout");
    expect(result.message).toContain("timed out");
  });

  it("classifies plain Error as unknown with message", () => {
    const result = classifyGitHubError(new Error("something weird happened"));
    expect(result.kind).toBe("unknown");
    expect(result.message).toBe("something weird happened");
  });

  it("classifies non-Error values as unknown with a fallback message", () => {
    expect(classifyGitHubError("a string").kind).toBe("unknown");
    expect(classifyGitHubError(null).kind).toBe("unknown");
    expect(classifyGitHubError(undefined).kind).toBe("unknown");
  });

  it("preserves the original error as cause", () => {
    const err = apiError(401, "Bad credentials");
    const result = classifyGitHubError(err);
    expect(result.cause).toBe(err);
  });
});

describe("formatErrorForUser", () => {
  it("returns the classified message", () => {
    expect(formatErrorForUser(apiError(401, "Bad credentials"))).toContain(
      "gh auth refresh",
    );
    expect(formatErrorForUser(new Error("boom"))).toBe("boom");
  });
});
