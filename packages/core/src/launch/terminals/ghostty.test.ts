import { describe, it, expect } from "vitest";
import {
  expandTabTitle,
  buildShellCommand,
  buildGhosttyArgs,
  parseGhosttyVersion,
  meetsMinVersion,
} from "./ghostty.js";

describe("expandTabTitle", () => {
  const baseOptions = {
    issueNumber: 42,
    issueTitle: "Fix auth middleware",
    owner: "mean-weasel",
    repo: "seatify",
  };

  it("expands all placeholders", () => {
    expect(expandTabTitle("#{number} — {title} ({owner}/{repo})", baseOptions))
      .toBe("#42 — Fix auth middleware (mean-weasel/seatify)");
  });

  it("truncates title to 30 characters", () => {
    const long = { ...baseOptions, issueTitle: "A very long issue title that definitely exceeds thirty characters" };
    const result = expandTabTitle("#{number} — {title}", long);
    // "A very long issue title that d" = 30 chars
    expect(result).toBe("#42 — A very long issue title that d");
  });

  it("handles empty title", () => {
    const empty = { ...baseOptions, issueTitle: "" };
    expect(expandTabTitle("#{number} — {title}", empty)).toBe("#42 — ");
  });

  it("leaves unknown placeholders as-is", () => {
    expect(expandTabTitle("{unknown} #{number}", baseOptions)).toBe("{unknown} #42");
  });
});

describe("buildShellCommand", () => {
  it("produces cd + cat | claude command", () => {
    const result = buildShellCommand("/home/user/project", "/tmp/ctx.md");
    expect(result).toBe("cd '/home/user/project' && cat '/tmp/ctx.md' | claude");
  });

  it("escapes paths with single quotes", () => {
    const result = buildShellCommand("/home/user/it's a project", "/tmp/file.md");
    expect(result).toBe("cd '/home/user/it'\\''s a project' && cat '/tmp/file.md' | claude");
  });

  it("escapes paths with spaces", () => {
    const result = buildShellCommand("/home/user/my project", "/tmp/my file.md");
    expect(result).toBe("cd '/home/user/my project' && cat '/tmp/my file.md' | claude");
  });

  it("uses custom command when provided", () => {
    const result = buildShellCommand("/home/user/project", "/tmp/ctx.md", "yolo");
    expect(result).toBe("cd '/home/user/project' && cat '/tmp/ctx.md' | yolo");
  });

  it("defaults to claude when command is omitted", () => {
    const result = buildShellCommand("/home/user/project", "/tmp/ctx.md");
    expect(result).toBe("cd '/home/user/project' && cat '/tmp/ctx.md' | claude");
  });
});

describe("parseGhosttyVersion", () => {
  it("parses version with build hash", () => {
    expect(parseGhosttyVersion("1.3.1 (abcdef)")).toEqual({ major: 1, minor: 3, patch: 1 });
  });

  it("parses plain version", () => {
    expect(parseGhosttyVersion("1.3.0")).toEqual({ major: 1, minor: 3, patch: 0 });
  });

  it("throws on garbage input", () => {
    expect(() => parseGhosttyVersion("not-a-version")).toThrow();
  });
});

describe("meetsMinVersion", () => {
  it("1.3.0 meets >=1.3", () => {
    expect(meetsMinVersion({ major: 1, minor: 3, patch: 0 })).toBe(true);
  });

  it("2.0.0 meets >=1.3", () => {
    expect(meetsMinVersion({ major: 2, minor: 0, patch: 0 })).toBe(true);
  });

  it("1.2.9 does not meet >=1.3", () => {
    expect(meetsMinVersion({ major: 1, minor: 2, patch: 9 })).toBe(false);
  });
});

describe("buildGhosttyArgs", () => {
  it("produces open -na args with title and command", () => {
    const args = buildGhosttyArgs("#42 — Fix auth", "cd '/tmp' && echo hello");
    expect(args).toEqual([
      "-na", "Ghostty.app",
      "--args",
      "--title=#42 — Fix auth",
      "-e", "/bin/bash", "-lc", "cd '/tmp' && echo hello || exec $SHELL -l",
    ]);
  });

  it("handles em dashes in title without issue", () => {
    const args = buildGhosttyArgs("#99 — Test title", "echo test");
    expect(args[3]).toBe("--title=#99 — Test title");
  });
});
