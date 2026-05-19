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

import { verifyTtyd, killTtyd, isTtydAlive, tmuxSessionName } from "./ttyd.js";

describe("tmuxSessionName", () => {
  it("produces a predictable name from repo and issue number", () => {
    expect(tmuxSessionName("api", 42)).toBe("issuectl-api-42");
  });

  it("replaces dots with underscores (tmux interprets dots as pane delimiters)", () => {
    expect(tmuxSessionName("my.project", 7)).toBe("issuectl-my_project-7");
  });

  it("replaces colons with underscores (tmux interprets colons as window delimiters)", () => {
    expect(tmuxSessionName("my:repo", 1)).toBe("issuectl-my_repo-1");
  });

  it("passes through hyphens and underscores unchanged", () => {
    expect(tmuxSessionName("my-repo_v2", 99)).toBe("issuectl-my-repo_v2-99");
  });
});

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
    ], { stdio: "ignore", timeout: 10_000 });
    killSpy.mockRestore();
  });

  it("does not call tmux when sessionName is omitted", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    execFileSyncSpy.mockReset();

    killTtyd(12345);

    expect(execFileSyncSpy).not.toHaveBeenCalled();
    killSpy.mockRestore();
  });

  it("escalates to SIGKILL when ttyd remains alive after SIGTERM", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    killTtyd(12345);

    expect(killSpy).toHaveBeenCalledWith(12345, "SIGTERM");
    expect(killSpy).toHaveBeenCalledWith(12345, 0);
    expect(killSpy).toHaveBeenCalledWith(12345, "SIGKILL");
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

  it("cleans up tmux session even when process is already dead (ESRCH)", () => {
    const err = Object.assign(new Error("No such process"), { code: "ESRCH" });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw err;
    });
    execFileSyncSpy.mockReturnValue(Buffer.from(""));

    expect(() => killTtyd(99999, "issuectl-repo-42")).not.toThrow();
    expect(execFileSyncSpy).toHaveBeenCalledWith(
      "tmux",
      ["kill-session", "-t", "issuectl-repo-42"],
      expect.objectContaining({ stdio: "ignore" }),
    );
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
