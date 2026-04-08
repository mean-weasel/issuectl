import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TerminalLauncher, TerminalLaunchOptions, TerminalSettings } from "../terminal.js";

const execFileAsync = promisify(execFile);

export type GhosttyVersion = { major: number; minor: number; patch: number };

export function parseGhosttyVersion(raw: string): GhosttyVersion {
  const match = raw.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Cannot parse Ghostty version from: "${raw}"`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function meetsMinVersion(v: GhosttyVersion): boolean {
  if (v.major > 1) return true;
  if (v.major === 1 && v.minor >= 3) return true;
  return false;
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

type TabTitleInput = {
  issueNumber: number;
  issueTitle: string;
  owner: string;
  repo: string;
};

export function expandTabTitle(pattern: string, input: TabTitleInput): string {
  const truncatedTitle = input.issueTitle.slice(0, 30);
  return pattern
    .replace(/\{number\}/g, String(input.issueNumber))
    .replace(/\{title\}/g, truncatedTitle)
    .replace(/\{owner\}/g, input.owner)
    .replace(/\{repo\}/g, input.repo);
}

export function buildShellCommand(workspacePath: string, contextFilePath: string): string {
  return `cd ${shellEscape(workspacePath)} && cat ${shellEscape(contextFilePath)} | claude`;
}

export function buildGhosttyArgs(tabTitle: string, shellCommand: string): string[] {
  return [
    "-na", "Ghostty.app",
    "--args",
    `--title=${tabTitle}`,
    "-e", "/bin/bash", "-c", shellCommand,
  ];
}

const GHOSTTY_APP_BINARY = "/Applications/Ghostty.app/Contents/MacOS/ghostty";

export async function resolveGhosttyBinary(): Promise<string> {
  try {
    await execFileAsync("which", ["ghostty"]);
    return "ghostty";
  } catch {
    // Not on PATH — try macOS .app bundle
  }

  try {
    await execFileAsync(GHOSTTY_APP_BINARY, ["--version"]);
    return GHOSTTY_APP_BINARY;
  } catch {
    throw new Error(
      "Ghostty terminal is not installed. Install from https://ghostty.org",
    );
  }
}

export function createGhosttyLauncher(settings: TerminalSettings): TerminalLauncher {
  return {
    name: "Ghostty",

    async verify(): Promise<void> {
      if (process.platform !== "darwin") {
        throw new Error("Ghostty launcher is only supported on macOS");
      }

      const binary = await resolveGhosttyBinary();
      const { stdout } = await execFileAsync(binary, ["--version"]);

      const version = parseGhosttyVersion(stdout);
      if (!meetsMinVersion(version)) {
        throw new Error(
          `Ghostty 1.3+ is required (found ${stdout.trim()}). Update at https://ghostty.org`,
        );
      }
    },

    async launch(options: TerminalLaunchOptions): Promise<void> {
      const tabTitle = expandTabTitle(settings.tabTitlePattern, options);
      const shellCommand = buildShellCommand(options.workspacePath, options.contextFilePath);
      const args = buildGhosttyArgs(tabTitle, shellCommand);
      await execFileAsync("open", args);
    },
  };
}
