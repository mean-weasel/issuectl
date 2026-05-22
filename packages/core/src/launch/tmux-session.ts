import { execFileSync } from "node:child_process";

export interface SpawnPtyBridgeSessionOptions {
  workspacePath: string;
  contextFilePath: string;
  agentCommand: string;
  agentInputMode?: "stdin" | "argument";
  sessionName: string;
}

export const TMUX_TIMEOUT_MS = 10_000;
export const TMUX_SESSION_RE = /^[a-zA-Z0-9_-]+$/;

// Detached tmux sessions otherwise start at 80 columns, wider than phones.
const TMUX_INITIAL_COLUMNS = 40;
const TMUX_INITIAL_ROWS = 24;
const AGENT_ENV_RESET =
  "for name in $(env | awk -F= '/^npm_/ {print $1}'); do unset \"$name\"; done; unset PNPM_SCRIPT_SRC_DIR";

export function createTmuxAgentSession(options: SpawnPtyBridgeSessionOptions): void {
  const {
    workspacePath,
    contextFilePath,
    agentCommand,
    agentInputMode = "stdin",
    sessionName,
  } = options;

  if (!TMUX_SESSION_RE.test(sessionName)) {
    throw new Error(
      `Invalid tmux session name: ${JSON.stringify(sessionName)}. Only alphanumeric, hyphens, and underscores are allowed.`,
    );
  }

  const contextInput =
    agentInputMode === "argument"
      ? `"$(cat ${shellEscape(contextFilePath)})"`
      : `< ${shellEscape(contextFilePath)}`;
  const innerCommand =
    `${AGENT_ENV_RESET}; cd ${shellEscape(workspacePath)} && ${agentCommand} ${contextInput} ; exit`;

  execFileSync("tmux", [
    "new-session", "-d",
    "-x", String(TMUX_INITIAL_COLUMNS),
    "-y", String(TMUX_INITIAL_ROWS),
    "-s", sessionName,
    `bash -lic ${shellEscape(innerCommand)}`,
  ], { timeout: TMUX_TIMEOUT_MS });

  try {
    execFileSync("tmux", ["set-option", "-t", sessionName, "status", "off"],
      { timeout: TMUX_TIMEOUT_MS });
    // "largest" sizing ensures shared sessions expand to the biggest attached client.
    execFileSync("tmux", ["set-option", "-t", sessionName, "window-size", "largest"],
      { timeout: TMUX_TIMEOUT_MS });
  } catch (err) {
    killTmuxSession(sessionName);
    throw err;
  }
}

export function killTmuxSession(name: string): void {
  try {
    execFileSync("tmux", ["kill-session", "-t", name], {
      stdio: "ignore",
      timeout: TMUX_TIMEOUT_MS,
    });
  } catch {
    // best effort
  }
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
