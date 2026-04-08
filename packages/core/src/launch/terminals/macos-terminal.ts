import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TerminalLauncher, TerminalLaunchOptions, TerminalSettings } from "../terminal.js";
import { expandTabTitle, buildShellCommand } from "./ghostty.js";

const execFileAsync = promisify(execFile);

function appleScriptEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
      const shellCommand = buildShellCommand(options.workspacePath, options.contextFilePath);
      const escapedCommand = appleScriptEscape(shellCommand);

      const script = `tell application "Terminal"
  activate
  do script "${escapedCommand}"
  set custom title of front window to "${appleScriptEscape(tabTitle)}"
end tell`;

      try {
        await execFileAsync("osascript", ["-e", script]);
      } catch (err) {
        throw new Error(
          `Failed to launch Terminal.app. (${err instanceof Error ? err.message : String(err)})`,
          { cause: err },
        );
      }
    },
  };
}
