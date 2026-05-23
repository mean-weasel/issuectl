import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.hoisted(() => vi.fn());
const getDeploymentById = vi.hoisted(() => vi.fn());
const getRepoById = vi.hoisted(() => vi.fn());
const endDeployment = vi.hoisted(() => vi.fn());
const isTmuxSessionAlive = vi.hoisted(() => vi.fn());
const recordDiagnosticEventSafely = vi.hoisted(() => vi.fn());
const ensureTtydForDeployment = vi.hoisted(() => vi.fn());
const createPtyTerminalToken = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getDeploymentById: (...args: unknown[]) => getDeploymentById(...args),
  getRepoById: (...args: unknown[]) => getRepoById(...args),
  endDeployment: (...args: unknown[]) => endDeployment(...args),
  isTmuxSessionAlive: (...args: unknown[]) => isTmuxSessionAlive(...args),
  recordDiagnosticEventSafely: (...args: unknown[]) => recordDiagnosticEventSafely(...args),
  tmuxSessionName: (repo: string, issueNumber: number) => `issuectl-${repo}-${issueNumber}`,
}));

vi.mock("./ensure-ttyd", () => ({
  ensureTtydForDeployment: (...args: unknown[]) => ensureTtydForDeployment(...args),
}));

vi.mock("./terminal-auth", () => ({
  createPtyTerminalToken: (...args: unknown[]) => createPtyTerminalToken(...args),
}));

import { ensureTerminalForDeployment } from "./ensure-terminal.js";

const db = { prepare: vi.fn() };

beforeEach(() => {
  getDb.mockReset();
  getDeploymentById.mockReset();
  getRepoById.mockReset();
  endDeployment.mockReset();
  isTmuxSessionAlive.mockReset();
  recordDiagnosticEventSafely.mockReset();
  ensureTtydForDeployment.mockReset();
  createPtyTerminalToken.mockReset();

  getDb.mockReturnValue(db);
  getDeploymentById.mockReturnValue({ id: 1, terminalBackend: "ttyd" });
  getRepoById.mockReturnValue({ id: 1, owner: "acme", name: "api" });
  isTmuxSessionAlive.mockReturnValue(true);
  createPtyTerminalToken.mockReturnValue("pty-token");
  delete process.env.ISSUECTL_PTY_BRIDGE;
});

describe("ensureTerminalForDeployment", () => {
  it("returns invalid deployment ID without touching the DB", async () => {
    await expect(ensureTerminalForDeployment(0)).resolves.toEqual({
      alive: false,
      error: "Invalid deployment ID",
    });
    expect(getDb).not.toHaveBeenCalled();
    expect(ensureTtydForDeployment).not.toHaveBeenCalled();
  });

  it("wraps ttyd success with the backend discriminator", async () => {
    ensureTtydForDeployment.mockResolvedValue({ port: 7700, terminalToken: "token" });

    await expect(ensureTerminalForDeployment(1)).resolves.toEqual({
      backend: "ttyd",
      port: 7700,
      terminalToken: "token",
    });
  });

  it("passes through ttyd failures", async () => {
    ensureTtydForDeployment.mockResolvedValue({ alive: false, error: "Terminal session has ended" });

    await expect(ensureTerminalForDeployment(1)).resolves.toEqual({
      alive: false,
      error: "Terminal session has ended",
    });
  });

  it("returns PTY bridge attach metadata for recorded PTY deployments without the global flag", async () => {
    getDeploymentById.mockReturnValue({ id: 1, repoId: 1, issueNumber: 7, terminalBackend: "pty_bridge" });

    await expect(ensureTerminalForDeployment(1)).resolves.toEqual({
      backend: "pty_bridge",
      deploymentId: 1,
      terminalToken: "pty-token",
      wsUrl: "/api/terminal/pty/1/ws?terminalToken=pty-token",
    });
    expect(ensureTtydForDeployment).not.toHaveBeenCalled();
    expect(isTmuxSessionAlive).toHaveBeenCalledWith("issuectl-api-7");
  });

  it("returns PTY bridge attach metadata when the experiment flag is enabled", async () => {
    process.env.ISSUECTL_PTY_BRIDGE = "1";
    getDeploymentById.mockReturnValue({ id: 1, repoId: 1, issueNumber: 7, terminalBackend: "pty_bridge" });

    await expect(ensureTerminalForDeployment(1)).resolves.toEqual({
      backend: "pty_bridge",
      deploymentId: 1,
      terminalToken: "pty-token",
      wsUrl: "/api/terminal/pty/1/ws?terminalToken=pty-token",
    });
    expect(ensureTtydForDeployment).not.toHaveBeenCalled();
    expect(isTmuxSessionAlive).toHaveBeenCalledWith("issuectl-api-7");
  });

  it("ends stale PTY bridge deployments before returning attach metadata", async () => {
    process.env.ISSUECTL_PTY_BRIDGE = "1";
    getDeploymentById.mockReturnValue({ id: 1, repoId: 1, issueNumber: 7, terminalBackend: "pty_bridge" });
    isTmuxSessionAlive.mockReturnValue(false);

    await expect(ensureTerminalForDeployment(1)).resolves.toEqual({
      alive: false,
      backend: "pty_bridge",
      error: "Terminal session has ended",
    });
    expect(endDeployment).toHaveBeenCalledWith(db, 1);
    expect(createPtyTerminalToken).not.toHaveBeenCalled();
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        level: "warn",
        event: "pty.tmux_missing",
        source: "web.ensure-terminal",
        owner: "acme",
        repo: "api",
        issueNumber: 7,
        deploymentId: 1,
        sessionName: "issuectl-api-7",
        message: "Terminal session has ended",
      }),
    );
  });
});
