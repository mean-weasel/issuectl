import type Database from "better-sqlite3";
import type { AgentMutationAction } from "./mutation-types";

export function ensureAgentActionBudget(
  db: Database.Database,
  deploymentId: number,
  actionType: AgentMutationAction,
): void {
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO agent_action_budgets (
      deployment_id, action_type, limit_count, used_count, created_at, updated_at
    ) VALUES (?, ?, 0, 0, ?, ?)`,
  ).run(deploymentId, actionType, now, now);
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
