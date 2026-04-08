import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export async function verifyGhosttyInstalled(): Promise<void> {
  try {
    await execFileAsync("which", ["ghostty"]);
  } catch {
    throw new Error(
      "Ghostty terminal is not installed or not on PATH. Install Ghostty from https://ghostty.org",
    );
  }
}

function launchGhostty(
  workspacePath: string,
  contextFilePath: string,
): void {
  const shellCmd = `cd ${shellEscape(workspacePath)} && cat ${shellEscape(contextFilePath)} | claude`;

  // Use +new-window to force a new window (not a tab in an existing group).
  // The -e flag passes the command to run in the new window.
  const child = spawn(
    "ghostty",
    ["+new-window", "-e", "/bin/bash", "-c", shellCmd],
    { detached: true, stdio: "ignore" },
  );

  child.on("error", (err) => {
    console.error("[issuectl] Failed to launch Ghostty:", err.message);
  });

  child.unref();
}

// Tab mode is not yet supported — Ghostty's CLI tab API needs investigation.
// Both functions currently open a new window. See Phase 10 technical risks.
export function openGhosttyWindow(
  workspacePath: string,
  contextFilePath: string,
): void {
  launchGhostty(workspacePath, contextFilePath);
}

export function openGhosttyTab(
  workspacePath: string,
  contextFilePath: string,
): void {
  launchGhostty(workspacePath, contextFilePath);
}
