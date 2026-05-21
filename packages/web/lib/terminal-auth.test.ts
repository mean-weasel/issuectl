import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDb = vi.hoisted(() => vi.fn(() => "fake-db"));
const mockGetSetting = vi.hoisted(() => vi.fn(() => "test-secret"));
const mockGetDeploymentById = vi.hoisted(() => vi.fn());
const mockGetActiveDeploymentByPort = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: mockGetDb,
  getSetting: mockGetSetting,
  getDeploymentById: mockGetDeploymentById,
  getActiveDeploymentByPort: mockGetActiveDeploymentByPort,
}));

import { createTerminalToken, terminalTokenFromRequest, validateTerminalToken } from "./terminal-auth.js";

describe("terminal auth tokens", () => {
  beforeEach(() => {
    mockGetDb.mockReturnValue("fake-db");
    mockGetSetting.mockReturnValue("test-secret");
    mockGetDeploymentById.mockReturnValue({
      id: 7,
      endedAt: null,
      ttydPort: 7700,
    });
    mockGetActiveDeploymentByPort.mockReturnValue({ id: 7 });
  });

  it("creates and validates a deployment-bound terminal token", () => {
    const token = createTerminalToken(7, 7700);

    expect(token).toEqual(expect.any(String));
    expect(validateTerminalToken(token, 7700)).toBe(true);
  });

  it("rejects a token for a different port", () => {
    const token = createTerminalToken(7, 7700);

    expect(validateTerminalToken(token, 7701)).toBe(false);
  });

  it("rejects a tampered token", () => {
    const token = createTerminalToken(7, 7700);
    const tampered = `${token}x`;

    expect(validateTerminalToken(tampered, 7700)).toBe(false);
  });

  it("rejects a token when the deployment is no longer active", () => {
    const token = createTerminalToken(7, 7700);
    mockGetDeploymentById.mockReturnValue({ id: 7, endedAt: "2026-04-28", ttydPort: 7700 });

    expect(validateTerminalToken(token, 7700)).toBe(false);
  });
});

describe("terminalTokenFromRequest", () => {
  it("returns the direct terminal token when present", () => {
    const url = new URL("http://localhost:3000/api/terminal/7700/token?terminalToken=direct");

    expect(terminalTokenFromRequest(url, 7700, null)).toBe("direct");
  });

  it("falls back to an authenticated same-origin terminal frame referer", () => {
    const url = new URL("http://localhost:3000/api/terminal/7700/token");

    expect(
      terminalTokenFromRequest(
        url,
        7700,
        "http://localhost:3000/api/terminal/7700/?terminalToken=from-frame",
      ),
    ).toBe("from-frame");
  });

  it("rejects referers for a different terminal port", () => {
    const url = new URL("http://localhost:3000/api/terminal/7700/token");

    expect(
      terminalTokenFromRequest(
        url,
        7700,
        "http://localhost:3000/api/terminal/7701/?terminalToken=wrong-port",
      ),
    ).toBeNull();
  });

  it("rejects cross-origin referers", () => {
    const url = new URL("http://localhost:3000/api/terminal/7700/token");

    expect(
      terminalTokenFromRequest(
        url,
        7700,
        "http://example.com/api/terminal/7700/?terminalToken=cross-origin",
      ),
    ).toBeNull();
  });
});
