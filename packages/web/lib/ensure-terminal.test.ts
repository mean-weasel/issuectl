import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.hoisted(() => vi.fn());
const getDeploymentById = vi.hoisted(() => vi.fn());
const ensureTtydForDeployment = vi.hoisted(() => vi.fn());
const createPtyTerminalToken = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getDeploymentById: (...args: unknown[]) => getDeploymentById(...args),
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
  ensureTtydForDeployment.mockReset();

  getDb.mockReturnValue(db);
  getDeploymentById.mockReturnValue({ id: 1, terminalBackend: "ttyd" });
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

  it("does not route pty_bridge deployments through ttyd when the experiment flag is disabled", async () => {
    getDeploymentById.mockReturnValue({ id: 1, terminalBackend: "pty_bridge" });

    await expect(ensureTerminalForDeployment(1)).resolves.toEqual({
      alive: false,
      backend: "pty_bridge",
      error: "PTY bridge terminal backend is not implemented yet",
    });
    expect(ensureTtydForDeployment).not.toHaveBeenCalled();
  });

  it("returns PTY bridge attach metadata when the experiment flag is enabled", async () => {
    process.env.ISSUECTL_PTY_BRIDGE = "1";
    getDeploymentById.mockReturnValue({ id: 1, terminalBackend: "pty_bridge" });

    await expect(ensureTerminalForDeployment(1)).resolves.toEqual({
      backend: "pty_bridge",
      deploymentId: 1,
      terminalToken: "pty-token",
      wsUrl: "/api/terminal/pty/1/ws?terminalToken=pty-token",
    });
    expect(ensureTtydForDeployment).not.toHaveBeenCalled();
  });
});
