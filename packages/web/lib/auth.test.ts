import { describe, it, expect, beforeEach, vi } from "vitest";

type GhAuthResult =
  | { ok: true; username: string; error?: never }
  | { ok: false; username?: never; error: string };

const checkGhAuth = vi.hoisted(() => vi.fn<() => Promise<GhAuthResult>>());

vi.mock("@issuectl/core", () => ({
  checkGhAuth: () => checkGhAuth(),
}));

import { getAuthStatus, __resetAuthCache } from "./auth";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  __resetAuthCache();
  checkGhAuth.mockReset();
  vi.useRealTimers();
});

describe("getAuthStatus", () => {
  it("returns authenticated status on success", async () => {
    checkGhAuth.mockResolvedValue({ ok: true, username: "alice" });
    const status = await getAuthStatus();
    expect(status).toEqual({ authenticated: true, username: "alice" });
  });

  it("returns error status when checkGhAuth reports failure", async () => {
    checkGhAuth.mockResolvedValue({ ok: false, error: "not logged in" });
    const status = await getAuthStatus();
    expect(status).toEqual({ authenticated: false, error: "not logged in" });
  });

  it("never throws — unexpected errors become an authenticated: false result", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    checkGhAuth.mockRejectedValue(new Error("spawn ENOENT"));
    const status = await getAuthStatus();
    expect(status).toEqual({ authenticated: false, error: "spawn ENOENT" });
    expect(consoleSpy).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it("caches successful results for subsequent calls within the TTL", async () => {
    checkGhAuth.mockResolvedValue({ ok: true, username: "alice" });
    await getAuthStatus();
    await getAuthStatus();
    await getAuthStatus();
    expect(checkGhAuth).toHaveBeenCalledOnce();
  });

  it("shares an in-flight promise across concurrent callers (no subprocess dup)", async () => {
    const d = deferred<GhAuthResult>();
    checkGhAuth.mockReturnValue(d.promise);

    const [a, b, c] = [getAuthStatus(), getAuthStatus(), getAuthStatus()];
    // All three must have landed before the first resolves.
    expect(checkGhAuth).toHaveBeenCalledOnce();

    d.resolve({ ok: true, username: "alice" });
    const [rA, rB, rC] = await Promise.all([a, b, c]);
    expect(rA).toEqual({ authenticated: true, username: "alice" });
    expect(rB).toBe(rA);
    expect(rC).toBe(rA);
    expect(checkGhAuth).toHaveBeenCalledOnce();
  });

  it("models the instrumentation + first-request race: warm-up then immediate call share one subprocess", async () => {
    const d = deferred<GhAuthResult>();
    checkGhAuth.mockReturnValue(d.promise);

    // Instrumentation fires fire-and-forget.
    void getAuthStatus();
    // First real request arrives before the subprocess resolves.
    const req = getAuthStatus();

    expect(checkGhAuth).toHaveBeenCalledOnce();
    d.resolve({ ok: true, username: "alice" });
    await expect(req).resolves.toEqual({ authenticated: true, username: "alice" });
    expect(checkGhAuth).toHaveBeenCalledOnce();
  });

  it("re-runs a successful check after the 60 s TTL expires", async () => {
    vi.useFakeTimers();
    checkGhAuth.mockResolvedValue({ ok: true, username: "alice" });
    await getAuthStatus();
    vi.advanceTimersByTime(59_999);
    await getAuthStatus();
    expect(checkGhAuth).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(2);
    await getAuthStatus();
    expect(checkGhAuth).toHaveBeenCalledTimes(2);
  });

  it("caches failure results briefly (5 s TTL) and retries after", async () => {
    vi.useFakeTimers();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    checkGhAuth.mockRejectedValueOnce(new Error("transient"));
    const first = await getAuthStatus();
    expect(first).toEqual({ authenticated: false, error: "transient" });

    // Within the short TTL: still cached.
    vi.advanceTimersByTime(4_999);
    const second = await getAuthStatus();
    expect(second).toBe(first);
    expect(checkGhAuth).toHaveBeenCalledOnce();

    // Past the short TTL: retries, this time succeeding.
    vi.advanceTimersByTime(2);
    checkGhAuth.mockResolvedValueOnce({ ok: true, username: "alice" });
    const third = await getAuthStatus();
    expect(third).toEqual({ authenticated: true, username: "alice" });
    expect(checkGhAuth).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });
});
