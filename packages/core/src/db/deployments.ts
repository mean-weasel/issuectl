/* eslint-disable max-lines */
import type Database from "better-sqlite3";
import type { Deployment, DeploymentState, DeploymentTargetType, DeploymentTerminalReason, DeploymentTriggeredBy, LaunchAgent, TerminalBackend } from "../types.js";
import { markActivePrReviewForDeploymentTerminal } from "./pr-reviews.js";

type DeploymentRow = {
  id: number; repo_id: number; issue_number: number | null; target_type: string; target_number: number; agent: string;
  branch_name: string; workspace_mode: string; workspace_path: string;
  linked_pr_number: number | null; state: string; terminal_backend: string;
  triggered_by: string; launched_at: string; ended_at: string | null;
  parent_deployment_id: number | null; webhook_depth: number;
  terminal_reason: string | null; completion_token: string | null;
  completion_result_json: string | null; notification_sent_at: string | null;
  ttyd_port: number | null; ttyd_pid: number | null; idle_since: string | null;
};

function rowToDeployment(row: DeploymentRow): Deployment {
  return {
    id: row.id,
    repoId: row.repo_id,
    issueNumber: row.issue_number,
    targetType: (row.target_type as DeploymentTargetType | undefined) ?? "issue",
    targetNumber: row.target_number,
    agent: (row.agent as LaunchAgent | undefined) ?? "claude",
    branchName: row.branch_name,
    workspaceMode: row.workspace_mode as Deployment["workspaceMode"],
    workspacePath: row.workspace_path,
    linkedPrNumber: row.linked_pr_number,
    state: (row.state as DeploymentState) ?? "active",
    terminalBackend: (row.terminal_backend as TerminalBackend | undefined) ?? "ttyd",
    triggeredBy: (row.triggered_by as DeploymentTriggeredBy | undefined) ?? "manual",
    parentDeploymentId: row.parent_deployment_id,
    webhookDepth: row.webhook_depth ?? 0,
    launchedAt: row.launched_at,
    endedAt: row.ended_at,
    terminalReason: row.terminal_reason as DeploymentTerminalReason | null,
    completionToken: row.completion_token,
    completionResultJson: row.completion_result_json,
    notificationSentAt: row.notification_sent_at,
    ttydPort: row.ttyd_port,
    ttydPid: row.ttyd_pid,
    idleSince: row.idle_since,
  };
}

export function recordDeployment(
  db: Database.Database,
  deployment: {
    repoId: number;
    issueNumber?: number | null;
    targetType?: DeploymentTargetType;
    targetNumber?: number;
    branchName: string;
    workspaceMode: Deployment["workspaceMode"];
    workspacePath: string;
    agent?: LaunchAgent;
    terminalBackend?: TerminalBackend;
    triggeredBy?: DeploymentTriggeredBy;
    parentDeploymentId?: number | null;
    webhookDepth?: number;
    completionToken?: string | null;
    /**
     * Optional initial state. Defaults to "active" for callers that want
     * the legacy one-shot write. The launch flow passes "pending" so the
     * row stays invisible to the UI and reconciler until `activateDeployment`
     * flips it after the terminal opens — or `deletePendingDeployment` unwinds
     * it after a launch failure.
     */
    state?: DeploymentState;
  },
): Deployment {
  const state: DeploymentState = deployment.state ?? "active";
  const agent: LaunchAgent = deployment.agent ?? "claude";
  const terminalBackend: TerminalBackend = deployment.terminalBackend ?? "ttyd";
  const triggeredBy: DeploymentTriggeredBy = deployment.triggeredBy ?? "manual";
  const targetType: DeploymentTargetType = deployment.targetType ?? "issue";
  const targetNumber = deployment.targetNumber ?? deployment.issueNumber;
  if (targetNumber === undefined || targetNumber === null || !Number.isInteger(targetNumber) || targetNumber <= 0) {
    throw new Error("Deployment target number is required");
  }
  const issueNumber = targetType === "issue" ? (deployment.issueNumber ?? targetNumber) : null;
  const result = db
    .prepare(
      `INSERT INTO deployments (
        repo_id, issue_number, target_type, target_number, agent, terminal_backend,
        triggered_by, parent_deployment_id, webhook_depth, branch_name,
        workspace_mode, workspace_path, state, completion_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      deployment.repoId,
      issueNumber,
      targetType,
      targetNumber,
      agent,
      terminalBackend,
      triggeredBy,
      deployment.parentDeploymentId ?? null,
      deployment.webhookDepth ?? 0,
      deployment.branchName,
      deployment.workspaceMode,
      deployment.workspacePath,
      state,
      deployment.completionToken ?? null,
    );

  const inserted = getDeploymentById(db, Number(result.lastInsertRowid));
  if (!inserted) throw new Error("Failed to read back deployment after insert");
  return inserted;
}

export function getDeploymentById(db: Database.Database, id: number): Deployment | undefined {
  const row = db
    .prepare("SELECT * FROM deployments WHERE id = ?")
    .get(id) as DeploymentRow | undefined;
  return row ? rowToDeployment(row) : undefined;
}

export function getDeploymentsForIssue(db: Database.Database, repoId: number, issueNumber: number): Deployment[] {
  // Filter out "pending" rows — they represent in-flight launches whose
  // terminal hasn't opened yet. UI components, the lifecycle reconciler,
  // and the unified list all call this and should never see a pending
  // deployment. The rollback path in executeLaunch holds the ID directly
  // and uses getDeploymentById, which bypasses this filter.
  const rows = db
    .prepare(
      "SELECT * FROM deployments WHERE repo_id = ? AND issue_number = ? AND state = 'active' ORDER BY launched_at DESC",
    )
    .all(repoId, issueNumber) as DeploymentRow[];
  return rows.map(rowToDeployment);
}

export function getDeploymentsForTarget(
  db: Database.Database,
  repoId: number,
  targetType: DeploymentTargetType,
  targetNumber: number,
): Deployment[] {
  const rows = db
    .prepare(
      `SELECT *
       FROM deployments
       WHERE repo_id = ?
         AND target_type = ?
         AND target_number = ?
         AND state = 'active'
       ORDER BY launched_at DESC`,
    )
    .all(repoId, targetType, targetNumber) as DeploymentRow[];
  return rows.map(rowToDeployment);
}

export function getDeploymentsByRepo(db: Database.Database, repoId: number): Deployment[] {
  // See getDeploymentsForIssue — pending rows are excluded from all
  // callers except the launch rollback path.
  const rows = db
    .prepare(
      "SELECT * FROM deployments WHERE repo_id = ? AND state = 'active' ORDER BY launched_at DESC",
    )
    .all(repoId) as DeploymentRow[];
  return rows.map(rowToDeployment);
}

export function getActiveWebhookDeploymentsForRepoTarget(
  db: Database.Database,
  repoId: number,
  targetType: DeploymentTargetType,
): Deployment[] {
  const rows = db.prepare(
    `SELECT *
     FROM deployments
     WHERE repo_id = ?
       AND target_type = ?
       AND triggered_by = 'webhook'
       AND state = 'active'
       AND ended_at IS NULL
     ORDER BY launched_at DESC`,
  ).all(repoId, targetType) as DeploymentRow[];
  return rows.map(rowToDeployment);
}

export function listRecentTerminalDeploymentsByRepo(
  db: Database.Database,
  repoId: number,
  limit = 5,
): Deployment[] {
  const boundedLimit = Math.max(1, Math.floor(limit));
  const rows = db.prepare(
    `SELECT *
     FROM deployments
     WHERE repo_id = ?
       AND ended_at IS NOT NULL
     ORDER BY ended_at DESC, id DESC
     LIMIT ?`,
  ).all(repoId, boundedLimit) as DeploymentRow[];
  return rows.map(rowToDeployment);
}

/**
 * "Live" means pending or active (ended rows are excluded) — matches
 * the `idx_deployments_live` partial unique index predicate.
 */
export function hasLiveDeploymentForIssue(db: Database.Database, repoId: number, issueNumber: number): boolean {
  const row = db
    .prepare(
      "SELECT 1 FROM deployments WHERE repo_id = ? AND issue_number = ? AND ended_at IS NULL LIMIT 1",
    )
    .get(repoId, issueNumber);
  return row !== undefined;
}

export function hasLiveDeploymentForTarget(
  db: Database.Database, repoId: number, targetType: DeploymentTargetType, targetNumber: number,
): boolean {
  const row = db.prepare(
    "SELECT 1 FROM deployments WHERE repo_id = ? AND target_type = ? AND target_number = ? AND ended_at IS NULL LIMIT 1",
  ).get(repoId, targetType, targetNumber);
  return row !== undefined;
}

/**
 * Look up the active (non-ended, non-pending) deployment that owns a
 * given ttyd port. Used by the WebSocket proxy to validate that a port
 * belongs to a real session before forwarding traffic.
 */
export function getActiveDeploymentByPort(db: Database.Database, port: number): Deployment | undefined {
  const row = db
    .prepare(
      "SELECT * FROM deployments WHERE ttyd_port = ? AND state = 'active' AND ended_at IS NULL LIMIT 1",
    )
    .get(port) as DeploymentRow | undefined;
  return row ? rowToDeployment(row) : undefined;
}

export function updateLinkedPR(db: Database.Database, deploymentId: number, prNumber: number): void {
  const result = db
    .prepare("UPDATE deployments SET linked_pr_number = ? WHERE id = ?")
    .run(prNumber, deploymentId);
  if (result.changes === 0) {
    throw new Error(
      `No deployment found with id ${deploymentId} to link PR`,
    );
  }
}

export function endDeployment(db: Database.Database, deploymentId: number, terminalReason?: DeploymentTerminalReason): void {
  const existing = getDeploymentById(db, deploymentId);
  if (!existing) throw new Error(`No active deployment found with id ${deploymentId}`);
  const transition = transitionDeploymentTerminal(db, deploymentId, terminalReason);
  if (!transition.changed) {
    throw new Error(`No active deployment found with id ${deploymentId}`);
  }
}

export function transitionDeploymentTerminal(
  db: Database.Database,
  deploymentId: number,
  terminalReason?: DeploymentTerminalReason,
): { deployment: Deployment; changed: boolean } {
  const result = db
    .prepare("UPDATE deployments SET ended_at = datetime('now'), idle_since = NULL, terminal_reason = COALESCE(?, terminal_reason) WHERE id = ? AND ended_at IS NULL")
    .run(terminalReason ?? null, deploymentId);
  const deployment = getDeploymentById(db, deploymentId);
  if (!deployment) throw new Error(`No deployment found with id ${deploymentId}`);
  if (result.changes > 0) {
    markPrDeploymentReviewTerminal(db, deployment, terminalReason);
  }
  return { deployment, changed: result.changes > 0 };
}

export function recordDeploymentCompletion(db: Database.Database, deploymentId: number, input: { terminalReason: DeploymentTerminalReason; resultJson?: string | null }): void {
  const result = db
    .prepare("UPDATE deployments SET terminal_reason = ?, completion_result_json = ? WHERE id = ?")
    .run(input.terminalReason, input.resultJson ?? null, deploymentId);
  if (result.changes === 0) throw new Error(`No deployment found with id ${deploymentId}`);
}

export function markDeploymentNotificationSent(db: Database.Database, deploymentId: number): void {
  const result = db
    .prepare("UPDATE deployments SET notification_sent_at = COALESCE(notification_sent_at, datetime('now')) WHERE id = ?")
    .run(deploymentId);
  if (result.changes === 0) throw new Error(`No deployment found with id ${deploymentId}`);
}

function markPrDeploymentReviewTerminal(
  db: Database.Database,
  deployment: Deployment,
  terminalReason?: DeploymentTerminalReason,
): void {
  if (deployment.targetType !== "pr") return;
  const failedReasons = new Set<DeploymentTerminalReason>(["failed", "timeout", "liveness_missing"]);
  markActivePrReviewForDeploymentTerminal(db, deployment.id, {
    completedAt: Date.now(),
    status: terminalReason && failedReasons.has(terminalReason) ? "failed" : "superseded",
    reason: terminalReason ?? "deployment_terminal",
  });
}

export function claimDeploymentNotificationSent(db: Database.Database, deploymentId: number): boolean {
  const result = db
    .prepare("UPDATE deployments SET notification_sent_at = datetime('now') WHERE id = ? AND notification_sent_at IS NULL")
    .run(deploymentId);
  if (result.changes > 0) return true;
  const existing = getDeploymentById(db, deploymentId);
  if (!existing) throw new Error(`No deployment found with id ${deploymentId}`);
  return false;
}

/**
 * Flip a "pending" deployment to "active". Called by executeLaunch once
 * the terminal has successfully opened. Throws if the row doesn't exist
 * or isn't pending — both indicate a programming error in the launch
 * flow, not a runtime condition to recover from.
 */
export function activateDeployment(
  db: Database.Database,
  deploymentId: number,
): void {
  const result = db
    .prepare(
      "UPDATE deployments SET state = 'active' WHERE id = ? AND state = 'pending'",
    )
    .run(deploymentId);
  if (result.changes === 0) {
    throw new Error(
      `No pending deployment found with id ${deploymentId} to activate`,
    );
  }
}

/**
 * Claim a port for a pending deployment so concurrent `allocatePort` calls
 * see the reservation before ttyd is actually spawned. Without this,
 * two concurrent launches can both read "no ports in use" and pick the
 * same port — a classic TOCTOU race.
 */
export function reserveTtydPort(
  db: Database.Database,
  deploymentId: number,
  port: number,
): void {
  const result = db
    .prepare("UPDATE deployments SET ttyd_port = ? WHERE id = ?")
    .run(port, deploymentId);
  if (result.changes === 0) {
    throw new Error(`No deployment found with id ${deploymentId} to reserve port`);
  }
}

export function updateTtydInfo(
  db: Database.Database,
  deploymentId: number,
  port: number,
  pid: number,
): void {
  const result = db
    .prepare("UPDATE deployments SET ttyd_port = ?, ttyd_pid = ? WHERE id = ?")
    .run(port, pid, deploymentId);
  if (result.changes === 0) {
    throw new Error(`No deployment found with id ${deploymentId} to update ttyd info`);
  }
}

/**
 * Clean up pending deployments older than the given age. Pending rows
 * should transition to active within seconds — any that linger indicate
 * a crash or bug in the launch flow.
 */
export function cleanupOrphanedDeployments(
  db: Database.Database,
  maxAgeMinutes = 10,
): number {
  const result = db
    .prepare(
      "DELETE FROM deployments WHERE state = 'pending' AND launched_at < datetime('now', ?)",
    )
    .run(`-${maxAgeMinutes} minutes`);
  return result.changes;
}

/**
 * Prune ended deployments older than the given number of days.
 * Returns the number of rows deleted.
 */
export function pruneEndedDeployments(
  db: Database.Database,
  olderThanDays = 90,
): number {
  const result = db
    .prepare(
      "DELETE FROM deployments WHERE ended_at IS NOT NULL AND ended_at < datetime('now', ?)",
    )
    .run(`-${olderThanDays} days`);
  return result.changes;
}

/**
 * Delete a "pending" deployment row. Called by executeLaunch's rollback
 * path when the ttyd spawn fails after the row was written. This is
 * safe because pending rows are never visible to the UI or reconciler —
 * removing one cannot leave dangling references. Throws if the row is
 * not pending (active or ended rows must go through endDeployment).
 */
export function deletePendingDeployment(
  db: Database.Database,
  deploymentId: number,
): void {
  const result = db
    .prepare("DELETE FROM deployments WHERE id = ? AND state = 'pending'")
    .run(deploymentId);
  if (result.changes === 0) {
    throw new Error(
      `No pending deployment found with id ${deploymentId} to delete`,
    );
  }
}

export type ActiveDeploymentWithRepo = Omit<Deployment, "state" | "endedAt"> & {
  state: "active";
  endedAt: null;
  owner: string;
  repoName: string;
};

export function getActiveDeployments(
  db: Database.Database,
): ActiveDeploymentWithRepo[] {
  const rows = db
    .prepare(
      `SELECT d.*, r.owner, r.name as repo_name
       FROM deployments d
       JOIN repos r ON d.repo_id = r.id
       WHERE d.state = 'active' AND d.ended_at IS NULL
       ORDER BY d.launched_at DESC`,
    )
    .all() as Array<DeploymentRow & { owner: string; repo_name: string }>;
  return rows.map((row) => ({
    ...rowToDeployment(row),
    state: "active" as const,
    endedAt: null,
    owner: row.owner,
    repoName: row.repo_name,
  }));
}

export function setIdleSince(
  db: Database.Database,
  deploymentId: number,
): void {
  db.prepare(
    "UPDATE deployments SET idle_since = datetime('now') WHERE id = ? AND idle_since IS NULL",
  ).run(deploymentId);
}

export function clearIdleSince(
  db: Database.Database,
  deploymentId: number,
): void {
  db.prepare(
    "UPDATE deployments SET idle_since = NULL WHERE id = ?",
  ).run(deploymentId);
}
