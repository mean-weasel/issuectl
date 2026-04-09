import { spawn } from "node:child_process";
import type { TerminalLauncher, TerminalLaunchOptions, TerminalSettings } from "../terminal.js";
import { expandTabTitle, buildShellCommand } from "./ghostty.js";

function execAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("osascript", ["-"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d; });
    proc.stderr.on("data", (d: Buffer) => { stderr += d; });
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `osascript exited with code ${code}`));
    });
    proc.stdin.write(script);
    proc.stdin.end();
  });
}

function appleScriptEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildTerminalAppleScript(
  windowTitle: string,
  tabTitle: string,
  shellCommand: string,
): string {
  const wt = appleScriptEscape(windowTitle);
  const tt = appleScriptEscape(tabTitle);
  const cmd = appleScriptEscape(shellCommand);

  return `tell application "Terminal"
  activate
  set targetWindow to missing value
  repeat with w in windows
    try
      if custom title of w is "${wt}" then
        set targetWindow to w
        exit repeat
      end if
    end try
  end repeat

  if targetWindow is missing value then
    do script "${cmd}"
    set custom title of front window to "${wt}"
  else
    do script "${cmd}" in targetWindow
  end if

  set custom title of selected tab of front window to "${tt}"
end tell`;
}

export function createTerminalAppLauncher(settings: TerminalSettings): TerminalLauncher {
  return {
    name: "Terminal",

    async verify(): Promise<void> {
      if (process.platform !== "darwin") {
        throw new Error("Terminal.app launcher is only supported on macOS");
      }
    },

    async launch(options: TerminalLaunchOptions): Promise<void> {
      const tabTitle = expandTabTitle(settings.tabTitlePattern, options);
      const shellCommand = buildShellCommand(options.workspacePath, options.contextFilePath, options.claudeCommand);

      const script = buildTerminalAppleScript(
        settings.windowTitle,
        tabTitle,
        shellCommand,
      );

      try {
        await execAppleScript(script);
      } catch (err) {
        throw new Error(
          `Failed to launch Terminal.app. (${err instanceof Error ? err.message : String(err)})`,
          { cause: err },
        );
      }
    },
  };
}
