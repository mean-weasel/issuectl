import { describe, it, expect } from "vitest";
import {
  validateClaudeArgs,
  validateCodexArgs,
  KNOWN_CLAUDE_FLAGS,
  KNOWN_CODEX_FLAGS,
} from "./claude-args.js";

describe("validateClaudeArgs", () => {
  it("accepts empty string", () => {
    const result = validateClaudeArgs("");
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("accepts whitespace-only as empty", () => {
    const result = validateClaudeArgs("   ");
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("accepts a single known flag", () => {
    const result = validateClaudeArgs("--dangerously-skip-permissions");
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("accepts a known flag with a value (value is not checked)", () => {
    const result = validateClaudeArgs("--model sonnet-4.5");
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("accepts a known flag in --flag=value form", () => {
    const result = validateClaudeArgs("--model=sonnet-4.5");
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("warns on unknown flag in --flag=value form", () => {
    const result = validateClaudeArgs("--foo=bar");
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("--foo");
  });

  it("accepts multiple known flags", () => {
    const result = validateClaudeArgs("--verbose --model opus");
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("accepts a quoted value with spaces", () => {
    const result = validateClaudeArgs('--append-system-prompt "hello world"');
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("warns on unknown long flag", () => {
    const result = validateClaudeArgs("--foo");
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("--foo");
  });

  it("warns on typo of a known flag", () => {
    const result = validateClaudeArgs("--dangerousl-skip-permissions");
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("--dangerousl-skip-permissions");
  });

  it("warns on unknown short flag", () => {
    const result = validateClaudeArgs("-x");
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  it("rejects newline (command injection attempt)", () => {
    const result = validateClaudeArgs("--foo\nrm -rf /");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/control|newline/i);
  });

  it("rejects carriage return", () => {
    const result = validateClaudeArgs("--foo\rrm -rf /");
    expect(result.ok).toBe(false);
  });

  it("rejects tab character", () => {
    const result = validateClaudeArgs("--foo\trm -rf /");
    expect(result.ok).toBe(false);
  });

  it("rejects $HOME variable expansion", () => {
    const result = validateClaudeArgs("--append $HOME");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/variable|expansion/i);
  });

  it("rejects ${VAR} variable expansion", () => {
    const result = validateClaudeArgs("--append ${USER}");
    expect(result.ok).toBe(false);
  });

  it("rejects glob patterns with a glob-specific error", () => {
    const result = validateClaudeArgs("--add-dir *.ts");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/glob/i);
  });

  it("rejects inline comments with a comment-specific error", () => {
    const result = validateClaudeArgs("--foo # inline note");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/comment/i);
  });

  it("rejects semicolon operator", () => {
    const result = validateClaudeArgs("--foo; rm -rf /");
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects && operator", () => {
    const result = validateClaudeArgs("--foo && --bar");
    expect(result.ok).toBe(false);
  });

  it("rejects pipe operator", () => {
    const result = validateClaudeArgs("--foo | grep x");
    expect(result.ok).toBe(false);
  });

  it("rejects redirect", () => {
    const result = validateClaudeArgs("--foo > out.txt");
    expect(result.ok).toBe(false);
  });

  it("rejects command substitution $()", () => {
    const result = validateClaudeArgs("$(evil)");
    expect(result.ok).toBe(false);
  });

  it("rejects $(command) substitution", () => {
    const result = validateClaudeArgs("$(whoami)");
    expect(result.ok).toBe(false);
  });

  it("rejects backtick substitution", () => {
    const result = validateClaudeArgs("`evil`");
    expect(result.ok).toBe(false);
  });

  it("rejects unclosed double quote", () => {
    const result = validateClaudeArgs('--foo "unclosed');
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/quote|syntax/i);
  });

  it("rejects unclosed single quote", () => {
    const result = validateClaudeArgs("--foo 'unclosed");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/quote|syntax/i);
  });

  it("exposes KNOWN_CLAUDE_FLAGS containing --dangerously-skip-permissions", () => {
    expect(KNOWN_CLAUDE_FLAGS).toContain("--dangerously-skip-permissions");
  });
});

describe("validateCodexArgs", () => {
  it("accepts known codex flags", () => {
    const result = validateCodexArgs("--sandbox workspace-write --model gpt-5 --full-auto");
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("accepts codex short flags", () => {
    const result = validateCodexArgs("-c model_reasoning_effort=high -i /tmp/screen.png -V");
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("warns on unknown codex flags", () => {
    const result = validateCodexArgs("--dangerously-skip-permissions");
    expect(result.ok).toBe(true);
    expect(result.warnings[0]).toContain("--dangerously-skip-permissions");
    expect(result.warnings[0]).toContain("Codex");
  });

  it("uses the same shell safety rules as Claude validation", () => {
    const result = validateCodexArgs("--model gpt-5 && rm -rf /");
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("exposes KNOWN_CODEX_FLAGS containing local codex help flags", () => {
    expect(KNOWN_CODEX_FLAGS).toEqual(
      expect.arrayContaining([
        "--sandbox",
        "--ask-for-approval",
        "--config",
        "-c",
        "--image",
        "-i",
        "--version",
        "-V",
      ]),
    );
  });
});
