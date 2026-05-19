import { describe, it, expect, vi, beforeEach } from "vitest";
import type Database from "better-sqlite3";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

// Mock node:child_process — must use vi.hoisted so the spies exist
// when vi.mock factory runs (hoisted to the top of the file).
const { execFileSyncSpy, spawnSpy } = vi.hoisted(() => ({
  execFileSyncSpy: vi.fn(),
  spawnSpy: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncSpy,
  spawn: spawnSpy,
}));

// Mock net.connect for port-probing tests.
const { netConnectSpy } = vi.hoisted(() => ({
  netConnectSpy: vi.fn(),
}));

vi.mock("node:net", () => ({
  default: { connect: netConnectSpy },
}));

import { isTmuxSessionAlive, allocatePort } from "./ttyd.js";

/** Minimal fake DB that satisfies the functions under test. */
function makeFakeDb(rows: Record<string, unknown>[] = []): Database.Database {
  return {
    prepare: vi.fn(() => ({
      all: vi.fn(() => rows),
      run: vi.fn(),
    })),
  } as unknown as Database.Database;
}

/** Create an EventEmitter-like fake socket for net.connect mocking. */
function fakeSocket(behavior: "connect" | "error") {
  const handlers: Record<string, (() => void)[]> = {};
  const socket = {
    on(event: string, cb: () => void) {
      (handlers[event] ??= []).push(cb);
      return socket;
    },
    destroy: vi.fn(),
  };
  // Fire the appropriate event on the next microtask.
  queueMicrotask(() => {
    for (const cb of handlers[behavior] ?? []) cb();
  });
  return socket;
}

describe("isTmuxSessionAlive", () => {
  beforeEach(() => {
    execFileSyncSpy.mockReset();
  });

  it("returns true when tmux session exists (exit code 0)", () => {
    execFileSyncSpy.mockReturnValue(Buffer.from(""));
    expect(isTmuxSessionAlive("issuectl-repo-42")).toBe(true);
    expect(execFileSyncSpy).toHaveBeenCalledWith(
      "tmux", ["has-session", "-t", "issuectl-repo-42"],
      expect.objectContaining({ stdio: "ignore", timeout: 10_000 }),
    );
  });

  it("returns false when tmux session does not exist (exit code 1)", () => {
    execFileSyncSpy.mockImplementation(() => {
      throw Object.assign(new Error("session not found"), { status: 1 });
    });
    expect(isTmuxSessionAlive("issuectl-repo-42")).toBe(false);
  });

  it("returns false when tmux is not installed (ENOENT)", () => {
    execFileSyncSpy.mockImplementation(() => {
      throw Object.assign(new Error("not found"), { code: "ENOENT" });
    });
    expect(isTmuxSessionAlive("issuectl-repo-42")).toBe(false);
  });

  it("throws on unexpected errors (ETIMEDOUT) to prevent false 'dead' cascades", () => {
    execFileSyncSpy.mockImplementation(() => {
      throw Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
    });
    expect(() => isTmuxSessionAlive("issuectl-repo-42")).toThrow(
      'tmux has-session failed unexpectedly for "issuectl-repo-42"',
    );
  });

  it("throws on unexpected errors (EPERM) to prevent false 'dead' cascades", () => {
    execFileSyncSpy.mockImplementation(() => {
      throw Object.assign(new Error("EPERM"), { code: "EPERM" });
    });
    expect(() => isTmuxSessionAlive("issuectl-repo-42")).toThrow(
      "tmux has-session failed unexpectedly",
    );
  });

  it("preserves original error as cause when throwing", () => {
    const original = Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
    execFileSyncSpy.mockImplementation(() => {
      throw original;
    });
    try {
      isTmuxSessionAlive("issuectl-repo-42");
    } catch (err) {
      expect((err as Error).cause).toBe(original);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  allocatePort                                                       */
/* ------------------------------------------------------------------ */

describe("allocatePort", () => {
  beforeEach(() => {
    netConnectSpy.mockReset();
  });

  it("returns 7700 when no ports are in use", async () => {
    const db = makeFakeDb([]);
    // All probes fail → port is free.
    netConnectSpy.mockImplementation(() => fakeSocket("error"));

    const port = await allocatePort(db);
    expect(port).toBe(7700);
  });

  it("skips ports used by active deployments", async () => {
    const db = makeFakeDb([{ ttyd_port: 7700 }, { ttyd_port: 7701 }]);
    netConnectSpy.mockImplementation(() => fakeSocket("error"));

    const port = await allocatePort(db);
    expect(port).toBe(7702);
  });

  it("skips ports that are in use (TCP probe succeeds)", async () => {
    const db = makeFakeDb([]);
    // First probe succeeds (port in use), rest fail.
    let callCount = 0;
    netConnectSpy.mockImplementation(() => {
      callCount++;
      return fakeSocket(callCount === 1 ? "connect" : "error");
    });

    const port = await allocatePort(db);
    expect(port).toBe(7701);
  });

  it("throws when all 100 ports are taken", async () => {
    // All ports claimed in DB.
    const allPorts = Array.from({ length: 100 }, (_, i) => ({
      ttyd_port: 7700 + i,
    }));
    const db = makeFakeDb(allPorts);

    await expect(allocatePort(db)).rejects.toThrow(
      "All ttyd ports (7700–7799) are in use",
    );
  });
});
