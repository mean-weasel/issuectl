import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ── Pure helpers (unit-tested) ──────────────────────────────────────

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

function appleScriptEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

type AppleScriptInput = {
  windowTitle: string;
  tabTitle: string;
  shellCommand: string;
};

export function buildGhosttyAppleScript(input: AppleScriptInput): string {
  const wt = appleScriptEscape(input.windowTitle);
  const tt = appleScriptEscape(input.tabTitle);
  const cmd = appleScriptEscape(input.shellCommand);

  return `tell application "Ghostty"
  activate
  set issuectlWindow to missing value
  repeat with w in windows
    if name of w is "${wt}" then
      set issuectlWindow to w
      exit repeat
    end if
  end repeat

  if issuectlWindow is missing value then
    set issuectlWindow to (new window)
  else
    tell issuectlWindow to new tab
  end if

  delay 0.5

  tell front window
    set focusedTerminal to focused terminal
    tell focusedTerminal
      execute action "set_tab_title:${tt}"
      write "${cmd}" & return
    end tell
  end tell
end tell`;
}

// ── Side-effect layer ───────────────────────────────────────────────

// NOTE: TerminalLauncher interface doesn't exist yet (created in Task 2).
// The GhosttyLauncher class will implement it once terminal.ts is created.
// For now, the class is standalone. Task 2 will add the import and `implements` clause.

export class GhosttyLauncher {
  readonly name = "Ghostty";
  private settings: { terminal: string; windowTitle: string; tabTitlePattern: string };

  constructor(settings: { terminal: string; windowTitle: string; tabTitlePattern: string }) {
    this.settings = settings;
  }

  async verify(): Promise<void> {
    if (process.platform !== "darwin") {
      throw new Error("Ghostty AppleScript launcher is only supported on macOS");
    }

    let stdout: string;
    try {
      const result = await execFileAsync("ghostty", ["--version"]);
      stdout = result.stdout;
    } catch {
      throw new Error(
        "Ghostty terminal is not installed or not on PATH. Install Ghostty from https://ghostty.org",
      );
    }

    const version = parseGhosttyVersion(stdout);
    if (!meetsMinVersion(version)) {
      throw new Error(
        `Ghostty 1.3+ is required for AppleScript support (found ${stdout.trim()}). Update at https://ghostty.org`,
      );
    }
  }

  async launch(options: {
    workspacePath: string;
    contextFilePath: string;
    issueNumber: number;
    issueTitle: string;
    owner: string;
    repo: string;
  }): Promise<void> {
    const tabTitle = expandTabTitle(this.settings.tabTitlePattern, {
      issueNumber: options.issueNumber,
      issueTitle: options.issueTitle,
      owner: options.owner,
      repo: options.repo,
    });

    const shellCommand = buildShellCommand(options.workspacePath, options.contextFilePath);

    const script = buildGhosttyAppleScript({
      windowTitle: this.settings.windowTitle,
      tabTitle,
      shellCommand,
    });

    await execFileAsync("osascript", ["-e", script]);
  }
}
