import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  shouldTrustAgentWorkspace,
  shouldTrustCodexWorkspace,
  trustClaudeProject,
  trustCodexProject,
} from "./agent-preflight.js";

describe("agent preflight", () => {
  let codexHome: string | null = null;
  let claudeConfigPath: string | null = null;
  const previousCodexHome = process.env.CODEX_HOME;
  const previousClaudeConfigPath = process.env.ISSUECTL_CLAUDE_CONFIG_PATH;

  afterEach(async () => {
    if (codexHome) {
      await rm(codexHome, { recursive: true, force: true });
      codexHome = null;
    }
    if (claudeConfigPath) {
      await rm(claudeConfigPath, { force: true });
      claudeConfigPath = null;
    }
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    if (previousClaudeConfigPath === undefined) {
      delete process.env.ISSUECTL_CLAUDE_CONFIG_PATH;
    } else {
      process.env.ISSUECTL_CLAUDE_CONFIG_PATH = previousClaudeConfigPath;
    }
  });

  it("only trusts Codex workspaces for automation-triggered launches", () => {
    expect(shouldTrustCodexWorkspace("codex", "webhook")).toBe(true);
    expect(shouldTrustCodexWorkspace("codex", "comment_command")).toBe(true);
    expect(shouldTrustCodexWorkspace("codex", "manual")).toBe(false);
    expect(shouldTrustCodexWorkspace("claude", "webhook")).toBe(false);
  });

  it("trusts Codex and Claude workspaces for automation-triggered launches", () => {
    expect(shouldTrustAgentWorkspace("codex", "webhook")).toBe(true);
    expect(shouldTrustAgentWorkspace("claude", "webhook")).toBe(true);
    expect(shouldTrustAgentWorkspace("codex", "comment_command")).toBe(true);
    expect(shouldTrustAgentWorkspace("claude", "comment_command")).toBe(true);
    expect(shouldTrustAgentWorkspace("codex", "manual")).toBe(false);
    expect(shouldTrustAgentWorkspace("claude", "manual")).toBe(false);
  });

  it("adds an exact Codex project trust entry", async () => {
    codexHome = await mkdtemp(join(tmpdir(), "issuectl-codex-home-"));
    process.env.CODEX_HOME = codexHome;

    const workspacePath = "/tmp/issuectl worktrees/repo-issue-26";
    const result = await trustCodexProject(workspacePath);

    expect(result.changed).toBe(true);
    await expect(readFile(join(codexHome, "config.toml"), "utf8")).resolves.toContain(
      `[projects.${JSON.stringify(workspacePath)}]\ntrust_level = "trusted"`,
    );
  });

  it("is idempotent for existing trusted Codex projects", async () => {
    codexHome = await mkdtemp(join(tmpdir(), "issuectl-codex-home-"));
    process.env.CODEX_HOME = codexHome;

    const workspacePath = "/tmp/issuectl-worktrees/repo-issue-26";
    await trustCodexProject(workspacePath);
    const result = await trustCodexProject(workspacePath);

    expect(result.changed).toBe(false);
    const config = await readFile(join(codexHome, "config.toml"), "utf8");
    const header = `[projects.${JSON.stringify(workspacePath)}]`;
    expect(config.split(header)).toHaveLength(2);
  });

  it("updates an existing project section to trusted without dropping later sections", async () => {
    codexHome = await mkdtemp(join(tmpdir(), "issuectl-codex-home-"));
    process.env.CODEX_HOME = codexHome;
    const configPath = join(codexHome, "config.toml");
    const workspacePath = "/tmp/issuectl-worktrees/repo-issue-26";
    await writeFile(
      configPath,
      `model = "gpt-5"\n\n[projects.${JSON.stringify(workspacePath)}]\ntrust_level = "untrusted"\n\n[tui]\nstatus_line = ["model"]\n`,
      "utf8",
    );

    const result = await trustCodexProject(workspacePath);

    expect(result.changed).toBe(true);
    await expect(readFile(configPath, "utf8")).resolves.toContain(
      `[projects.${JSON.stringify(workspacePath)}]\ntrust_level = "trusted"\n\n[tui]`,
    );
  });

  it("adds an exact Claude project trust entry", async () => {
    claudeConfigPath = join(await mkdtemp(join(tmpdir(), "issuectl-claude-home-")), ".claude.json");
    process.env.ISSUECTL_CLAUDE_CONFIG_PATH = claudeConfigPath;

    const workspacePath = "/tmp/issuectl worktrees/repo-pr-26";
    const result = await trustClaudeProject(workspacePath);

    expect(result.changed).toBe(true);
    const config = JSON.parse(await readFile(claudeConfigPath, "utf8"));
    expect(config.projects[workspacePath]).toEqual(expect.objectContaining({
      allowedTools: [],
      hasTrustDialogAccepted: true,
      hasCompletedProjectOnboarding: true,
      projectOnboardingSeenCount: 0,
    }));
  });

  it("updates an existing Claude project entry without dropping other fields", async () => {
    claudeConfigPath = join(await mkdtemp(join(tmpdir(), "issuectl-claude-home-")), ".claude.json");
    process.env.ISSUECTL_CLAUDE_CONFIG_PATH = claudeConfigPath;
    const workspacePath = "/tmp/issuectl-worktrees/repo-pr-26";
    await writeFile(
      claudeConfigPath,
      JSON.stringify({
        userID: "user-1",
        projects: {
          [workspacePath]: {
            allowedTools: ["Bash(pnpm test)"],
            hasTrustDialogAccepted: false,
            lastSessionId: "session-1",
          },
          "/tmp/other": { hasTrustDialogAccepted: true },
        },
      }),
      "utf8",
    );

    const result = await trustClaudeProject(workspacePath);

    expect(result.changed).toBe(true);
    const config = JSON.parse(await readFile(claudeConfigPath, "utf8"));
    expect(config.userID).toBe("user-1");
    expect(config.projects["/tmp/other"]).toEqual({ hasTrustDialogAccepted: true });
    expect(config.projects[workspacePath]).toEqual(expect.objectContaining({
      allowedTools: ["Bash(pnpm test)"],
      hasTrustDialogAccepted: true,
      hasCompletedProjectOnboarding: true,
      lastSessionId: "session-1",
    }));
  });

  it("is idempotent for existing trusted Claude projects", async () => {
    claudeConfigPath = join(await mkdtemp(join(tmpdir(), "issuectl-claude-home-")), ".claude.json");
    process.env.ISSUECTL_CLAUDE_CONFIG_PATH = claudeConfigPath;

    const workspacePath = "/tmp/issuectl-worktrees/repo-pr-26";
    await trustClaudeProject(workspacePath);
    const result = await trustClaudeProject(workspacePath);

    expect(result.changed).toBe(false);
  });
});
