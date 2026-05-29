import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn() },
}));

const addLabel = vi.hoisted(() => vi.fn());
const clearCacheKey = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
const getRepo = vi.hoisted(() => vi.fn());
const removeLabel = vi.hoisted(() => vi.fn());
const withAuthRetry = vi.hoisted(() => vi.fn((fn: (octokit: unknown) => unknown) => fn({})));

vi.mock("@issuectl/core", () => ({
  addLabel: (...args: unknown[]) => addLabel(...args),
  clearCacheKey: (...args: unknown[]) => clearCacheKey(...args),
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
  getDb: () => getDb(),
  getRepo: (...args: unknown[]) => getRepo(...args),
  removeLabel: (...args: unknown[]) => removeLabel(...args),
  withAuthRetry: (fn: (octokit: unknown) => unknown) => withAuthRetry(fn),
}));

import { POST } from "./route";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/pulls/mean-weasel/issuectl/44/labels", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuth.mockReturnValue(null);
  addLabel.mockReset();
  clearCacheKey.mockReset();
  getDb.mockReturnValue({});
  getRepo.mockReturnValue({ id: 1, owner: "mean-weasel", name: "issuectl" });
  removeLabel.mockReset();
  withAuthRetry.mockClear();
});

describe("/api/v1/pulls/[owner]/[repo]/[number]/labels", () => {
  it("adds a PR label and clears PR caches", async () => {
    const response = await POST(request({ label: "issuectl:auto-review", action: "add" }), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl", number: "44" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true });
    expect(addLabel).toHaveBeenCalledWith(expect.anything(), "mean-weasel", "issuectl", 44, "issuectl:auto-review");
    expect(clearCacheKey).toHaveBeenCalledWith(expect.anything(), "pull-detail:mean-weasel/issuectl#44");
    expect(clearCacheKey).toHaveBeenCalledWith(expect.anything(), "pulls-open:mean-weasel/issuectl");
    expect(clearCacheKey).toHaveBeenCalledWith(expect.anything(), "pulls-with-checks:mean-weasel/issuectl");
  });

  it("removes a PR label", async () => {
    const response = await POST(request({ label: "issuectl:auto-review", action: "remove" }), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl", number: "44" }),
    });

    expect(response.status).toBe(200);
    expect(removeLabel).toHaveBeenCalledWith(expect.anything(), "mean-weasel", "issuectl", 44, "issuectl:auto-review");
  });

  it("rejects invalid pull numbers", async () => {
    const response = await POST(request({ label: "issuectl:auto-review", action: "add" }), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl", number: "nope" }),
    });

    expect(response.status).toBe(400);
    expect(addLabel).not.toHaveBeenCalled();
  });
});
