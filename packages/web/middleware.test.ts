import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetPublicIp = vi.hoisted(() => vi.fn<() => string | null>());
const mockGetLanIp = vi.hoisted(() => vi.fn<() => string | null>());

vi.mock("./lib/network-info.js", () => ({
  getPublicIp: mockGetPublicIp,
  getLanIp: mockGetLanIp,
}));

const { middleware } = await import("./middleware.js");

function makeRequest(url: string, headers?: Record<string, string>): NextRequest {
  const req = new NextRequest(new URL(url), {
    headers: new Headers(headers),
  });
  return req;
}

describe("middleware", () => {
  beforeEach(() => {
    mockGetPublicIp.mockReset();
    mockGetLanIp.mockReset();
    // Set the env var so the feature is enabled.
    process.env.ISSUECTL_TUNNEL_URL = "https://issuectl.neonwatty.com";
  });

  it("passes through when ISSUECTL_TUNNEL_URL is not set", () => {
    delete process.env.ISSUECTL_TUNNEL_URL;
    mockGetPublicIp.mockReturnValue("203.0.113.42");
    mockGetLanIp.mockReturnValue("192.168.1.30");

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/", {
      "cf-connecting-ip": "203.0.113.42",
    }));

    expect(res.headers.get("location")).toBeNull();
    expect(res.status).not.toBe(302);
  });

  it("passes through when no CF-Connecting-IP header", () => {
    mockGetPublicIp.mockReturnValue("203.0.113.42");
    mockGetLanIp.mockReturnValue("192.168.1.30");

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through when public IP is unknown", () => {
    mockGetPublicIp.mockReturnValue(null);
    mockGetLanIp.mockReturnValue("192.168.1.30");

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/", {
      "cf-connecting-ip": "203.0.113.42",
    }));

    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through when LAN IP is unknown", () => {
    mockGetPublicIp.mockReturnValue("203.0.113.42");
    mockGetLanIp.mockReturnValue(null);

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/", {
      "cf-connecting-ip": "203.0.113.42",
    }));

    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through when client IP does not match server public IP", () => {
    mockGetPublicIp.mockReturnValue("203.0.113.42");
    mockGetLanIp.mockReturnValue("192.168.1.30");

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/issues", {
      "cf-connecting-ip": "198.51.100.99",
    }));

    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects to LAN IP when client IP matches server public IP", () => {
    mockGetPublicIp.mockReturnValue("203.0.113.42");
    mockGetLanIp.mockReturnValue("192.168.1.30");

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/issues?label=bug", {
      "cf-connecting-ip": "203.0.113.42",
    }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://192.168.1.30:3847/issues?label=bug");
  });

  it("preserves the root path in redirect", () => {
    mockGetPublicIp.mockReturnValue("203.0.113.42");
    mockGetLanIp.mockReturnValue("192.168.1.30");

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/", {
      "cf-connecting-ip": "203.0.113.42",
    }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://192.168.1.30:3847/");
  });
});
