import {
  getDb,
  getActiveDeploymentByPort,
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
 * Exported for testing — the interval calls this internally.
 */
export function checkIdleDeployments(): void {
  const db = getDb();
  const rawGrace = getSetting(db, "idle_grace_period");
  const graceSec =
    rawGrace !== null && rawGrace !== undefined
      ? Number(rawGrace)
      : DEFAULT_GRACE_SECONDS;
  const rawThreshold = getSetting(db, "idle_threshold");
  const thresholdSec =
    rawThreshold !== null && rawThreshold !== undefined
      ? Number(rawThreshold)
      : DEFAULT_THRESHOLD_SECONDS;
  const now = Date.now();

  for (const port of getRegisteredPorts()) {
    try {
      const lastOutput = getLastPtyOutput(port);
      if (lastOutput === undefined) continue;

      const deployment = getActiveDeploymentByPort(db, port);
      if (!deployment) continue;

      // Skip if still within grace period after launch
      const launchedAtMs = new Date(deployment.launchedAt).getTime();
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

export function startIdleChecker(): void {
  if (timer) return;
  timer = setInterval(checkIdleDeployments, CHECK_INTERVAL_MS);
  timer.unref();
  log.info({ msg: "idle_checker_started", intervalMs: CHECK_INTERVAL_MS });
}

export function stopIdleChecker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
