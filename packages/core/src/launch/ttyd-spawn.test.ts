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

  it("spawns ttyd with correct arguments and returns PID + port", async () => {
    const unrefSpy = vi.fn();
    spawnSpy.mockReturnValue({ pid: 42, unref: unrefSpy, on: vi.fn() });
    // Health check — isTtydAlive calls process.kill(pid, 0)
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    const result = await spawnTtyd({
      port: 7700,
      workspacePath: "/home/user/project",
      contextFilePath: "/tmp/ctx.md",
      agentCommand: "claude --dangerously-skip-permissions",
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
    expect(tmuxArgs.slice(0, 8)).toEqual([
      "new-session", "-d", "-x", "40", "-y", "24", "-s", "issuectl-myrepo-42",
    ]);
    // The shell command passed to tmux redirects the context into the agent
    const tmuxCmd = tmuxArgs[8];
    expect(tmuxCmd).toContain("bash -lic");
    expect(tmuxCmd).toContain("/home/user/project");
    expect(tmuxCmd).toContain("/tmp/ctx.md");
    expect(tmuxCmd).toContain("claude --dangerously-skip-permissions");
    expect(tmuxCmd).toContain("unset PNPM_SCRIPT_SRC_DIR");
    expect(tmuxCmd).not.toContain("unset GH_TOKEN");
    expect(tmuxCmd).not.toContain("; ;");
    expect(tmuxCmd).toContain("< ");
    expect(tmuxCmd).toContain("; exit");

    // tmux session options (with timeout)
    expect(execFileSyncSpy).toHaveBeenCalledWith("tmux", [
      "set-option", "-t", "issuectl-myrepo-42", "status", "off",
    ], { timeout: 10_000 });
    expect(execFileSyncSpy).toHaveBeenCalledWith("tmux", [
      "set-option", "-t", "issuectl-myrepo-42", "window-size", "largest",
    ], { timeout: 10_000 });

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

  it("scrubs ambient GitHub and SSH credentials for untrusted webhook sessions", async () => {
    spawnSpy.mockReturnValue({ pid: 42, unref: vi.fn(), on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    await spawnTtyd({
      port: 7700,
      workspacePath: "/home/user/project",
      contextFilePath: "/tmp/ctx.md",
      agentCommand: "claude",
      sessionName: "issuectl-webhook-42",
      credentialPolicy: "scrubbed",
    });

    const tmuxCmd = execFileSyncSpy.mock.calls.find(
      (c: unknown[]) => c[0] === "tmux" && (c[1] as string[])[0] === "new-session",
    )![1][8] as string;
    expect(tmuxCmd).toContain("unset GH_TOKEN GITHUB_TOKEN GITHUB_PAT");
    expect(tmuxCmd).toContain("unset SSH_AUTH_SOCK GIT_ASKPASS SSH_ASKPASS");
    expect(tmuxCmd).toContain("export GH_CONFIG_DIR=");
    expect(tmuxCmd).toContain("mktemp -d");
    expect(tmuxCmd).toContain("export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1");
    expect(tmuxCmd).toContain("export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never");
    killSpy.mockRestore();
  });

  it("passes context as an argument for interactive Codex launches", async () => {
    spawnSpy.mockReturnValue({ pid: 42, unref: vi.fn(), on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    await spawnTtyd({
      port: 7700,
      workspacePath: "/home/user/project",
      contextFilePath: "/tmp/ctx.md",
      agentCommand: "codex --sandbox danger-full-access --ask-for-approval never",
      agentInputMode: "argument",
      sessionName: "issuectl-myrepo-43",
    });

    const tmuxCmd = execFileSyncSpy.mock.calls.find(
      (c: unknown[]) => c[0] === "tmux" && (c[1] as string[])[0] === "new-session",
    )![1][8] as string;
    expect(tmuxCmd).toContain("codex --sandbox danger-full-access --ask-for-approval never");
    expect(tmuxCmd).toContain("$(cat ");
    expect(tmuxCmd).toContain("/tmp/ctx.md");
    expect(tmuxCmd).not.toContain(" | codex");
    killSpy.mockRestore();
  });

  it("binds ttyd to loopback interface (-i 127.0.0.1)", async () => {
    spawnSpy.mockReturnValue({ pid: 42, unref: vi.fn(), on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    await spawnTtyd({
      port: 7700,
      workspacePath: "/tmp/ws",
      contextFilePath: "/tmp/ctx.md",
      agentCommand: "claude",
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
      agentCommand: "claude",
      sessionName: "issuectl-test-2",
    });

    // The escaped path ends up in the tmux new-session command string.
    // It goes through shellEscape twice: once for the inner command,
    // once when wrapping in bash -lic, so the quote escaping is doubled.
    const tmuxCmd = execFileSyncSpy.mock.calls.find(
      (c: unknown[]) => c[0] === "tmux" && (c[1] as string[])[0] === "new-session",
    )![1][8] as string;
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
      agentCommand: "claude",
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
        agentCommand: "claude",
        sessionName: "issuectl-test-dup",
      }),
    ).rejects.toThrow("duplicate session: issuectl-test-dup");

    // ttyd should NOT have been spawned
    expect(spawnSpy).not.toHaveBeenCalled();
  });
});
