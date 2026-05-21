import {
  getActiveDeploymentByPort,
  getDb,
  getRepoById,
  recordDiagnosticEventSafely,
  type DiagnosticLevel,
} from "@issuectl/core";

type Database = ReturnType<typeof getDb>;
type RepoRecord = NonNullable<ReturnType<typeof getRepoById>>;
type TerminalDeployment = {
  id: number;
  repoId: number;
  issueNumber: number;
  ttydPort?: number | null;
  ttydPid?: number | null;
};

type TerminalDiagnosticInput = {
  level: DiagnosticLevel;
  event: string;
  source: string;
  status?: string;
  message?: string;
  data?: Record<string, unknown> | null;
};

const SAFE_DATA_KEYS = new Set([
  "activeWs",
  "backpressureDrops",
  "bufferedBytes",
  "bytesOut",
  "dropped",
  "droppedDuringEpisode",
  "durationMs",
  "framesIn",
  "framesOut",
  "newPid",
  "oldPid",
  "peakBuffered",
  "pendingMessages",
  "statusCode",
  "uptimeSec",
]);

export function sanitizeTerminalDiagnosticData(
  data: Record<string, unknown> | null | undefined,
): Record<string, number | boolean> | null {
  if (!data) return null;
  const safe: Record<string, number | boolean> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!SAFE_DATA_KEYS.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      safe[key] = value;
    } else if (typeof value === "boolean") {
      safe[key] = value;
    }
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

export function recordTerminalEventForPort(
  port: number,
  input: TerminalDiagnosticInput,
): void {
  try {
    const db = getDb();
    const ttydPort = Number.isInteger(port) ? port : undefined;
    const deployment = ttydPort === undefined
      ? undefined
      : getActiveDeploymentByPort(db, ttydPort);
    if (!deployment) {
      recordDiagnosticEventSafely(db, {
        ...input,
        ttydPort,
        data: sanitizeTerminalDiagnosticData(input.data),
      });
      return;
    }
    recordTerminalEventForDeployment(db, deployment, input);
  } catch {
    // Diagnostics must never break terminal attach/proxy behavior.
  }
}

export function recordTerminalEventForDeployment(
  db: Database,
  deployment: TerminalDeployment,
  input: TerminalDiagnosticInput,
  repo?: RepoRecord,
): void {
  let resolvedRepo = repo;
  if (!resolvedRepo) {
    try {
      resolvedRepo = getRepoById(db, deployment.repoId);
    } catch {
      resolvedRepo = undefined;
    }
  }

  recordDiagnosticEventSafely(db, {
    ...input,
    owner: resolvedRepo?.owner,
    repo: resolvedRepo?.name,
    issueNumber: deployment.issueNumber,
    deploymentId: deployment.id,
    ttydPort: deployment.ttydPort ?? undefined,
    ttydPid: deployment.ttydPid ?? undefined,
    data: sanitizeTerminalDiagnosticData(input.data),
  });
}
