import { createGhosttyLauncher } from "./terminals/ghostty.js";
import { createTerminalAppLauncher } from "./terminals/macos-terminal.js";

export interface TerminalLauncher {
  readonly name: string;
  verify(): Promise<void>;
  launch(options: TerminalLaunchOptions): Promise<void>;
}

export interface TerminalLaunchOptions {
  workspacePath: string;
  contextFilePath: string;
  issueNumber: number;
  issueTitle: string;
  owner: string;
  repo: string;
}

export type SupportedTerminal = "ghostty" | "terminal";

export interface TerminalSettings {
  terminal: SupportedTerminal;
  windowTitle: string;
  /** Pattern for tab title. Placeholders: {number}, {title} (truncated to 30 chars), {repo}, {owner} */
  tabTitlePattern: string;
}

export function getTerminalLauncher(settings: TerminalSettings): TerminalLauncher {
  switch (settings.terminal) {
    case "ghostty":
      return createGhosttyLauncher(settings);
    case "terminal":
      return createTerminalAppLauncher(settings);
    default:
      throw new Error(`Unsupported terminal: ${settings.terminal}`);
  }
}
