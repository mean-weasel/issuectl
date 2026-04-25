import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";

vi.mock("node:os", () => ({
  default: { networkInterfaces: vi.fn() },
  networkInterfaces: vi.fn(),
}));

const mockNetworkInterfaces = vi.mocked(os.networkInterfaces);

// Dynamic import so mocks are in place before the module loads.
// Re-import per test group via resetModules if needed.
const { getLanIp, resetForTesting } = await import("./network-info.js");

describe("getLanIp", () => {
  beforeEach(() => {
    resetForTesting();
    mockNetworkInterfaces.mockReset();
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
