import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.hoisted(() => vi.fn());
const getActiveDeploymentByPort = vi.hoisted(() => vi.fn());
const getRepoById = vi.hoisted(() => vi.fn());
const recordDiagnosticEventSafely = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getActiveDeploymentByPort: (...args: unknown[]) => getActiveDeploymentByPort(...args),
  getRepoById: (...args: unknown[]) => getRepoById(...args),
  recordDiagnosticEventSafely: (...args: unknown[]) => recordDiagnosticEventSafely(...args),
}));

import {
  recordTerminalEventForDeployment,
  recordTerminalEventForPort,
  sanitizeTerminalDiagnosticData,
} from "./terminal-diagnostics.js";

const db = { prepare: vi.fn() } as unknown as Parameters<
  typeof recordTerminalEventForDeployment
>[0];
const deployment = {
  id: 123,
  repoId: 9,
  issueNumber: 483,
  ttydPort: 7700,
  ttydPid: 456,
};
const repo = {
  id: 9,
  owner: "issuectl-tests",
  name: "issuectl-alpha",
  localPath: "/tmp/repo",
  branchPattern: null,
  createdAt: "2026-05-21T00:00:00.000Z",
};

beforeEach(() => {
  getDb.mockReset();
  getActiveDeploymentByPort.mockReset();
  getRepoById.mockReset();
  recordDiagnosticEventSafely.mockReset();

  getDb.mockReturnValue(db);
  getActiveDeploymentByPort.mockReturnValue(deployment);
  getRepoById.mockReturnValue(repo);
});

describe("sanitizeTerminalDiagnosticData", () => {
  it("keeps aggregate numeric and boolean fields only", () => {
    expect(
      sanitizeTerminalDiagnosticData({
        bytesOut: 42,
        framesOut: 3,
        activeWs: true,
        token: "secret",
        command: "pnpm dev",
        output: "terminal output",
        env: { GH_TOKEN: "secret" },
        bufferedBytes: Number.NaN,
      }),
    ).toEqual({
      activeWs: true,
      bytesOut: 42,
      framesOut: 3,
    });
  });

  it("returns null when no safe fields remain", () => {
    expect(sanitizeTerminalDiagnosticData({ token: "secret" })).toBeNull();
  });
});

describe("recordTerminalEventForPort", () => {
  it("records deployment and issue context for an active terminal port", () => {
    recordTerminalEventForPort(7700, {
      level: "info",
      event: "terminal.ws_closed",
      source: "web.terminal-websocket",
      status: "client_close",
      data: { bytesOut: 100, token: "secret" },
    });

    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(db, {
      level: "info",
      event: "terminal.ws_closed",
      source: "web.terminal-websocket",
      status: "client_close",
      owner: "issuectl-tests",
      repo: "issuectl-alpha",
      issueNumber: 483,
      deploymentId: 123,
      ttydPort: 7700,
      ttydPid: 456,
      data: { bytesOut: 100 },
    });
  });

  it("records port-only context when no active deployment exists", () => {
    getActiveDeploymentByPort.mockReturnValue(undefined);

    recordTerminalEventForPort(7701, {
      level: "warn",
      event: "terminal.port_invalid",
      source: "web.terminal-route",
    });

    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(db, {
      level: "warn",
      event: "terminal.port_invalid",
      source: "web.terminal-route",
      ttydPort: 7701,
      data: null,
    });
  });

  it("does not throw when diagnostics storage is unavailable", () => {
    getDb.mockImplementation(() => {
      throw new Error("db unavailable");
    });

    expect(() =>
      recordTerminalEventForPort(7700, {
        level: "info",
        event: "terminal.ws_connected",
        source: "web.terminal-websocket",
      }),
    ).not.toThrow();
  });
});

describe("recordTerminalEventForDeployment", () => {
  it("uses an explicit repo without doing a repo lookup", () => {
    recordTerminalEventForDeployment(db, deployment, {
      level: "info",
      event: "terminal.token_issued",
      source: "web.ensure-ttyd",
    }, repo);

    expect(getRepoById).not.toHaveBeenCalled();
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(db, expect.objectContaining({
      owner: "issuectl-tests",
      repo: "issuectl-alpha",
      issueNumber: 483,
      deploymentId: 123,
      ttydPort: 7700,
      ttydPid: 456,
    }));
  });
});
