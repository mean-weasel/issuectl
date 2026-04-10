import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildClaudeCommand } from "./launch.js";

describe("buildClaudeCommand", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns 'claude' for undefined", () => {
    expect(buildClaudeCommand(undefined)).toBe("claude");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns 'claude' for empty string", () => {
    expect(buildClaudeCommand("")).toBe("claude");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns 'claude' for whitespace-only string", () => {
    expect(buildClaudeCommand("   ")).toBe("claude");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("appends trimmed extra args for a normal value", () => {
    expect(buildClaudeCommand("--dangerously-skip-permissions")).toBe(
      "claude --dangerously-skip-permissions",
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("appends multiple args", () => {
    expect(buildClaudeCommand("--verbose --model opus")).toBe("claude --verbose --model opus");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace before composing", () => {
    expect(buildClaudeCommand("  --verbose  ")).toBe("claude --verbose");
  });

  it("falls back to 'claude' and warns on semicolon (tampered DB)", () => {
    expect(buildClaudeCommand("--foo; rm -rf /")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/metacharacters/i);
  });

  it("falls back on backtick", () => {
    expect(buildClaudeCommand("`evil`")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on $ variable", () => {
    expect(buildClaudeCommand("--append $HOME")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on && operator", () => {
    expect(buildClaudeCommand("--foo && --bar")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on pipe", () => {
    expect(buildClaudeCommand("--foo | cat")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on redirect", () => {
    expect(buildClaudeCommand("--foo > out.txt")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on newline (injection attempt)", () => {
    expect(buildClaudeCommand("--foo\nrm -rf /")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on parentheses", () => {
    expect(buildClaudeCommand("(echo hi)")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
