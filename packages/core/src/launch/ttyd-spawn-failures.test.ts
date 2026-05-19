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

import { spawnTtyd } from "./ttyd.js";

describe("spawnTtyd", () => {
  beforeEach(() => {
    spawnSpy.mockReset();
    execFileSyncSpy.mockReset();
    // execFileSync is used for tmux calls in spawnTtyd — default to no-op
    execFileSyncSpy.mockReturnValue(Buffer.from(""));
  });

  it("uses session name in tmux attach command for ttyd", async () => {
    spawnSpy.mockReturnValue({ pid: 1, unref: vi.fn(), on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    await spawnTtyd({
      port: 7700,
      workspacePath: "/tmp",
      contextFilePath: "/tmp/ctx.md",
      agentCommand: "claude",
      sessionName: "issuectl-special-chars-99",
    });

    const args = (spawnSpy.mock.calls[0] as [string, string[]])[1];
    // The last 3 args should be the tmux attach command
    expect(args.slice(-3)).toEqual([
      "attach-session", "-t", "issuectl-special-chars-99",
    ]);
    killSpy.mockRestore();
  });

  it("rejects invalid session names containing dots or colons", async () => {
    await expect(
      spawnTtyd({
        port: 7700,
        workspacePath: "/tmp",
        contextFilePath: "/tmp/ctx.md",
        agentCommand: "claude",
        sessionName: "issuectl-my.project-42",
      }),
    ).rejects.toThrow("Invalid tmux session name");

    expect(execFileSyncSpy).not.toHaveBeenCalledWith(
      "tmux", expect.arrayContaining(["new-session"]), expect.anything(),
    );
  });

  it("cleans up tmux session when set-option fails", async () => {
    const tmuxCalls: string[][] = [];
    execFileSyncSpy.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "tmux") {
        tmuxCalls.push(args);
        if (args[0] === "set-option" && args[3] === "status") {
          throw new Error("tmux set-option failed");
        }
      }
      return Buffer.from("");
    });

    await expect(
      spawnTtyd({
        port: 7700,
        workspacePath: "/tmp",
        contextFilePath: "/tmp/ctx.md",
        agentCommand: "claude",
        sessionName: "issuectl-test-cleanup",
      }),
    ).rejects.toThrow("tmux set-option failed");

    // tmux kill-session should have been called for cleanup
    const killCall = tmuxCalls.find((args) => args[0] === "kill-session");
    expect(killCall).toBeDefined();
    expect(killCall![2]).toBe("issuectl-test-cleanup");
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it("cleans up tmux session when health check fails (ttyd dies)", async () => {
    spawnSpy.mockReturnValue({ pid: 99, unref: vi.fn(), on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
    });

    await expect(
      spawnTtyd({
        port: 7700,
        workspacePath: "/tmp",
        contextFilePath: "/tmp/ctx.md",
        agentCommand: "claude",
        sessionName: "issuectl-test-health",
      }),
    ).rejects.toThrow("ttyd process 99 died immediately after spawn");

    // tmux kill-session should have been called for cleanup
    expect(execFileSyncSpy).toHaveBeenCalledWith(
      "tmux", ["kill-session", "-t", "issuectl-test-health"],
      expect.objectContaining({ stdio: "ignore" }),
    );
    killSpy.mockRestore();
  });

  it("throws when no PID is returned", async () => {
    spawnSpy.mockReturnValue({ pid: undefined, unref: vi.fn(), on: vi.fn() });

    await expect(
      spawnTtyd({
        port: 7700,
        workspacePath: "/tmp",
        contextFilePath: "/tmp/ctx.md",
        agentCommand: "claude",
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
        agentCommand: "claude",
        sessionName: "issuectl-test-4",
      }),
    ).rejects.toThrow(
      "ttyd process 99 died immediately after spawn",
    );
    killSpy.mockRestore();
  });
});
