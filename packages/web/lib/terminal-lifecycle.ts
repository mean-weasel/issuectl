import {
  endDeployment,
  getActiveDeploymentByPort,
  getDb,
  getRepoById,
  isTmuxSessionAlive,
  isTtydAlive,
  respawnTtyd,
  tmuxSessionName,
  updateTtydInfo,
} from "@issuectl/core";
import log from "./logger";
import { recordTerminalEventForDeployment } from "./terminal-diagnostics";

const PORT_MIN = 7700;
const PORT_MAX = 7799;

export function isValidTerminalPort(port: number): boolean {
  if (!Number.isFinite(port) || port < PORT_MIN || port > PORT_MAX) {
    return false;
  }
  try {
    const db = getDb();
    return getActiveDeploymentByPort(db, port) !== undefined;
  } catch (err) {
    log.error({ msg: "terminal_port_check_db_error", port, err });
    return false;
  }
}

const respawnInFlight = new Map<number, Promise<boolean>>();

export async function ensureTtydRunning(port: number): Promise<boolean> {
  let db;
  try {
    db = getDb();
  } catch (err) {
    log.error({ msg: "ttyd_respawn_db_unavailable", port, err });
    return false;
  }

  const deployment = getActiveDeploymentByPort(db, port);
  if (!deployment) {
    log.debug({ msg: "ttyd_no_active_deployment", port });
    return false;
  }

  if (!deployment.ttydPid) {
    log.warn({ msg: "ttyd_no_pid_recorded", port, deploymentId: deployment.id });
    recordTerminalEventForDeployment(db, deployment, {
      level: "warn",
      event: "terminal.unavailable",
      source: "web.terminal-lifecycle",
      message: "No ttyd PID recorded",
    });
    return false;
  }

  if (isTtydAlive(deployment.ttydPid)) return true;

  const existing = respawnInFlight.get(port);
  if (existing) return existing;

  const promise = doRespawn(port, deployment, db);
  respawnInFlight.set(port, promise);
  try {
    return await promise;
  } finally {
    respawnInFlight.delete(port);
  }
}

async function doRespawn(
  port: number,
  deployment: { id: number; repoId: number; issueNumber: number; ttydPid: number | null },
  db: ReturnType<typeof getDb>,
): Promise<boolean> {
  const repo = getRepoById(db, deployment.repoId);
  if (!repo) {
    log.warn({ msg: "ttyd_respawn_no_repo", port, deploymentId: deployment.id, repoId: deployment.repoId });
    recordTerminalEventForDeployment(db, deployment, {
      level: "error",
      event: "terminal.respawn_failed",
      source: "web.terminal-lifecycle",
      message: "Repository not found",
    });
    return false;
  }

  const sessionName = tmuxSessionName(repo.name, deployment.issueNumber);
  let sessionAlive: boolean;
  try {
    sessionAlive = isTmuxSessionAlive(sessionName);
  } catch (err) {
    log.error({ msg: "ttyd_tmux_check_failed", port, deploymentId: deployment.id, sessionName, err });
    recordTerminalEventForDeployment(db, deployment, {
      level: "error",
      event: "terminal.tmux_check_failed",
      source: "web.terminal-lifecycle",
      message: err instanceof Error ? err.message : String(err),
    }, repo);
    return false;
  }

  if (!sessionAlive) {
    try {
      endDeployment(db, deployment.id);
    } catch (err) {
      log.debug({ msg: "ttyd_end_deployment_skipped", deploymentId: deployment.id, err });
    }
    log.info({ msg: "ttyd_session_dead", port, deploymentId: deployment.id, sessionName });
    recordTerminalEventForDeployment(db, deployment, {
      level: "warn",
      event: "terminal.tmux_missing",
      source: "web.terminal-lifecycle",
      message: "Terminal session has ended",
    }, repo);
    return false;
  }

  try {
    recordTerminalEventForDeployment(db, deployment, {
      level: "info",
      event: "terminal.respawn_started",
      source: "web.terminal-lifecycle",
    }, repo);
    const result = await respawnTtyd(port, sessionName);
    updateTtydInfo(db, deployment.id, port, result.pid);
    log.info({
      msg: "ttyd_respawned",
      port,
      deploymentId: deployment.id,
      oldPid: deployment.ttydPid,
      newPid: result.pid,
      sessionName,
    });
    recordTerminalEventForDeployment(db, { ...deployment, ttydPid: result.pid }, {
      level: "info",
      event: "terminal.respawned",
      source: "web.terminal-lifecycle",
      data: { oldPid: deployment.ttydPid, newPid: result.pid },
    }, repo);
    return true;
  } catch (err) {
    log.error({ msg: "ttyd_respawn_failed", port, deploymentId: deployment.id, err });
    recordTerminalEventForDeployment(db, deployment, {
      level: "error",
      event: "terminal.respawn_failed",
      source: "web.terminal-lifecycle",
      message: err instanceof Error ? err.message : String(err),
    }, repo);
    return false;
  }
}
