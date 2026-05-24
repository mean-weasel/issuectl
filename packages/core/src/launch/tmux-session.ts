import { execFileSync } from "node:child_process";

export interface SpawnPtyBridgeSessionOptions {
  workspacePath: string;
  contextFilePath: string;
  agentCommand: string;
  agentInputMode?: "stdin" | "argument";
  sessionName: string;
  credentialPolicy?: "ambient" | "scrubbed";
  extraEnv?: Record<string, string>;
}

export const TMUX_TIMEOUT_MS = 10_000;
export const TMUX_SESSION_RE = /^[a-zA-Z0-9_-]+$/;

// Detached tmux sessions otherwise start at 80 columns, wider than phones.
const TMUX_INITIAL_COLUMNS = 40;
const TMUX_INITIAL_ROWS = 24;
const AGENT_ENV_RESET =
  "for name in $(env | awk -F= '/^npm_/ {print $1}'); do unset \"$name\"; done; unset PNPM_SCRIPT_SRC_DIR";
const AGENT_CREDENTIAL_ENV_RESET = [
  "unset GH_TOKEN GITHUB_TOKEN GITHUB_PAT",
  "unset SSH_AUTH_SOCK GIT_ASKPASS SSH_ASKPASS",
  "export GH_CONFIG_DIR=\"$(mktemp -d ${TMPDIR:-/tmp}/issuectl-gh-empty.XXXXXX)\"",
].join("; ");

export function createTmuxAgentSession(options: SpawnPtyBridgeSessionOptions): void {
  const {
    workspacePath,
    contextFilePath,
    agentCommand,
    agentInputMode = "stdin",
    sessionName,
    credentialPolicy = "ambient",
    extraEnv = {},
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
  const envReset = credentialPolicy === "scrubbed"
    ? `${AGENT_ENV_RESET}; ${AGENT_CREDENTIAL_ENV_RESET}`
    : AGENT_ENV_RESET;
  const envExports = Object.entries(extraEnv)
    .filter(([key]) => /^[A-Z_][A-Z0-9_]*$/.test(key))
    .map(([key, value]) => `export ${key}=${shellEscape(value)}`)
    .join("; ");
  const innerCommand =
    `${envReset}; ${envExports}; cd ${shellEscape(workspacePath)} && ${agentCommand} ${contextInput} ; exit`;

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
