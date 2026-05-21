import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildClaudeCommand, buildLaunchAgentCommand } from "./launch.js";

describe("buildClaudeCommand", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns 'claude' for undefined", () => {
    expect(buildClaudeCommand(undefined)).toMatch(/(^|\/)claude$/);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns 'claude' for empty string", () => {
    expect(buildClaudeCommand("")).toMatch(/(^|\/)claude$/);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns 'claude' for whitespace-only string", () => {
    expect(buildClaudeCommand("   ")).toMatch(/(^|\/)claude$/);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("appends trimmed extra args for a normal value", () => {
    expect(buildClaudeCommand("--dangerously-skip-permissions")).toMatch(
      /(^|\/)claude --dangerously-skip-permissions$/,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("appends multiple args", () => {
    expect(buildClaudeCommand("--verbose --model opus")).toMatch(/(^|\/)claude --verbose --model opus$/);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace before composing", () => {
    expect(buildClaudeCommand("  --verbose  ")).toMatch(/(^|\/)claude --verbose$/);
  });

  it("falls back to 'claude' and warns on semicolon (tampered DB)", () => {
    expect(buildClaudeCommand("--foo; rm -rf /")).toMatch(/(^|\/)claude$/);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/metacharacters/i);
  });

  it("falls back on backtick", () => {
    expect(buildClaudeCommand("`evil`")).toMatch(/(^|\/)claude$/);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on $ variable", () => {
    expect(buildClaudeCommand("--append $HOME")).toMatch(/(^|\/)claude$/);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on && operator", () => {
    expect(buildClaudeCommand("--foo && --bar")).toMatch(/(^|\/)claude$/);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on pipe", () => {
    expect(buildClaudeCommand("--foo | cat")).toMatch(/(^|\/)claude$/);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on redirect", () => {
    expect(buildClaudeCommand("--foo > out.txt")).toMatch(/(^|\/)claude$/);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on newline (injection attempt)", () => {
    expect(buildClaudeCommand("--foo\nrm -rf /")).toMatch(/(^|\/)claude$/);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on parentheses", () => {
    expect(buildClaudeCommand("(echo hi)")).toMatch(/(^|\/)claude$/);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe("buildLaunchAgentCommand", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("builds a plain codex command with no args", () => {
    expect(buildLaunchAgentCommand("codex", undefined)).toMatch(/(^|\/)codex$/);
  });

  it("appends codex args", () => {
    expect(buildLaunchAgentCommand("codex", "--model gpt-5 --full-auto")).toMatch(
      /(^|\/)codex --model gpt-5 --full-auto$/,
    );
  });

  it("falls back to plain codex for dangerous stored args", () => {
    expect(buildLaunchAgentCommand("codex", "--model gpt-5; rm -rf /")).toMatch(/(^|\/)codex$/);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("codex_extra_args"));
  });
});
