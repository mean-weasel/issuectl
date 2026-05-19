import { describe, it, expect, vi, beforeEach } from "vitest";

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

import type Database from "better-sqlite3";
import { respawnTtyd, reconcileOrphanedDeployments } from "./ttyd.js";

describe("respawnTtyd", () => {
  beforeEach(() => {
    spawnSpy.mockReset();
    execFileSyncSpy.mockReset();
  });

  it("spawns ttyd against existing tmux session and returns new PID", async () => {
    const unrefSpy = vi.fn();
    spawnSpy.mockReturnValue({ pid: 88, unref: unrefSpy, on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    const result = await respawnTtyd(7700, "issuectl-repo-42");

    expect(result).toEqual({ pid: 88 });
    expect(unrefSpy).toHaveBeenCalled();

    const [bin, args, opts] = spawnSpy.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(bin).toBe("ttyd");
    expect(args).toEqual([
      "-W", "-i", "127.0.0.1", "-p", "7700", "-q",
      "tmux", "attach-session", "-t", "issuectl-repo-42",
    ]);
    expect(opts).toEqual({ detached: true, stdio: "ignore" });
    killSpy.mockRestore();
  });

  it("does NOT create a new tmux session", async () => {
    spawnSpy.mockReturnValue({ pid: 88, unref: vi.fn(), on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    await respawnTtyd(7700, "issuectl-repo-42");

    // execFileSync should NOT have been called (no tmux new-session)
    expect(execFileSyncSpy).not.toHaveBeenCalled();
    killSpy.mockRestore();
  });

  it("throws when ttyd dies immediately after respawn", async () => {
    spawnSpy.mockReturnValue({ pid: 99, unref: vi.fn(), on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
    });

    await expect(respawnTtyd(7700, "issuectl-repo-42")).rejects.toThrow(
      "ttyd process 99 died immediately after respawn",
    );
    killSpy.mockRestore();
  });

  it("throws when no PID is returned", async () => {
    spawnSpy.mockReturnValue({ pid: undefined, unref: vi.fn(), on: vi.fn() });

    await expect(respawnTtyd(7700, "issuectl-repo-42")).rejects.toThrow(
      "Failed to respawn ttyd: no PID returned",
    );
  });

  it("rejects invalid session names containing dots or colons", async () => {
    await expect(respawnTtyd(7700, "issuectl-my.project-42")).rejects.toThrow(
      "Invalid tmux session name",
    );

    // spawn should never have been called
    expect(spawnSpy).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  reconcileOrphanedDeployments                                       */
/* ------------------------------------------------------------------ */

describe("reconcileOrphanedDeployments", () => {
  beforeEach(() => {
    execFileSyncSpy.mockReset();
  });

  it("marks deployments as ended only when tmux session is gone", () => {
    // Session "issuectl-repoA-10" is alive, "issuectl-repoB-20" is dead.
    execFileSyncSpy.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "has-session" && args[2] === "issuectl-repoA-10") {
        return Buffer.from("");
      }
      throw Object.assign(new Error("session not found"), { status: 1 });
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const runSpy = vi.fn();
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("SELECT")) {
          return {
            all: vi.fn(() => [
              { id: 1, issue_number: 10, repo_name: "repoA" },
              { id: 2, issue_number: 20, repo_name: "repoB" },
            ]),
          };
        }
        return { run: runSpy };
      }),
    } as unknown as Database.Database;

    reconcileOrphanedDeployments(db);

    // Only deployment 2 should be ended (tmux session gone).
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Reconciled orphaned deployment 2"),
    );

    warnSpy.mockRestore();
  });

  it("does nothing when all tmux sessions are alive", () => {
    execFileSyncSpy.mockReturnValue(Buffer.from(""));

    const runSpy = vi.fn();
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("SELECT")) {
          return {
            all: vi.fn(() => [
              { id: 1, issue_number: 10, repo_name: "repoA" },
            ]),
          };
        }
        return { run: runSpy };
      }),
    } as unknown as Database.Database;

    reconcileOrphanedDeployments(db);

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("only queries deployments that have a ttyd_pid (excludes pending)", () => {
    execFileSyncSpy.mockReturnValue(Buffer.from(""));

    const prepareSpy = vi.fn((sql: string) => {
      if (sql.includes("SELECT")) {
        return { all: vi.fn(() => []) };
      }
      return { run: vi.fn() };
    });
    const db = { prepare: prepareSpy } as unknown as Database.Database;

    reconcileOrphanedDeployments(db);

    const selectCall = prepareSpy.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("SELECT"),
    );
    expect(selectCall).toBeDefined();
    expect(selectCall![0]).toContain("ttyd_pid IS NOT NULL");
  });

  it("logs error and does not throw when query fails", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = {
      prepare: vi.fn(() => {
        throw new Error("DB locked");
      }),
    } as unknown as Database.Database;

    // Should not throw
    expect(() => reconcileOrphanedDeployments(db)).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      "[issuectl] Failed to query deployments for reconciliation:",
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("continues reconciling other rows when one row fails (per-row isolation)", () => {
    // Row 1 causes isTmuxSessionAlive to throw (ETIMEDOUT), row 2 is dead.
    execFileSyncSpy.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "has-session" && args[2] === "issuectl-repoA-10") {
        throw Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
      }
      // repoB session is gone (exit code 1)
      throw Object.assign(new Error("session not found"), { status: 1 });
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const runSpy = vi.fn();
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("SELECT")) {
          return {
            all: vi.fn(() => [
              { id: 1, issue_number: 10, repo_name: "repoA" },
              { id: 2, issue_number: 20, repo_name: "repoB" },
            ]),
          };
        }
        return { run: runSpy };
      }),
    } as unknown as Database.Database;

    reconcileOrphanedDeployments(db);

    // Row 1 should have failed (logged), row 2 should still be reconciled.
    expect(errorSpy).toHaveBeenCalledWith(
      "[issuectl] Failed to reconcile deployment 1:",
      expect.any(Error),
    );
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith(2);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
