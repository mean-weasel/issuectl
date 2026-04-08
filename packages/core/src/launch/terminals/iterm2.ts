import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TerminalLauncher, TerminalLaunchOptions, TerminalSettings } from "../terminal.js";
import { expandTabTitle, buildShellCommand } from "./ghostty.js";

const execFileAsync = promisify(execFile);

function appleScriptEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildITermAppleScript(
  tabTitle: string,
  shellCommand: string,
): string {
  const tt = appleScriptEscape(tabTitle);
  const cmd = appleScriptEscape(shellCommand);

  return `tell application "iTerm"
  activate
  if (count of windows) is 0 then
    create window with default profile
  else
    tell current window
      create tab with default profile
    end tell
  end if

  tell current session of current window
    set name to "${tt}"
    write text "${cmd}"
  end tell
end tell`;
}

export function createITermLauncher(settings: TerminalSettings): TerminalLauncher {
  return {
    name: "iTerm2",

    async verify(): Promise<void> {
      if (process.platform !== "darwin") {
        throw new Error("iTerm2 launcher is only supported on macOS");
      }

      try {
        await execFileAsync("osascript", ["-e", 'tell application "Finder" to get application file id "com.googlecode.iterm2"']);
      } catch (err) {
        throw new Error(
          "iTerm2 is not installed. Install from https://iterm2.com",
          { cause: err },
        );
      }
    },

    async launch(options: TerminalLaunchOptions): Promise<void> {
      const tabTitle = expandTabTitle(settings.tabTitlePattern, options);
      const shellCommand = buildShellCommand(options.workspacePath, options.contextFilePath);

      const script = buildITermAppleScript(tabTitle, shellCommand);

      try {
        await execFileAsync("osascript", ["-e", script]);
      } catch (err) {
        throw new Error(
          `Failed to launch iTerm2. (${err instanceof Error ? err.message : String(err)})`,
          { cause: err },
        );
      }
    },
  };
}
