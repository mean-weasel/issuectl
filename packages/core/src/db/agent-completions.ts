import type Database from "better-sqlite3";
import type { DeploymentTerminalReason } from "../types.js";
import { getDeploymentById } from "./deployments.js";
import { getRepoById } from "./repos.js";
import { recordDiagnosticEventSafely } from "./diagnostics.js";
import { finishActivePrReviewForDeployment } from "./pr-reviews.js";

export type AgentCompletionStatus =
  | "completed"
  | "failed"
  | "no_changes"
  | "pushed_fixes";

export type AgentCompletionInput = {
  deploymentId: number;
  completionToken: string;
  status: AgentCompletionStatus;
  summary: string;
  finalHeadSha?: string;
  pushedCommitSha?: string;
};

export type AgentCompletionResult =
  | { accepted: true; duplicate: boolean }
  | { accepted: false; reason: "unknown_deployment" | "invalid_token" | "already_completed" };

export const AGENT_COMPLETION_STATUSES: AgentCompletionStatus[] = [
  "completed",
  "failed",
  "no_changes",
  "pushed_fixes",
];

export function isAgentCompletionStatus(value: unknown): value is AgentCompletionStatus {
  return typeof value === "string" && AGENT_COMPLETION_STATUSES.includes(value as AgentCompletionStatus);
}

export function recordAgentCompletionCheckIn(
  db: Database.Database,
  input: AgentCompletionInput,
): AgentCompletionResult {
  const deployment = getDeploymentById(db, input.deploymentId);
  if (!deployment) return deny(db, input, "unknown_deployment");
  if (!deployment.completionToken || deployment.completionToken !== input.completionToken) {
    return deny(db, input, "invalid_token");
  }

  const resultJson = JSON.stringify(completionResult(input));
  const terminalReason: DeploymentTerminalReason = input.status === "failed" ? "failed" : "completed";
  const result = db.prepare(
    `UPDATE deployments
     SET terminal_reason = ?, completion_result_json = ?, ended_at = COALESCE(ended_at, datetime('now')), idle_since = NULL
     WHERE id = ? AND completion_result_json IS NULL`,
  ).run(terminalReason, resultJson, input.deploymentId);
  if (result.changes > 0) {
    if (deployment.targetType === "pr") {
      finishActivePrReviewForDeployment(db, deployment.id, {
        completedAt: Date.now(),
        completedHeadSha: input.finalHeadSha ?? input.pushedCommitSha,
        status: input.status === "failed" ? "failed" : "completed",
        result: completionResult(input),
      });
    }
    recordCompletionDiagnostic(db, input, "agent.completion_recorded", "info");
    return { accepted: true, duplicate: false };
  }

  const current = getDeploymentById(db, input.deploymentId);
  if (current?.completionResultJson === resultJson) {
    recordCompletionDiagnostic(db, input, "agent.completion_duplicate", "info");
    return { accepted: true, duplicate: true };
  }
  return deny(db, input, "already_completed");
}

function deny(
  db: Database.Database,
  input: AgentCompletionInput,
  reason: "unknown_deployment" | "invalid_token" | "already_completed",
): AgentCompletionResult {
  recordCompletionDiagnostic(db, input, "agent.completion_denied", "warn", reason);
  return { accepted: false, reason };
}

function recordCompletionDiagnostic(
  db: Database.Database,
  input: AgentCompletionInput,
  event: string,
  level: "info" | "warn",
  reason?: string,
): void {
  const deployment = getDeploymentById(db, input.deploymentId);
  const repo = deployment ? getRepoById(db, deployment.repoId) : undefined;
  recordDiagnosticEventSafely(db, {
    level,
    event,
    source: "agent.completion",
    owner: repo?.owner,
    repo: repo?.name,
    issueNumber: deployment?.issueNumber ?? undefined,
    deploymentId: input.deploymentId,
    status: reason ?? input.status,
    message: reason ? `Agent completion denied: ${reason}` : "Agent completion recorded",
    data: {
      status: input.status,
      reason,
      targetType: deployment?.targetType,
      targetNumber: deployment?.targetNumber,
    },
  });
}

function completionResult(input: AgentCompletionInput): Record<string, string> {
  return {
    status: input.status,
    summary: input.summary,
    ...(input.finalHeadSha ? { finalHeadSha: input.finalHeadSha } : {}),
    ...(input.pushedCommitSha ? { pushedCommitSha: input.pushedCommitSha } : {}),
  };
}
