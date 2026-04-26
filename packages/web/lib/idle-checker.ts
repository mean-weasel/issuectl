import {
  getDb,
  getActiveDeploymentByPort,
  getActiveDeployments,
  endDeployment,
  isTmuxSessionAlive,
  tmuxSessionName,
  getSetting,
  setIdleSince,
  clearIdleSince,
} from "@issuectl/core";
import { getRegisteredPorts, getLastPtyOutput } from "./idle-registry";
import log from "./logger";

const DEFAULT_GRACE_SECONDS = 300;
const DEFAULT_THRESHOLD_SECONDS = 300;
const CHECK_INTERVAL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Inspect all registered WS connections and update idle_since in the DB.
 * Called on a 60s interval by startIdleChecker; exported so tests can
 * invoke it directly.
 */
export function checkIdleDeployments(): void {
  let db;
  try {
    db = getDb();
  } catch (err) {
    log.error({ msg: "idle_check_db_unavailable", err });
    return;
  }

  const graceSec = parseSetting(db, "idle_grace_period", DEFAULT_GRACE_SECONDS);
  const thresholdSec = parseSetting(db, "idle_threshold", DEFAULT_THRESHOLD_SECONDS);
  const now = Date.now();

  for (const port of getRegisteredPorts()) {
    try {
      const lastOutput = getLastPtyOutput(port);
      if (lastOutput === undefined) continue;

      const deployment = getActiveDeploymentByPort(db, port);
      if (!deployment) continue;

      // Skip if still within grace period after launch
      const launchedAtMs = new Date(deployment.launchedAt).getTime();
      if (!Number.isFinite(launchedAtMs)) {
        log.warn({ msg: "idle_check_invalid_launch_date", port, deploymentId: deployment.id, launchedAt: deployment.launchedAt });
        continue;
      }
      if (now - launchedAtMs < graceSec * 1000) continue;

      const silentMs = now - lastOutput;
      const isIdle = silentMs > thresholdSec * 1000;

      if (isIdle && !deployment.idleSince) {
        setIdleSince(db, deployment.id);
        log.info({
          msg: "idle_detected",
          port,
          deploymentId: deployment.id,
          silentSec: Math.round(silentMs / 1000),
        });
      } else if (!isIdle && deployment.idleSince) {
        clearIdleSince(db, deployment.id);
        log.info({
          msg: "idle_cleared",
          port,
          deploymentId: deployment.id,
        });
      }
    } catch (err) {
      log.error({ msg: "idle_check_error", port, err });
    }
  }
}

function parseSetting(
  db: Parameters<typeof getSetting>[0],
  key: Parameters<typeof getSetting>[1],
  defaultValue: number,
): number {
  const raw = getSetting(db, key);
  if (raw === undefined) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    log.warn({ msg: "idle_setting_invalid", key, rawValue: raw, usingDefault: defaultValue });
    return defaultValue;
  }
  return parsed;
}

/**
 * Check all active deployments for dead tmux sessions and end them.
 * The tmux session is the real liveness signal — ttyd may exit on
 * client disconnect (`-q` flag) while the session is still alive and
 * reconnectable. Only end the deployment when the tmux session itself
 * is gone.
 */
export function checkDeploymentLiveness(): void {
  let db;
  try {
    db = getDb();
  } catch (err) {
    log.error({ msg: "liveness_check_db_unavailable", err });
    return;
  }

  let deployments;
  try {
    deployments = getActiveDeployments(db);
  } catch (err) {
    log.error({ msg: "liveness_check_query_failed", err });
    return;
  }

  for (const deployment of deployments) {
    try {
      const sessionName = tmuxSessionName(deployment.repoName, deployment.issueNumber);
      if (!isTmuxSessionAlive(sessionName)) {
        endDeployment(db, deployment.id);
        log.info({
          msg: "deployment_session_dead",
          deploymentId: deployment.id,
          issueNumber: deployment.issueNumber,
          sessionName,
        });
      }
    } catch (err) {
      log.error({ msg: "liveness_check_error", deploymentId: deployment.id, err });
    }
  }
}

export function startIdleChecker(): void {
  if (timer) return;
  timer = setInterval(() => {
    checkIdleDeployments();
    checkDeploymentLiveness();
  }, CHECK_INTERVAL_MS);
  timer.unref();
  log.info({ msg: "idle_checker_started", intervalMs: CHECK_INTERVAL_MS });
}

export function stopIdleChecker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
