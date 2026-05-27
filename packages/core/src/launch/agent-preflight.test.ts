import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  shouldTrustCodexWorkspace,
  trustCodexProject,
} from "./agent-preflight.js";

describe("agent preflight", () => {
  let codexHome: string | null = null;
  const previousCodexHome = process.env.CODEX_HOME;

  afterEach(async () => {
    if (codexHome) {
      await rm(codexHome, { recursive: true, force: true });
      codexHome = null;
    }
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
  });

  it("only trusts Codex workspaces for automation-triggered launches", () => {
    expect(shouldTrustCodexWorkspace("codex", "webhook")).toBe(true);
    expect(shouldTrustCodexWorkspace("codex", "comment_command")).toBe(true);
    expect(shouldTrustCodexWorkspace("codex", "manual")).toBe(false);
    expect(shouldTrustCodexWorkspace("claude", "webhook")).toBe(false);
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
});
