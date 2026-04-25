import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";

vi.mock("node:os", () => ({
  default: { networkInterfaces: vi.fn() },
  networkInterfaces: vi.fn(),
}));

const mockNetworkInterfaces = vi.mocked(os.networkInterfaces);

// Dynamic import so mocks are in place before the module loads.
// Re-import per test group via resetModules if needed.
const { getLanIp, getPublicIp, resetForTesting } = await import("./network-info.js");

const originalFetch = globalThis.fetch;

describe("getLanIp", () => {
  beforeEach(() => {
    resetForTesting();
    mockNetworkInterfaces.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns null before refresh", () => {
    expect(getLanIp()).toBeNull();
  });

  it("returns the first non-internal IPv4 after refresh", async () => {
    mockNetworkInterfaces.mockReturnValue({
      en0: [
        { address: "fe80::1", family: "IPv6", internal: false, netmask: "ffff::", mac: "", cidr: null, scopeid: 0 },
        { address: "192.168.1.30", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "", cidr: null },
      ],
      lo0: [
        { address: "127.0.0.1", family: "IPv4", internal: true, netmask: "255.0.0.0", mac: "", cidr: null },
      ],
    });

    // refreshNetworkInfo also fetches public IP — mock fetch to avoid real network call.
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("no network"));

    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();

    expect(getLanIp()).toBe("192.168.1.30");
  });

  it("skips link-local addresses", async () => {
    mockNetworkInterfaces.mockReturnValue({
      en0: [
        { address: "169.254.1.1", family: "IPv4", internal: false, netmask: "255.255.0.0", mac: "", cidr: null },
      ],
    });

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("no network"));

    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();

    expect(getLanIp()).toBeNull();
  });

  it("returns null when no interfaces available", async () => {
    mockNetworkInterfaces.mockReturnValue({});

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("no network"));

    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();

    expect(getLanIp()).toBeNull();
  });
});

describe("getPublicIp", () => {
  beforeEach(() => {
    resetForTesting();
    mockNetworkInterfaces.mockReturnValue({});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns null before refresh", () => {
    expect(getPublicIp()).toBeNull();
  });

  it("returns the public IP after a successful refresh", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("203.0.113.42"),
    });

    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();

    expect(getPublicIp()).toBe("203.0.113.42");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.ipify.org",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns null when ipify returns a non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("error"),
    });

    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();

    expect(getPublicIp()).toBeNull();
  });

  it("returns null when fetch throws (no network)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();

    expect(getPublicIp()).toBeNull();
  });
});
