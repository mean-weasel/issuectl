import type { TerminalLauncher, TerminalLaunchOptions, TerminalSettings } from "../terminal.js";
import { timedExec } from "../exec-timeout.js";

// Timeout budgets for the handful of synchronous Ghostty-probing calls.
// `open -na Ghostty.app` returns quickly once the application receives the
// event — 10s is generous. `which` and `--version` are similarly fast.
const WHICH_TIMEOUT_MS = 5_000;
const VERSION_TIMEOUT_MS = 5_000;
const OPEN_TIMEOUT_MS = 10_000;

export type GhosttyVersion = { readonly major: number; readonly minor: number; readonly patch: number };

export function parseGhosttyVersion(raw: string): GhosttyVersion {
  // Ghostty 1.3+ outputs "Ghostty X.Y.Z\n..." — search for version anywhere in output
  const match = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Cannot parse Ghostty version from: "${raw.trim()}"`);
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

type TabTitleInput = Pick<TerminalLaunchOptions, "issueNumber" | "issueTitle" | "owner" | "repo">;

export function expandTabTitle(pattern: string, input: TabTitleInput): string {
  const truncatedTitle = input.issueTitle.slice(0, 30);
  return pattern
    .replace(/\{number\}/g, String(input.issueNumber))
    .replace(/\{title\}/g, truncatedTitle)
    .replace(/\{owner\}/g, input.owner)
    .replace(/\{repo\}/g, input.repo);
}

export function buildShellCommand(workspacePath: string, contextFilePath: string, claudeCommand: string = "claude"): string {
  return `cd ${shellEscape(workspacePath)} && cat ${shellEscape(contextFilePath)} | ${claudeCommand}`;
}

export function buildGhosttyArgs(tabTitle: string, shellCommand: string): string[] {
  // Use interactive login shell (-lic) so PATH includes user tools and
  // shell aliases are expanded (aliases only work in interactive mode).
  // On failure, drop into an interactive shell so the user can see the error.
  const wrappedCommand = `${shellCommand} || exec $SHELL -l`;
  return [
    "-na", "Ghostty.app",
    "--args",
    `--title=${tabTitle}`,
    "-e", "/bin/bash", "-lic", wrappedCommand,
  ];
}

const GHOSTTY_APP_BINARY = "/Applications/Ghostty.app/Contents/MacOS/ghostty";

export async function resolveGhosttyBinary(): Promise<string> {
  try {
    await timedExec("which", ["ghostty"], {
      timeoutMs: WHICH_TIMEOUT_MS,
      step: "which ghostty",
    });
    return "ghostty";
  } catch (err: unknown) {
    // "which" exits 1 when not found — only fall through for that case
    const code = (err as { code?: string | number }).code;
    if (code !== "ENOENT" && code !== 1) throw err;
  }

  try {
    await timedExec(GHOSTTY_APP_BINARY, ["--version"], {
      timeoutMs: VERSION_TIMEOUT_MS,
      step: "ghostty --version",
    });
    return GHOSTTY_APP_BINARY;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== "ENOENT") throw err;
    throw new Error(
      "Ghostty terminal is not installed. Install from https://ghostty.org",
      { cause: err },
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
      const { stdout } = await timedExec(binary, ["--version"], {
        timeoutMs: VERSION_TIMEOUT_MS,
        step: "ghostty --version",
      });

      const version = parseGhosttyVersion(stdout);
      if (!meetsMinVersion(version)) {
        throw new Error(
          `Ghostty 1.3+ is required (found ${stdout.trim()}). Update at https://ghostty.org`,
        );
      }
    },

    async launch(options: TerminalLaunchOptions): Promise<void> {
      const tabTitle = expandTabTitle(settings.tabTitlePattern, options);
      const shellCommand = buildShellCommand(options.workspacePath, options.contextFilePath, options.claudeCommand);
      const args = buildGhosttyArgs(tabTitle, shellCommand);
      try {
        await timedExec("open", args, {
          timeoutMs: OPEN_TIMEOUT_MS,
          step: "open -na Ghostty.app",
        });
      } catch (err) {
        throw new Error(
          `Failed to launch Ghostty terminal. Ensure Ghostty.app is installed and accessible. ` +
          `(${err instanceof Error ? err.message : String(err)})`,
          { cause: err },
        );
      }
    },
  };
}

