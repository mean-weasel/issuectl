import type Database from "better-sqlite3";
import { recordDiagnosticEventSafely } from "../db/diagnostics.js";
import type { LaunchAgent } from "../types.js";
import type { WorkspaceMode } from "./workspace.js";

type LaunchDiagnosticContext = {
  db: Database.Database;
  correlationId: string;
  owner: string;
  repo: string;
  issueNumber: number;
};

export function createLaunchCorrelationId(): string {
  return `launch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function recordLaunchRequested(
  ctx: LaunchDiagnosticContext,
  data: { agent?: LaunchAgent; branchName: string; workspaceMode: WorkspaceMode },
): void {
  recordDiagnosticEventSafely(ctx.db, {
    ...baseEvent(ctx),
    level: "info",
    event: "launch.requested",
    data,
  });
}

export function recordWorkspacePrepared(
  ctx: LaunchDiagnosticContext,
  workspacePath: string,
): void {
  recordDiagnosticEventSafely(ctx.db, {
    ...baseEvent(ctx),
    level: "info",
    event: "workspace.prepared",
    data: { workspacePath },
  });
}

export function recordLaunchLabelsFailed(
  ctx: LaunchDiagnosticContext,
  message: string,
): void {
  recordDiagnosticEventSafely(ctx.db, {
    ...baseEvent(ctx),
    level: "warn",
    event: "launch.labels_failed",
    message,
  });
}

export function recordDeploymentRecorded(
  ctx: LaunchDiagnosticContext,
  deploymentId: number,
): void {
  recordDiagnosticEventSafely(ctx.db, {
    ...baseEvent(ctx),
    level: "info",
    event: "deployment.recorded",
    deploymentId,
    status: "pending",
  });
}

export function recordTtydSpawned(
  ctx: LaunchDiagnosticContext,
  data: { deploymentId: number; sessionName: string; ttydPort: number; ttydPid: number },
): void {
  recordDiagnosticEventSafely(ctx.db, {
    ...baseEvent(ctx),
    level: "info",
    event: "ttyd.spawned",
    ...data,
  });
}

export function recordLaunchSpawnFailed(
  ctx: LaunchDiagnosticContext,
  data: { deploymentId: number; sessionName: string; error: unknown },
): void {
  recordDiagnosticEventSafely(ctx.db, {
    ...baseEvent(ctx),
    level: "error",
    event: "launch.spawn_failed",
    deploymentId: data.deploymentId,
    sessionName: data.sessionName,
    message: errorMessage(data.error),
  });
}

export function recordDeploymentActivated(
  ctx: LaunchDiagnosticContext,
  deploymentId: number,
): void {
  recordDiagnosticEventSafely(ctx.db, {
    ...baseEvent(ctx),
    level: "info",
    event: "deployment.activated",
    deploymentId,
    status: "active",
  });
}

export function recordLaunchActivationFailed(
  ctx: LaunchDiagnosticContext,
  data: { deploymentId: number; error: unknown },
): void {
  recordDiagnosticEventSafely(ctx.db, {
    ...baseEvent(ctx),
    level: "error",
    event: "launch.activation_failed",
    deploymentId: data.deploymentId,
    status: "pending",
    message: errorMessage(data.error),
  });
}

function baseEvent(ctx: LaunchDiagnosticContext) {
  return {
    source: "core.launch",
    correlationId: ctx.correlationId,
    owner: ctx.owner,
    repo: ctx.repo,
    issueNumber: ctx.issueNumber,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
