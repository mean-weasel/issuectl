import type Database from "better-sqlite3";
import type { DeploymentTargetType } from "../types.js";
import { getDeploymentById } from "./deployments.js";
import { getRepoById } from "./repos.js";
import { recordDiagnosticEventSafely } from "./diagnostics.js";

export type AgentMutationAction =
  | "push"
  | "comment"
  | "label"
  | "create_issue"
  | "create_pr";

export type AgentMutationDenialReason =
  | "unknown_deployment"
  | "deployment_ended"
  | "invalid_token"
  | "target_mismatch"
  | "manual_session"
  | "action_unimplemented";

export type AgentMutationDecision =
  | { allowed: true }
  | { allowed: false; reason: AgentMutationDenialReason };

export type AgentMutationRequest = {
  deploymentId: number;
  completionToken: string;
  repoId: number;
  targetType: DeploymentTargetType;
  targetNumber: number;
  actionType: AgentMutationAction;
};

export type AgentActionBudget = {
  deploymentId: number;
  actionType: AgentMutationAction;
  limitCount: number;
  usedCount: number;
};

type AgentActionBudgetRow = {
  deployment_id: number;
  action_type: string;
  limit_count: number;
  used_count: number;
};

export const AGENT_MUTATION_ACTIONS: AgentMutationAction[] = [
  "push",
  "comment",
  "label",
  "create_issue",
  "create_pr",
];

export function isAgentMutationAction(value: unknown): value is AgentMutationAction {
  return typeof value === "string" && AGENT_MUTATION_ACTIONS.includes(value as AgentMutationAction);
}

export function evaluateAgentMutationBudgetPreview(
  db: Database.Database,
  request: AgentMutationRequest,
): AgentMutationDecision {
  const deployment = getDeploymentById(db, request.deploymentId);
  if (!deployment) return deny(db, request, "unknown_deployment");
  if (deployment.endedAt !== null) return deny(db, request, "deployment_ended");
  if (!deployment.completionToken || deployment.completionToken !== request.completionToken) {
    return deny(db, request, "invalid_token");
  }
  if (
    deployment.repoId !== request.repoId ||
    deployment.targetType !== request.targetType ||
    deployment.targetNumber !== request.targetNumber
  ) {
    return deny(db, request, "target_mismatch");
  }
  if (deployment.triggeredBy === "manual") return deny(db, request, "manual_session");

  ensureAgentActionBudget(db, request.deploymentId, request.actionType, 0);
  return deny(db, request, "action_unimplemented");
}

export function getAgentActionBudget(
  db: Database.Database,
  deploymentId: number,
  actionType: AgentMutationAction,
): AgentActionBudget | undefined {
  const row = db
    .prepare(
      `SELECT deployment_id, action_type, limit_count, used_count
       FROM agent_action_budgets
       WHERE deployment_id = ? AND action_type = ?`,
    )
    .get(deploymentId, actionType) as AgentActionBudgetRow | undefined;
  return row ? rowToBudget(row) : undefined;
}

export function setAgentActionBudget(
  db: Database.Database,
  deploymentId: number,
  actionType: AgentMutationAction,
  limitCount: number,
): AgentActionBudget {
  if (!Number.isInteger(limitCount) || limitCount < 0) {
    throw new Error("Action budget limit must be a non-negative integer");
  }
  const now = Date.now();
  db.prepare(
    `INSERT INTO agent_action_budgets (
      deployment_id, action_type, limit_count, used_count, created_at, updated_at
    ) VALUES (?, ?, ?, 0, ?, ?)
    ON CONFLICT(deployment_id, action_type) DO UPDATE SET
      limit_count = excluded.limit_count,
      used_count = MIN(agent_action_budgets.used_count, excluded.limit_count),
      updated_at = excluded.updated_at`,
  ).run(deploymentId, actionType, limitCount, now, now);
  const budget = getAgentActionBudget(db, deploymentId, actionType);
  if (!budget) throw new Error("Failed to read action budget after update");
  return budget;
}

export function claimAgentActionBudget(
  db: Database.Database,
  deploymentId: number,
  actionType: AgentMutationAction,
): boolean {
  const result = db.prepare(
    `UPDATE agent_action_budgets
     SET used_count = used_count + 1, updated_at = ?
     WHERE deployment_id = ? AND action_type = ? AND used_count < limit_count`,
  ).run(Date.now(), deploymentId, actionType);
  return result.changes > 0;
}

function ensureAgentActionBudget(
  db: Database.Database,
  deploymentId: number,
  actionType: AgentMutationAction,
  limitCount: number,
): void {
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO agent_action_budgets (
      deployment_id, action_type, limit_count, used_count, created_at, updated_at
    ) VALUES (?, ?, ?, 0, ?, ?)`,
  ).run(deploymentId, actionType, limitCount, now, now);
}

function deny(
  db: Database.Database,
  request: AgentMutationRequest,
  reason: AgentMutationDenialReason,
): AgentMutationDecision {
  const repo = getRepoById(db, request.repoId);
  recordDiagnosticEventSafely(db, {
    level: reason === "action_unimplemented" ? "info" : "warn",
    event: "agent.mutation_denied",
    source: "agent.mutations",
    owner: repo?.owner,
    repo: repo?.name,
    deploymentId: request.deploymentId,
    status: reason,
    message: `Agent mutation denied: ${reason}`,
    data: {
      actionType: request.actionType,
      reason,
      repoId: request.repoId,
      targetType: request.targetType,
      targetNumber: request.targetNumber,
    },
  });
  return { allowed: false, reason };
}

function rowToBudget(row: AgentActionBudgetRow): AgentActionBudget {
  return {
    deploymentId: row.deployment_id,
    actionType: row.action_type as AgentMutationAction,
    limitCount: row.limit_count,
    usedCount: row.used_count,
  };
}
