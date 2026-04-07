import { spawn } from "node:child_process";

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function launchGhostty(
  workspacePath: string,
  contextFilePath: string,
): void {
  const shellCmd = `cd ${shellEscape(workspacePath)} && cat ${shellEscape(contextFilePath)} | claude`;

  const args = ["-e", "/bin/bash", "-c", shellCmd];

  const child = spawn("ghostty", args, {
    detached: true,
    stdio: "ignore",
  });

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
