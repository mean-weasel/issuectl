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

  it("does not throw when ttyd and tmux are found", () => {
    execFileSyncSpy.mockReturnValue(Buffer.from("/usr/local/bin/ttyd\n"));
    expect(() => verifyTtyd()).not.toThrow();
    expect(execFileSyncSpy).toHaveBeenCalledWith("which", ["ttyd"], {
      stdio: "ignore",
    });
    expect(execFileSyncSpy).toHaveBeenCalledWith("which", ["tmux"], {
      stdio: "ignore",
    });
  });

  it("throws with install hint when ttyd is missing", () => {
    execFileSyncSpy.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "ttyd") throw Object.assign(new Error("not found"), { status: 1 });
      return Buffer.from("/usr/local/bin/tmux\n");
    });
    expect(() => verifyTtyd()).toThrow(
      "ttyd is not installed. Run: brew install ttyd",
    );
  });

  it("throws with install hint when tmux is missing", () => {
    execFileSyncSpy.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "tmux") throw Object.assign(new Error("not found"), { status: 1 });
      return Buffer.from("/usr/local/bin/ttyd\n");
    });
    expect(() => verifyTtyd()).toThrow(
      "tmux is not installed. Run: brew install tmux",
    );
  });

  it("throws with install hint when which binary is missing (ENOENT)", () => {
    execFileSyncSpy.mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    expect(() => verifyTtyd()).toThrow(
      "ttyd is not installed. Run: brew install ttyd",
    );
  });

  it("throws a generic verification error for unexpected failures", () => {
    execFileSyncSpy.mockImplementation(() => {
      throw Object.assign(new Error("permission denied"), { code: "EACCES", status: 126 });
    });
    expect(() => verifyTtyd()).toThrow(
      "Failed to verify ttyd installation: permission denied",
    );
    expect(() => verifyTtyd()).not.toThrow("not installed");
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

  it("kills tmux session when sessionName is provided", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    execFileSyncSpy.mockReturnValue(Buffer.from(""));

    killTtyd(12345, "issuectl-repo-42");

    expect(killSpy).toHaveBeenCalledWith(12345, "SIGTERM");
    expect(execFileSyncSpy).toHaveBeenCalledWith("tmux", [
      "kill-session", "-t", "issuectl-repo-42",
    ], { stdio: "ignore" });
    killSpy.mockRestore();
  });

  it("does not call tmux when sessionName is omitted", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    execFileSyncSpy.mockReset();

    killTtyd(12345);

    expect(execFileSyncSpy).not.toHaveBeenCalled();
    killSpy.mockRestore();
  });

  it("ignores tmux kill-session failure (session already gone)", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    execFileSyncSpy.mockImplementation(() => {
      throw new Error("session not found: issuectl-repo-42");
    });

    // Should not throw despite tmux failure
    expect(() => killTtyd(12345, "issuectl-repo-42")).not.toThrow();
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

  it("returns true when the process is owned by another user (EPERM)", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("EPERM"), { code: "EPERM" });
    });
    expect(isTtydAlive(1)).toBe(true);
    killSpy.mockRestore();
  });

  it("re-throws unexpected errors", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("EINVAL"), { code: "EINVAL" });
    });
    expect(() => isTtydAlive(1)).toThrow("EINVAL");
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
    execFileSyncSpy.mockReset();
    // execFileSync is used for tmux calls in spawnTtyd — default to no-op
    execFileSyncSpy.mockReturnValue(Buffer.from(""));
  });

  it("spawns ttyd with correct arguments and returns PID + port", async () => {
    const unrefSpy = vi.fn();
    spawnSpy.mockReturnValue({ pid: 42, unref: unrefSpy, on: vi.fn() });
    // Health check — isTtydAlive calls process.kill(pid, 0)
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    const result = await spawnTtyd({
      port: 7700,
      workspacePath: "/home/user/project",
      contextFilePath: "/tmp/ctx.md",
      claudeCommand: "claude --dangerously-skip-permissions",
      sessionName: "issuectl-myrepo-42",
    });

    expect(result).toEqual({ pid: 42, port: 7700 });
    expect(unrefSpy).toHaveBeenCalled();

    // tmux session should be created first via execFileSync
    const tmuxCall = execFileSyncSpy.mock.calls.find(
      (c: unknown[]) => c[0] === "tmux" && (c[1] as string[])[0] === "new-session",
    )!;
    expect(tmuxCall).toBeDefined();
    const tmuxArgs = tmuxCall[1] as string[];
    expect(tmuxArgs.slice(0, 4)).toEqual(["new-session", "-d", "-s", "issuectl-myrepo-42"]);
    // The shell command passed to tmux contains the full pipeline
    const tmuxCmd = tmuxArgs[4];
    expect(tmuxCmd).toContain("bash -lic");
    expect(tmuxCmd).toContain("/home/user/project");
    expect(tmuxCmd).toContain("/tmp/ctx.md");
    expect(tmuxCmd).toContain("claude --dangerously-skip-permissions");
    expect(tmuxCmd).toContain("; exit");

    // tmux session options
    expect(execFileSyncSpy).toHaveBeenCalledWith("tmux", [
      "set-option", "-t", "issuectl-myrepo-42", "status", "off",
    ]);
    expect(execFileSyncSpy).toHaveBeenCalledWith("tmux", [
      "set-option", "-t", "issuectl-myrepo-42", "window-size", "largest",
    ]);

    // ttyd serves tmux attach (not bash -lic)
    const [bin, args, opts] = spawnSpy.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(bin).toBe("ttyd");
    expect(args).toEqual([
      "-W", "-i", "127.0.0.1", "-p", "7700", "-q",
      "tmux", "attach-session", "-t", "issuectl-myrepo-42",
    ]);
    expect(opts).toEqual({ detached: true, stdio: "ignore" });
    killSpy.mockRestore();
  });

  it("binds ttyd to loopback interface (-i 127.0.0.1)", async () => {
    spawnSpy.mockReturnValue({ pid: 42, unref: vi.fn(), on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    await spawnTtyd({
      port: 7700,
      workspacePath: "/tmp/ws",
      contextFilePath: "/tmp/ctx.md",
      claudeCommand: "claude",
      sessionName: "issuectl-test-1",
    });

    const args = (spawnSpy.mock.calls[0] as [string, string[]])[1];
    expect(args).toContain("-i");
    expect(args).toContain("127.0.0.1");
    const iIdx = args.indexOf("-i");
    expect(args[iIdx + 1]).toBe("127.0.0.1");
    expect(iIdx).toBeLessThan(args.indexOf("-p"));
    killSpy.mockRestore();
  });

  it("escapes paths with single quotes", async () => {
    spawnSpy.mockReturnValue({ pid: 1, unref: vi.fn(), on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    await spawnTtyd({
      port: 7700,
      workspacePath: "/home/user/it's a project",
      contextFilePath: "/tmp/file.md",
      claudeCommand: "claude",
      sessionName: "issuectl-test-2",
    });

    // The escaped path ends up in the tmux new-session command string.
    // It goes through shellEscape twice: once for the inner command,
    // once when wrapping in bash -lic, so the quote escaping is doubled.
    const tmuxCmd = execFileSyncSpy.mock.calls.find(
      (c: unknown[]) => c[0] === "tmux" && (c[1] as string[])[0] === "new-session",
    )![1][4] as string;
    expect(tmuxCmd).toContain("it");
    expect(tmuxCmd).toContain("s a project");
    killSpy.mockRestore();
  });

  it("creates tmux session before spawning ttyd", async () => {
    const callOrder: string[] = [];
    execFileSyncSpy.mockImplementation((cmd: string) => {
      if (cmd === "tmux") callOrder.push("tmux");
      return Buffer.from("");
    });
    spawnSpy.mockImplementation(() => {
      callOrder.push("spawn");
      return { pid: 1, unref: vi.fn(), on: vi.fn() };
    });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    await spawnTtyd({
      port: 7700,
      workspacePath: "/tmp",
      contextFilePath: "/tmp/ctx.md",
      claudeCommand: "claude",
      sessionName: "issuectl-test-order",
    });

    // All 3 tmux calls (new-session, set status, set window-size) must
    // happen before the ttyd spawn so clients can attach immediately.
    expect(callOrder).toEqual(["tmux", "tmux", "tmux", "spawn"]);
    killSpy.mockRestore();
  });

  it("propagates tmux new-session failure", async () => {
    execFileSyncSpy.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "tmux" && args[0] === "new-session") {
        throw new Error("duplicate session: issuectl-test-dup");
      }
      return Buffer.from("");
    });

    await expect(
      spawnTtyd({
        port: 7700,
        workspacePath: "/tmp",
        contextFilePath: "/tmp/ctx.md",
        claudeCommand: "claude",
        sessionName: "issuectl-test-dup",
      }),
    ).rejects.toThrow("duplicate session: issuectl-test-dup");

    // ttyd should NOT have been spawned
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it("uses session name in tmux attach command for ttyd", async () => {
    spawnSpy.mockReturnValue({ pid: 1, unref: vi.fn(), on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    await spawnTtyd({
      port: 7700,
      workspacePath: "/tmp",
      contextFilePath: "/tmp/ctx.md",
      claudeCommand: "claude",
      sessionName: "issuectl-special-chars-99",
    });

    const args = (spawnSpy.mock.calls[0] as [string, string[]])[1];
    // The last 3 args should be the tmux attach command
    expect(args.slice(-3)).toEqual([
      "attach-session", "-t", "issuectl-special-chars-99",
    ]);
    killSpy.mockRestore();
  });

  it("throws when no PID is returned", async () => {
    spawnSpy.mockReturnValue({ pid: undefined, unref: vi.fn(), on: vi.fn() });

    await expect(
      spawnTtyd({
        port: 7700,
        workspacePath: "/tmp",
        contextFilePath: "/tmp/ctx.md",
        claudeCommand: "claude",
        sessionName: "issuectl-test-3",
      }),
    ).rejects.toThrow("Failed to spawn ttyd: no PID returned");
  });

  it("throws when process dies immediately after spawn", async () => {
    spawnSpy.mockReturnValue({ pid: 99, unref: vi.fn(), on: vi.fn() });
    // Health check — process is dead
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
    });

    await expect(
      spawnTtyd({
        port: 7700,
        workspacePath: "/tmp",
        contextFilePath: "/tmp/ctx.md",
        claudeCommand: "claude",
        sessionName: "issuectl-test-4",
      }),
    ).rejects.toThrow(
      "ttyd process 99 died immediately after spawn",
    );
    killSpy.mockRestore();
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
