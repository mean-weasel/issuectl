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

const requestPrReviewRun = vi.hoisted(() => vi.fn());
vi.mock("@/lib/review-actions", () => ({
  requestPrReviewRun: (...args: unknown[]) => requestPrReviewRun(...args),
}));

vi.mock("@issuectl/core", () => ({
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

import { POST } from "./route";

beforeEach(() => {
  requireAuth.mockReset();
  loggerError.mockReset();
  requestPrReviewRun.mockReset();

  requireAuth.mockReturnValue(null);
  requestPrReviewRun.mockReturnValue({
    ok: true,
    reviewId: 901,
    intentId: 44,
    mode: "retry",
    message: "PR review retry requested.",
  });
});

describe("/api/v1/pr-reviews/[id]/actions", () => {
  it("requests a review retry through the shared review action helper", async () => {
    const response = await POST(
      request({ mode: "retry" }),
      { params: Promise.resolve({ id: "901" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(requestPrReviewRun).toHaveBeenCalledWith(901, "retry");
    expect(json).toEqual({
      success: true,
      reviewId: 901,
      intentId: 44,
      mode: "retry",
      message: "PR review retry requested.",
    });
  });

  it("requests a full rerun", async () => {
    requestPrReviewRun.mockReturnValueOnce({
      ok: true,
      reviewId: 901,
      intentId: 45,
      mode: "full",
      message: "Manual full PR review rerun requested.",
    });

    const response = await POST(
      request({ mode: "full" }),
      { params: Promise.resolve({ id: "901" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(requestPrReviewRun).toHaveBeenCalledWith(901, "full");
    expect(json.intentId).toBe(45);
    expect(json.mode).toBe("full");
  });

  it("rejects invalid ids and modes before calling the helper", async () => {
    const invalidId = await POST(
      request({ mode: "retry" }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    const invalidMode = await POST(
      request({ mode: "unknown" }),
      { params: Promise.resolve({ id: "901" }) },
    );

    expect(invalidId.status).toBe(400);
    expect(await invalidId.json()).toEqual({ error: "Invalid review id" });
    expect(invalidMode.status).toBe(400);
    expect(await invalidMode.json()).toEqual({ error: "Invalid review action mode" });
    expect(requestPrReviewRun).not.toHaveBeenCalled();
  });

  it("returns helper errors with their status", async () => {
    requestPrReviewRun.mockReturnValueOnce({
      ok: false,
      status: 404,
      error: "Review not found",
    });

    const response = await POST(
      request({ mode: "retry" }),
      { params: Promise.resolve({ id: "999" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Review not found" });
  });

  it("requires API auth", async () => {
    requireAuth.mockReturnValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await POST(
      request({ mode: "retry" }),
      { params: Promise.resolve({ id: "901" }) },
    );

    expect(response.status).toBe(401);
    expect(requestPrReviewRun).not.toHaveBeenCalled();
  });
});

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/pr-reviews/901/actions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
