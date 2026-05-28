import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getGhTokenMock = vi.hoisted(() => vi.fn());
vi.mock("./auth.js", () => ({
  getGhToken: getGhTokenMock,
  checkGhAuth: vi.fn(),
}));

import { withAuthRetry, resetOctokit, getOctokit } from "./client.js";

beforeEach(() => {
  resetOctokit();
  getGhTokenMock.mockReset();
  getGhTokenMock.mockResolvedValue("test-token-1");
});

afterEach(() => {
  resetOctokit();
});

function authError() {
  const err = new Error("Bad credentials") as Error & { status: number };
  err.status = 401;
  return err;
}

function notFoundError() {
  const err = new Error("Not Found") as Error & { status: number };
  err.status = 404;
  return err;
}

describe("withAuthRetry", () => {
  it("returns the value on first-try success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withAuthRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getGhTokenMock).toHaveBeenCalledTimes(1);
  });

  it("resets the cached Octokit and retries on 401", async () => {
    getGhTokenMock
      .mockResolvedValueOnce("test-token-1")
      .mockResolvedValueOnce("test-token-2");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(authError())
      .mockResolvedValueOnce("recovered");

    const result = await withAuthRetry(fn);
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(getGhTokenMock).toHaveBeenCalledTimes(2);
  });

  it("propagates a second 401 after retry", async () => {
    getGhTokenMock
      .mockResolvedValueOnce("test-token-1")
      .mockResolvedValueOnce("test-token-2");
    const fn = vi.fn().mockRejectedValue(authError());

    await expect(withAuthRetry(fn)).rejects.toMatchObject({ status: 401 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry on non-auth errors", async () => {
    const fn = vi.fn().mockRejectedValue(notFoundError());

    await expect(withAuthRetry(fn)).rejects.toMatchObject({ status: 404 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getGhTokenMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry on plain Error without status", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(withAuthRetry(fn)).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("getOctokit caching", () => {
  it("caches the Octokit instance across calls", async () => {
    const a = await getOctokit();
    const b = await getOctokit();
    expect(a).toBe(b);
    expect(getGhTokenMock).toHaveBeenCalledTimes(1);
  });

  it("re-reads the token after resetOctokit", async () => {
    getGhTokenMock
      .mockResolvedValueOnce("test-token-1")
      .mockResolvedValueOnce("test-token-2");

    const first = await getOctokit();
    resetOctokit();
    const second = await getOctokit();
    expect(first).not.toBe(second);
    expect(getGhTokenMock).toHaveBeenCalledTimes(2);
  });

  it("adds cache-busting to ordinary GitHub GET requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ login: "octocat" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const octokit = await getOctokit();

    await octokit.rest.users.getAuthenticated();

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("_nc=");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    fetchMock.mockRestore();
  });

  it("does not add cache-busting query parameters to webhook delivery listing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const octokit = await getOctokit();

    await octokit.rest.repos.listWebhookDeliveries({
      owner: "mean-weasel",
      repo: "issuectl",
      hook_id: 123,
      per_page: 5,
    });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/repos/mean-weasel/issuectl/hooks/123/deliveries?per_page=5");
    expect(url).not.toContain("_nc=");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    fetchMock.mockRestore();
  });
});
