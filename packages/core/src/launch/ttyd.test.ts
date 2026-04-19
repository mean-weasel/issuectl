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

// Import after mocks are in place.
import {
  verifyTtyd,
  killTtyd,
  isTtydAlive,
  allocatePort,
  spawnTtyd,
  reconcileOrphanedDeployments,
} from "./ttyd.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  verifyTtyd                                                         */
/* ------------------------------------------------------------------ */

describe("verifyTtyd", () => {
  beforeEach(() => {
    execFileSyncSpy.mockReset();
  });

  it("does not throw when ttyd is found", () => {
    execFileSyncSpy.mockReturnValue(Buffer.from("/usr/local/bin/ttyd\n"));
    expect(() => verifyTtyd()).not.toThrow();
    expect(execFileSyncSpy).toHaveBeenCalledWith("which", ["ttyd"], {
      stdio: "ignore",
    });
  });

  it("throws with install hint when ttyd is not found", () => {
    execFileSyncSpy.mockImplementation(() => {
      throw new Error("not found");
    });
    expect(() => verifyTtyd()).toThrow(
      "ttyd is not installed. Run: brew install ttyd",
    );
  });
});

/* ------------------------------------------------------------------ */
/*  killTtyd                                                           */
/* ------------------------------------------------------------------ */

describe("killTtyd", () => {
  it("sends SIGTERM to the given PID", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    killTtyd(12345);
    expect(killSpy).toHaveBeenCalledWith(12345, "SIGTERM");
    killSpy.mockRestore();
  });

  it("handles ESRCH gracefully (already dead)", () => {
    const err = Object.assign(new Error("No such process"), { code: "ESRCH" });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw err;
    });
    expect(() => killTtyd(99999)).not.toThrow();
    killSpy.mockRestore();
  });

  it("re-throws non-ESRCH errors", () => {
    const err = Object.assign(new Error("EPERM"), { code: "EPERM" });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw err;
    });
    expect(() => killTtyd(1)).toThrow("EPERM");
    killSpy.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/*  isTtydAlive                                                        */
/* ------------------------------------------------------------------ */

describe("isTtydAlive", () => {
  it("returns true when the process exists", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    expect(isTtydAlive(12345)).toBe(true);
    expect(killSpy).toHaveBeenCalledWith(12345, 0);
    killSpy.mockRestore();
  });

  it("returns false when the process does not exist", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
    });
    expect(isTtydAlive(99999)).toBe(false);
    killSpy.mockRestore();
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

/* ------------------------------------------------------------------ */
/*  spawnTtyd                                                          */
/* ------------------------------------------------------------------ */

describe("spawnTtyd", () => {
  beforeEach(() => {
    spawnSpy.mockReset();
  });

  it("spawns ttyd with correct arguments and returns PID + port", () => {
    const unrefSpy = vi.fn();
    spawnSpy.mockReturnValue({ pid: 42, unref: unrefSpy });

    const result = spawnTtyd({
      port: 7700,
      workspacePath: "/home/user/project",
      contextFilePath: "/tmp/ctx.md",
      claudeCommand: "claude --dangerously-skip-permissions",
    });

    expect(result).toEqual({ pid: 42, port: 7700 });
    expect(unrefSpy).toHaveBeenCalled();

    // Verify spawn arguments.
    const [bin, args, opts] = spawnSpy.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(bin).toBe("ttyd");
    expect(args[0]).toBe("-W");
    expect(args[1]).toBe("-p");
    expect(args[2]).toBe("7700");
    expect(args[3]).toBe("-q");
    expect(args[4]).toBe("/bin/bash");
    expect(args[5]).toBe("-lic");
    // Shell command should contain escaped paths and the claude command.
    expect(args[6]).toContain("cd '/home/user/project'");
    expect(args[6]).toContain("cat '/tmp/ctx.md'");
    expect(args[6]).toContain("claude --dangerously-skip-permissions");
    expect(args[6]).toContain("; exit");
    expect(opts).toEqual({ detached: true, stdio: "ignore" });
  });

  it("escapes paths with single quotes", () => {
    spawnSpy.mockReturnValue({ pid: 1, unref: vi.fn() });

    spawnTtyd({
      port: 7700,
      workspacePath: "/home/user/it's a project",
      contextFilePath: "/tmp/file.md",
      claudeCommand: "claude",
    });

    const shellCmd = (spawnSpy.mock.calls[0] as [string, string[]])[1][6];
    expect(shellCmd).toContain("cd '/home/user/it'\\''s a project'");
  });

  it("throws when no PID is returned", () => {
    spawnSpy.mockReturnValue({ pid: undefined, unref: vi.fn() });

    expect(() =>
      spawnTtyd({
        port: 7700,
        workspacePath: "/tmp",
        contextFilePath: "/tmp/ctx.md",
        claudeCommand: "claude",
      }),
    ).toThrow("Failed to spawn ttyd: no PID returned");
  });
});

/* ------------------------------------------------------------------ */
/*  reconcileOrphanedDeployments                                       */
/* ------------------------------------------------------------------ */

describe("reconcileOrphanedDeployments", () => {
  it("marks dead deployments as ended", () => {
    // pid 111 is dead, pid 222 is alive.
    const killSpy = vi.spyOn(process, "kill").mockImplementation((pid) => {
      if (pid === 111) throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
      return true;
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const runSpy = vi.fn();
    const db = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => [
          { id: 1, ttyd_pid: 111 },
          { id: 2, ttyd_pid: 222 },
        ]),
        run: runSpy,
      })),
    } as unknown as Database.Database;

    reconcileOrphanedDeployments(db);

    // The UPDATE should be called once for the dead process (id=1).
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Reconciled orphaned deployment 1"),
    );

    killSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("does nothing when all deployments are alive", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    const runSpy = vi.fn();
    const db = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => [{ id: 1, ttyd_pid: 100 }]),
        run: runSpy,
      })),
    } as unknown as Database.Database;

    reconcileOrphanedDeployments(db);

    // run should never be called because the process is alive
    expect(runSpy).not.toHaveBeenCalled();

    killSpy.mockRestore();
  });
});
