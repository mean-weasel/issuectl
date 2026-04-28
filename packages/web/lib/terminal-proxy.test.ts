import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetActiveDeploymentByPort = vi.hoisted(() => vi.fn());
const mockGetDb = vi.hoisted(() => vi.fn(() => "fake-db"));

vi.mock("@issuectl/core", () => ({
  getDb: mockGetDb,
  getActiveDeploymentByPort: mockGetActiveDeploymentByPort,
  getDeploymentById: vi.fn(),
  getSetting: vi.fn(),
}));

import { isValidTerminalPort, rewriteHtml } from "./terminal-proxy.js";

describe("isValidTerminalPort", () => {
  beforeEach(() => {
    mockGetActiveDeploymentByPort.mockReset();
  });

  it("returns true when port has an active deployment", () => {
    mockGetActiveDeploymentByPort.mockReturnValue({ id: 1, ttydPort: 7700 });
    expect(isValidTerminalPort(7700)).toBe(true);
    expect(mockGetActiveDeploymentByPort).toHaveBeenCalledWith("fake-db", 7700);
  });

  it("returns false for port above the ttyd range", () => {
    expect(isValidTerminalPort(9999)).toBe(false);
    expect(mockGetActiveDeploymentByPort).not.toHaveBeenCalled();
  });

  it("returns false for NaN port", () => {
    expect(isValidTerminalPort(NaN)).toBe(false);
    expect(mockGetActiveDeploymentByPort).not.toHaveBeenCalled();
  });

  it("returns false for port outside 7700-7799 range", () => {
    expect(isValidTerminalPort(3000)).toBe(false);
    expect(mockGetActiveDeploymentByPort).not.toHaveBeenCalled();
  });

  it("returns false when port is in range but has no active deployment", () => {
    mockGetActiveDeploymentByPort.mockReturnValue(undefined);
    expect(isValidTerminalPort(7750)).toBe(false);
    expect(mockGetActiveDeploymentByPort).toHaveBeenCalledWith("fake-db", 7750);
  });
});

describe("rewriteHtml", () => {
  it("rewrites href attributes with root-relative paths", () => {
    const input = '<link rel="stylesheet" href="/style.css">';
    const result = rewriteHtml(input, 7700);
    expect(result).toBe('<link rel="stylesheet" href="/api/terminal/7700/style.css">');
  });

  it("rewrites src attributes with root-relative paths", () => {
    const input = '<script src="/auth_token.js"></script>';
    const result = rewriteHtml(input, 7701);
    expect(result).toBe('<script src="/api/terminal/7701/auth_token.js"></script>');
  });

  it("does not rewrite protocol-relative URLs", () => {
    const input = '<script src="//cdn.example.com/lib.js"></script>';
    const result = rewriteHtml(input, 7700);
    expect(result).toBe(input);
  });

  it("does not rewrite absolute URLs", () => {
    const input = '<a href="https://example.com">link</a>';
    const result = rewriteHtml(input, 7700);
    expect(result).toBe(input);
  });

  it("handles single-quoted attributes", () => {
    const input = "<link href='/style.css'>";
    const result = rewriteHtml(input, 7700);
    expect(result).toBe("<link href='/api/terminal/7700/style.css'>");
  });

  it("adds terminalToken to rewritten asset URLs", () => {
    const input = '<script src="/auth_token.js"></script>';
    const result = rewriteHtml(input, 7701, "abc123");
    expect(result).toContain('/api/terminal/7701/auth_token.js?terminalToken=abc123');
  });

  it("injects a WebSocket token patch when terminalToken is present", () => {
    const result = rewriteHtml("<html><head></head><body></body></html>", 7701, "abc123");
    expect(result).toContain("window.WebSocket=AuthWebSocket");
    expect(result).toContain("abc123");
  });
});
