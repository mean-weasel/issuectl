import type Database from "better-sqlite3";
import {
  getRepoById,
  recordDiagnosticEventSafely,
} from "@issuectl/core";
import { notifyDeploymentTerminalOutcome } from "@/lib/push/notifications";

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
  | { accepted: false; reason: string };

export const AGENT_COMPLETION_STATUSES: AgentCompletionStatus[] = [
  "completed",
  "failed",
  "no_changes",
  "pushed_fixes",
];

type CompletionSession = {
  repoId: number;
  issueNumber: number | null;
  targetType: "issue" | "pr";
  targetNumber: number;
  completionToken: string | null;
  completionResultJson: string | null;
};

type CompletionSessionRow = {
  repo_id: number;
  issue_number: number | null;
  target_type: "issue" | "pr" | null;
  target_number: number | null;
  completion_token: string | null;
  completion_result_json: string | null;
};

export function isAgentCompletionStatus(value: unknown): value is AgentCompletionStatus {
  return typeof value === "string" && AGENT_COMPLETION_STATUSES.includes(value as AgentCompletionStatus);
}

export function recordAgentCompletionCheckIn(
  db: Database.Database,
  input: AgentCompletionInput,
): AgentCompletionResult {
  const session = getCompletionSession(db, input.deploymentId);
  if (!session) return deny(db, input, "unknown_deployment");
  if (!session.completionToken || session.completionToken !== input.completionToken) {
    return deny(db, input, "invalid_token");
  }

  const resultJson = JSON.stringify(completionResult(input));
  const terminalReason = input.status === "failed" ? "failed" : "completed";
  const result = db.prepare(
    `UPDATE deployments
     SET terminal_reason = ?, completion_result_json = ?, ended_at = COALESCE(ended_at, datetime('now')), idle_since = NULL
     WHERE id = ? AND completion_result_json IS NULL`,
  ).run(terminalReason, resultJson, input.deploymentId);
  if (result.changes > 0) {
    markLinkedPrReviewCompleted(db, input, session, resultJson);
    recordCompletionDiagnostic(db, input, "agent.completion_recorded", "info");
    recordCompletionDiagnostic(db, input, "webhook.completed", "info");
    notifyDeploymentTerminalOutcome({ deploymentId: input.deploymentId });
    return { accepted: true, duplicate: false };
  }
  if (session.completionResultJson === resultJson) {
    recordCompletionDiagnostic(db, input, "agent.completion_duplicate", "info");
    return { accepted: true, duplicate: true };
  }
  return deny(db, input, "already_completed");
}

function getCompletionSession(
  db: Database.Database,
  deploymentId: number,
): CompletionSession | undefined {
  const targetTypeSelect = hasColumn(db, "deployments", "target_type")
    ? "target_type"
    : "'issue' AS target_type";
  const targetNumberSelect = hasColumn(db, "deployments", "target_number")
    ? "target_number"
    : "issue_number AS target_number";
  const row = db.prepare(
    `SELECT repo_id, issue_number, ${targetTypeSelect}, ${targetNumberSelect}, completion_token, completion_result_json
     FROM deployments
     WHERE id = ?`,
  ).get(deploymentId) as CompletionSessionRow | undefined;
  return row ? {
    repoId: row.repo_id,
    issueNumber: row.issue_number,
    targetType: row.target_type ?? "issue",
    targetNumber: row.target_number ?? row.issue_number ?? 0,
    completionToken: row.completion_token,
    completionResultJson: row.completion_result_json,
  } : undefined;
}

function deny(db: Database.Database, input: AgentCompletionInput, reason: string): AgentCompletionResult {
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
  const session = getCompletionSession(db, input.deploymentId);
  const repo = session ? getRepoById(db, session.repoId) : undefined;
  const targetType = session?.targetType;
  const targetNumber = session?.targetNumber ?? undefined;
  recordDiagnosticEventSafely(db, {
    level,
    event,
    source: "agent.completion",
    owner: repo?.owner,
    repo: repo?.name,
    issueNumber: targetType === "issue" ? targetNumber : undefined,
    targetType,
    targetNumber,
    deploymentId: input.deploymentId,
    status: reason ?? input.status,
    message: reason ? `Agent completion denied: ${reason}` : "Agent completion recorded",
    data: { status: input.status, reason, targetType, targetNumber },
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

function markLinkedPrReviewCompleted(
  db: Database.Database,
  input: AgentCompletionInput,
  session: CompletionSession,
  resultJson: string,
): void {
  if (session.targetType !== "pr") return;
  const row = db.prepare(
    `SELECT id, reviewed_to_sha, result_json
     FROM pr_reviews
     WHERE deployment_id = ? AND status IN ('reserved', 'launching', 'in_progress')
     ORDER BY started_at DESC, id DESC LIMIT 1`,
  ).get(input.deploymentId) as { id: number; reviewed_to_sha: string; result_json: string | null } | undefined;
  if (!row) return;
  const previous = parseResult(row.result_json);
  const current = parseResult(resultJson);
  const completedHeadSha = input.finalHeadSha ?? input.pushedCommitSha ?? row.reviewed_to_sha;
  db.prepare(
    `UPDATE pr_reviews
     SET status = ?,
         completed_head_sha = ?,
         completed_at = ?,
         result_json = ?
     WHERE id = ?`,
  ).run(input.status === "failed" ? "failed" : "completed", completedHeadSha, Date.now(), JSON.stringify({
    ...previous,
    ...current,
  }), row.id);
  if (typeof previous.desiredHeadSha === "string" && previous.followUpGeneration === 1) {
    scheduleFollowUpIntent(db, session, previous.desiredHeadSha);
  }
}

function scheduleFollowUpIntent(db: Database.Database, session: CompletionSession, desiredHeadSha: string): void {
  const now = Date.now();
  const active = db.prepare(
    `SELECT id FROM webhook_intents
     WHERE repo_id = ? AND target_type = 'pr' AND target_number = ?
       AND status IN ('pending', 'processing', 'deferred')
     ORDER BY id ASC LIMIT 1`,
  ).get(session.repoId, session.targetNumber) as { id: number } | undefined;
  if (active) {
    db.prepare(
      `UPDATE webhook_intents
       SET last_signal_at = ?, scheduled_at = ?, desired_head_sha = COALESCE(?, desired_head_sha),
           signal_count = signal_count + 1
       WHERE id = ?`,
    ).run(now, now, desiredHeadSha, active.id);
    return;
  }
  db.prepare(
    `INSERT INTO webhook_intents (
      repo_id, target_type, target_number, first_signal_at, last_signal_at,
      scheduled_at, desired_head_sha, status
    ) VALUES (?, 'pr', ?, ?, ?, ?, ?, 'pending')`,
  ).run(session.repoId, session.targetNumber, now, now, now, desiredHeadSha);
}

function parseResult(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((item) => item.name === column);
}
