import type { DiagnosticEvent } from "@issuectl/core";

export type TerminalBackend = "ttyd" | "pty_bridge" | "unknown";

export type BackendSummary = {
  backend: TerminalBackend;
  events: number;
  launches: number;
  activations: number;
  firstOutput: number;
  reconnects: number;
  failures: number;
  cleanups: number;
};

export function summarizeBackends(events: DiagnosticEvent[], db?: unknown): BackendSummary[] {
  const summaries = new Map<TerminalBackend, BackendSummary>();
  for (const event of events) {
    const backend = inferBackend(event, db);
    const summary = summaries.get(backend) ?? emptySummary(backend);
    summary.events += 1;
    if (isLaunchEvent(event.event)) summary.launches += 1;
    if (event.event === "deployment.activated") summary.activations += 1;
    if (event.event === "terminal.first_output_seen" || event.event === "pty.first_output_seen") {
      summary.firstOutput += 1;
    }
    if (event.event === "ensure_ttyd.respawned" || event.event === "terminal.respawned") {
      summary.reconnects += 1;
    }
    if (event.level === "error" || event.event.endsWith("_failed") || event.event.endsWith(".failed")) {
      summary.failures += 1;
    }
    if (isCleanupEvent(event.event)) summary.cleanups += 1;
    summaries.set(backend, summary);
  }
  return [...summaries.values()].sort((left, right) => left.backend.localeCompare(right.backend));
}

function inferBackend(event: DiagnosticEvent, db?: unknown): TerminalBackend {
  const dataBackend = event.data?.backend;
  if (dataBackend === "ttyd" || dataBackend === "pty_bridge") return dataBackend;
  if (event.event.startsWith("pty.")) return "pty_bridge";
  if (event.event.startsWith("ttyd.") || event.event.startsWith("terminal.") || event.event.startsWith("ensure_ttyd.")) {
    return "ttyd";
  }
  if (event.deploymentId !== null) {
    const backend = lookupDeploymentBackend(db, event.deploymentId);
    if (backend) return backend;
  }
  return "unknown";
}

function lookupDeploymentBackend(db: unknown, deploymentId: number): TerminalBackend | null {
  if (!db || typeof db !== "object" || !("prepare" in db) || typeof db.prepare !== "function") {
    return null;
  }
  try {
    const row = db
      .prepare("SELECT terminal_backend FROM deployments WHERE id = ?")
      .get(deploymentId) as { terminal_backend?: unknown } | undefined;
    return row?.terminal_backend === "ttyd" || row?.terminal_backend === "pty_bridge"
      ? row.terminal_backend
      : null;
  } catch {
    return null;
  }
}

function isLaunchEvent(event: string): boolean {
  return event === "ttyd.spawned" || event === "pty.bridge_spawned";
}

function isCleanupEvent(event: string): boolean {
  return event === "pty.tmux_killed" ||
    event === "pty.process_exit" ||
    event === "terminal.ws_closed" ||
    event === "pty.ws_closed";
}

function emptySummary(backend: TerminalBackend): BackendSummary {
  return {
    backend,
    events: 0,
    launches: 0,
    activations: 0,
    firstOutput: 0,
    reconnects: 0,
    failures: 0,
    cleanups: 0,
  };
}
