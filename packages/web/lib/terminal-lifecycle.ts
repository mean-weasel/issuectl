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
    return false;
  }

  const sessionName = tmuxSessionName(repo.name, deployment.issueNumber);
  let sessionAlive: boolean;
  try {
    sessionAlive = isTmuxSessionAlive(sessionName);
  } catch (err) {
    log.error({ msg: "ttyd_tmux_check_failed", port, deploymentId: deployment.id, sessionName, err });
    return false;
  }

  if (!sessionAlive) {
    try {
      endDeployment(db, deployment.id);
    } catch (err) {
      log.debug({ msg: "ttyd_end_deployment_skipped", deploymentId: deployment.id, err });
    }
    log.info({ msg: "ttyd_session_dead", port, deploymentId: deployment.id, sessionName });
    return false;
  }

  try {
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
    return true;
  } catch (err) {
    log.error({ msg: "ttyd_respawn_failed", port, deploymentId: deployment.id, err });
    return false;
  }
}
