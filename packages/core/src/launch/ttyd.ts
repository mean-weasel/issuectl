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
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/* ------------------------------------------------------------------ */
/*  verifyTtyd                                                         */
/* ------------------------------------------------------------------ */

/**
 * Verify that ttyd is installed and reachable via PATH.
 * Throws with an install hint when it is not found.
 */
export function verifyTtyd(): void {
  try {
    execFileSync("which", ["ttyd"], { stdio: "ignore" });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const status = (err as { status?: number }).status;
    if (code === "ENOENT" || status === 1) {
      throw new Error("ttyd is not installed. Run: brew install ttyd", { cause: err });
    }
    throw new Error(
      `Failed to verify ttyd installation: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  killTtyd                                                           */
/* ------------------------------------------------------------------ */

/**
 * Send SIGTERM to a ttyd process. Silently ignores ESRCH (process
 * already dead) — all other errors are re-thrown.
 */
export function killTtyd(pid: number): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") return;
    throw err;
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
 * Spawn a detached ttyd process that serves an interactive Claude
 * session over WebSocket. Returns the child PID and port.
 *
 * Includes a brief post-spawn health check — if ttyd crashes
 * immediately (e.g. port conflict, bad path), the error is surfaced
 * rather than silently recording a dead PID.
 */
export async function spawnTtyd(options: SpawnTtydOptions): Promise<{ pid: number; port: number }> {
  const { port, workspacePath, contextFilePath, claudeCommand } = options;

  // Build the inner shell command that ttyd will execute inside bash:
  //   cd <workspace> && cat <context> | <claudeCommand> ; exit
  const shellCommand =
    `cd ${shellEscape(workspacePath)} && cat ${shellEscape(contextFilePath)} | ${claudeCommand} ; exit`;

  // Bind to all interfaces so mobile/LAN devices can reach the
  // terminal when accessing the dashboard over the network.
  const child = spawn(
    "ttyd",
    ["-W", "-i", "0.0.0.0", "-p", String(port), "-q", "/bin/bash", "-lic", shellCommand],
    { detached: true, stdio: "ignore" },
  );

  child.on("error", (err) => {
    console.error(`[issuectl] ttyd process ${child.pid} errored:`, err);
  });
  child.unref();

  if (child.pid === undefined) {
    throw new Error("Failed to spawn ttyd: no PID returned");
  }

  // Brief health check — give ttyd a moment to crash on startup
  await new Promise((r) => setTimeout(r, 300));
  if (!isTtydAlive(child.pid)) {
    throw new Error(
      `ttyd process ${child.pid} died immediately after spawn. Check that port ${port} is available and the workspace path exists.`,
    );
  }

  return { pid: child.pid, port };
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
