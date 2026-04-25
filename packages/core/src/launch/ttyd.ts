import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import type Database from "better-sqlite3";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SpawnTtydOptions {
  port: number;
  workspacePath: string;
  contextFilePath: string;
  claudeCommand: string;
  /** Stable session name for tmux (e.g. "issuectl-167"). Multiple
   *  clients connecting to the same ttyd instance will share the
   *  terminal view via this tmux session. */
  sessionName: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const TMUX_TIMEOUT_MS = 10_000;
const TMUX_SESSION_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Build a tmux-safe session name from repo + issue number. Dots, colons,
 * and other characters that tmux interprets as session:window.pane
 * delimiters are replaced with underscores.
 */
export function tmuxSessionName(repo: string, issueNumber: number): string {
  const raw = `issuectl-${repo}-${issueNumber}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/* ------------------------------------------------------------------ */
/*  verifyTtyd                                                         */
/* ------------------------------------------------------------------ */

/**
 * Verify that ttyd and tmux are installed and reachable via PATH.
 * Throws with an install hint when either is not found.
 */
export function verifyTtyd(): void {
  for (const bin of ["ttyd", "tmux"] as const) {
    try {
      execFileSync("which", [bin], { stdio: "ignore" });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const status = (err as { status?: number }).status;
      if (code === "ENOENT" || status === 1) {
        throw new Error(`${bin} is not installed. Run: brew install ${bin}`, { cause: err });
      }
      throw new Error(
        `Failed to verify ${bin} installation: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  killTtyd                                                           */
/* ------------------------------------------------------------------ */

/**
 * Send SIGTERM to a ttyd process and kill its tmux session.
 * Silently ignores ESRCH (process already dead) and non-existent
 * tmux sessions — all other errors are re-thrown. The tmux session
 * is always cleaned up when a `sessionName` is provided, even if
 * the ttyd process is already dead.
 */
export function killTtyd(pid: number, sessionName?: string): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
    // ESRCH: process already dead — fall through to tmux cleanup
  }

  if (sessionName) {
    try {
      execFileSync("tmux", ["kill-session", "-t", sessionName], {
        stdio: "ignore",
        timeout: TMUX_TIMEOUT_MS,
      });
    } catch {
      // Session may already be gone — that's fine.
    }
  }
}

/* ------------------------------------------------------------------ */
/*  isTtydAlive                                                        */
/* ------------------------------------------------------------------ */

/**
 * Check whether the process with the given PID is still running.
 * Uses `kill(pid, 0)`. Returns `true` for both owned and EPERM
 * processes (EPERM means the process exists but is owned by another user).
 * Only returns `false` when ESRCH confirms the process is dead.
 */
export function isTtydAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") return false;
    if ((err as NodeJS.ErrnoException).code === "EPERM") return true;
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  isTmuxSessionAlive                                                 */
/* ------------------------------------------------------------------ */

/**
 * Check whether a tmux session with the given name still exists.
 * This is the deployment liveness signal — tmux hosts the actual
 * work (Claude Code), while ttyd is just a disposable web frontend.
 */
export function isTmuxSessionAlive(sessionName: string): boolean {
  try {
    execFileSync("tmux", ["has-session", "-t", sessionName], {
      stdio: "ignore",
      timeout: TMUX_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  allocatePort                                                       */
/* ------------------------------------------------------------------ */

const PORT_MIN = 7700;
const PORT_MAX = 7799;
const PROBE_TIMEOUT_MS = 200;

/**
 * Probe whether a TCP port is already in use by attempting a short
 * `net.connect()`. Resolves `true` when something is listening.
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, PROBE_TIMEOUT_MS);

    socket.on("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Find the lowest free port in the 7700–7799 range. Ports already
 * claimed by active deployments (DB) **and** ports with something
 * listening (TCP probe) are skipped.
 */
export async function allocatePort(db: Database.Database): Promise<number> {
  const rows = db
    .prepare(
      "SELECT ttyd_port FROM deployments WHERE ended_at IS NULL AND ttyd_port IS NOT NULL",
    )
    .all() as { ttyd_port: number }[];

  const dbPorts = new Set(rows.map((r) => r.ttyd_port));

  for (let port = PORT_MIN; port <= PORT_MAX; port++) {
    if (dbPorts.has(port)) continue;
    const inUse = await isPortInUse(port);
    if (!inUse) return port;
  }

  throw new Error(
    `All ttyd ports (${PORT_MIN}–${PORT_MAX}) are in use`,
  );
}

/* ------------------------------------------------------------------ */
/*  spawnTtyd                                                          */
/* ------------------------------------------------------------------ */

/**
 * Create a tmux session running an interactive Claude command, then
 * spawn a detached ttyd process that serves the session over WebSocket.
 * Returns the child PID and port.
 *
 * Includes a brief post-spawn health check — if ttyd crashes
 * immediately (e.g. port conflict, bad path), the error is surfaced
 * rather than silently recording a dead PID. On any failure after the
 * tmux session is created, the session is cleaned up to prevent orphans.
 */
export async function spawnTtyd(options: SpawnTtydOptions): Promise<{ pid: number; port: number }> {
  const { port, workspacePath, contextFilePath, claudeCommand, sessionName } = options;

  if (!TMUX_SESSION_RE.test(sessionName)) {
    throw new Error(
      `Invalid tmux session name: ${JSON.stringify(sessionName)}. Only alphanumeric, hyphens, and underscores are allowed.`,
    );
  }

  // Build the inner shell command that runs inside tmux:
  //   cd <workspace> && cat <context> | <claudeCommand> ; exit
  const innerCommand =
    `cd ${shellEscape(workspacePath)} && cat ${shellEscape(contextFilePath)} | ${claudeCommand} ; exit`;

  // Create a detached tmux session that runs the Claude command.
  // This is step 1 of 2 — ttyd will then serve `tmux attach` so
  // every WebSocket client shares the same terminal view.
  execFileSync("tmux", [
    "new-session", "-d", "-s", sessionName,
    `bash -lic ${shellEscape(innerCommand)}`,
  ], { timeout: TMUX_TIMEOUT_MS });

  try {
    execFileSync("tmux", ["set-option", "-t", sessionName, "status", "off"],
      { timeout: TMUX_TIMEOUT_MS });
    // "largest" sizing ensures the session expands to the biggest attached
    // client instead of shrinking to the smallest — critical for shared
    // viewing where desktop and mobile connect simultaneously.
    execFileSync("tmux", ["set-option", "-t", sessionName, "window-size", "largest"],
      { timeout: TMUX_TIMEOUT_MS });
  } catch (err) {
    killTmuxSession(sessionName);
    throw err;
  }

  // Bind to loopback only — the Next.js custom server proxies
  // terminal traffic through same-origin routes (/api/terminal/{port}),
  // so ttyd never needs to be reachable from the network directly.
  const child = spawn(
    "ttyd",
    ["-W", "-i", "127.0.0.1", "-p", String(port), "-q",
     "tmux", "attach-session", "-t", sessionName],
    { detached: true, stdio: "ignore" },
  );

  child.on("error", (err) => {
    console.error(`[issuectl] ttyd process ${child.pid} errored:`, err);
  });
  child.unref();

  if (child.pid === undefined) {
    killTmuxSession(sessionName);
    throw new Error("Failed to spawn ttyd: no PID returned");
  }

  // Brief health check — give ttyd a moment to crash on startup
  await new Promise((r) => setTimeout(r, 300));
  if (!isTtydAlive(child.pid)) {
    killTmuxSession(sessionName);
    throw new Error(
      `ttyd process ${child.pid} died immediately after spawn. Check that port ${port} is available and the workspace path exists.`,
    );
  }

  return { pid: child.pid, port };
}

/** Best-effort cleanup of a tmux session. */
function killTmuxSession(name: string): void {
  try {
    execFileSync("tmux", ["kill-session", "-t", name], {
      stdio: "ignore",
      timeout: TMUX_TIMEOUT_MS,
    });
  } catch { /* best effort */ }
}

/* ------------------------------------------------------------------ */
/*  reconcileOrphanedDeployments                                       */
/* ------------------------------------------------------------------ */

/**
 * Find active deployments whose ttyd process has died and mark them
 * as ended. Called during startup so the UI never shows a phantom
 * session.
 */
export function reconcileOrphanedDeployments(db: Database.Database): void {
  const rows = db
    .prepare(
      "SELECT id, ttyd_pid FROM deployments WHERE ended_at IS NULL AND ttyd_pid IS NOT NULL",
    )
    .all() as { id: number; ttyd_pid: number }[];

  for (const row of rows) {
    if (!isTtydAlive(row.ttyd_pid)) {
      db.prepare("UPDATE deployments SET ended_at = datetime('now') WHERE id = ?").run(
        row.id,
      );
      console.warn(
        `[issuectl] Reconciled orphaned deployment ${row.id} (ttyd pid ${row.ttyd_pid} is dead)`,
      );
    }
  }
}
