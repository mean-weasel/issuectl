import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";

vi.mock("node:os", () => ({
  default: { networkInterfaces: vi.fn() },
  networkInterfaces: vi.fn(),
}));

const mockNetworkInterfaces = vi.mocked(os.networkInterfaces);

// Dynamic import so mocks are in place before the module loads.
// Re-import per test group via resetModules if needed.
const { getLanIp, getPublicIp, getLanRedirectUrl, resetForTesting } = await import("./network-info.js");

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

describe("getLanRedirectUrl", () => {
  const savedEnv = process.env.ISSUECTL_TUNNEL_URL;

  beforeEach(() => {
    resetForTesting();
    mockNetworkInterfaces.mockReturnValue({
      en0: [
        { address: "192.168.1.30", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "", cidr: null },
      ],
    });
    process.env.ISSUECTL_TUNNEL_URL = "https://issuectl.neonwatty.com";
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.ISSUECTL_TUNNEL_URL;
    } else {
      process.env.ISSUECTL_TUNNEL_URL = savedEnv;
    }
    globalThis.fetch = originalFetch;
  });

  async function setupIps(pub: string | null): Promise<void> {
    if (pub) {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(pub),
      });
    } else {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("no network"));
    }
    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();
  }

  it("returns null when ISSUECTL_TUNNEL_URL is not set", async () => {
    delete process.env.ISSUECTL_TUNNEL_URL;
    await setupIps("203.0.113.42");
    expect(getLanRedirectUrl("203.0.113.42", "/", "", 3847)).toBeNull();
  });

  it("returns null when clientIp is undefined", async () => {
    await setupIps("203.0.113.42");
    expect(getLanRedirectUrl(undefined, "/", "", 3847)).toBeNull();
  });

  it("returns null when public IP is unknown", async () => {
    await setupIps(null);
    expect(getLanRedirectUrl("203.0.113.42", "/", "", 3847)).toBeNull();
  });

  it("returns null when client IP does not match server public IP", async () => {
    await setupIps("203.0.113.42");
    expect(getLanRedirectUrl("198.51.100.99", "/issues", "", 3847)).toBeNull();
  });

  it("returns null for API routes", async () => {
    await setupIps("203.0.113.42");
    expect(getLanRedirectUrl("203.0.113.42", "/api/health", "", 3847)).toBeNull();
  });

  it("returns null for _next assets", async () => {
    await setupIps("203.0.113.42");
    expect(getLanRedirectUrl("203.0.113.42", "/_next/static/chunk.js", "", 3847)).toBeNull();
  });

  it("returns null for dotted infra paths (favicon.ico, sw.js, manifest.json)", async () => {
    await setupIps("203.0.113.42");
    expect(getLanRedirectUrl("203.0.113.42", "/favicon.ico", "", 3847)).toBeNull();
    expect(getLanRedirectUrl("203.0.113.42", "/sw.js", "", 3847)).toBeNull();
    expect(getLanRedirectUrl("203.0.113.42", "/manifest.json", "", 3847)).toBeNull();
    expect(getLanRedirectUrl("203.0.113.42", "/icon.png", "", 3847)).toBeNull();
  });

  it("redirects hyphenated paths that only share a skip-prefix (e.g. /api-docs)", async () => {
    await setupIps("203.0.113.42");
    expect(getLanRedirectUrl("203.0.113.42", "/api-docs", "", 3847))
      .toBe("http://192.168.1.30:3847/api-docs");
  });

  it("returns null for exact skip paths without trailing slash", async () => {
    await setupIps("203.0.113.42");
    expect(getLanRedirectUrl("203.0.113.42", "/api", "", 3847)).toBeNull();
    expect(getLanRedirectUrl("203.0.113.42", "/offline", "", 3847)).toBeNull();
  });

  it("returns null when LAN IP is unknown but public IP is present", async () => {
    mockNetworkInterfaces.mockReturnValue({});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("203.0.113.42"),
    });
    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();
    expect(getLanRedirectUrl("203.0.113.42", "/issues", "", 3847)).toBeNull();
  });

  it("redirects to LAN IP when client IP matches server public IP", async () => {
    await setupIps("203.0.113.42");
    expect(getLanRedirectUrl("203.0.113.42", "/issues", "?label=bug", 3847))
      .toBe("http://192.168.1.30:3847/issues?label=bug");
  });

  it("preserves the root path in redirect", async () => {
    await setupIps("203.0.113.42");
    expect(getLanRedirectUrl("203.0.113.42", "/", "", 3847))
      .toBe("http://192.168.1.30:3847/");
  });
});
