import { spawn } from "node:child_process";

function launchGhostty(
  workspacePath: string,
  contextFilePath: string,
  newTab: boolean,
): void {
  // Build the command that runs inside the terminal:
  // cd to workspace, then pipe the context file into Claude Code
  const shellCmd = `cd ${shellEscape(workspacePath)} && cat ${shellEscape(contextFilePath)} | claude`;

  const args = [
    ...(newTab ? ["--gtk-single-instance=true"] : []),
    "-e",
    "/bin/bash",
    "-c",
    shellCmd,
  ];

  const child = spawn("ghostty", args, {
    detached: true,
    stdio: "ignore",
  });

  child.on("error", (err) => {
    console.error("[issuectl] Failed to launch Ghostty:", err.message);
  });

  child.unref();
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function openGhosttyWindow(
  workspacePath: string,
  contextFilePath: string,
): void {
  launchGhostty(workspacePath, contextFilePath, false);
}

export function openGhosttyTab(
  workspacePath: string,
  contextFilePath: string,
): void {
  launchGhostty(workspacePath, contextFilePath, true);
}
