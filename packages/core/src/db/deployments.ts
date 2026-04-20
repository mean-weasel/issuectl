import type Database from "better-sqlite3";
import type { Deployment, DeploymentState } from "../types.js";

type DeploymentRow = {
  id: number;
  repo_id: number;
  issue_number: number;
  branch_name: string;
  workspace_mode: string;
  workspace_path: string;
  linked_pr_number: number | null;
  state: string;
  launched_at: string;
  ended_at: string | null;
  ttyd_port: number | null;
  ttyd_pid: number | null;
};

function rowToDeployment(row: DeploymentRow): Deployment {
  return {
    id: row.id,
    repoId: row.repo_id,
    issueNumber: row.issue_number,
    branchName: row.branch_name,
    workspaceMode: row.workspace_mode as Deployment["workspaceMode"],
    workspacePath: row.workspace_path,
    linkedPrNumber: row.linked_pr_number,
    state: (row.state as DeploymentState) ?? "active",
    launchedAt: row.launched_at,
    endedAt: row.ended_at,
    ttydPort: row.ttyd_port,
    ttydPid: row.ttyd_pid,
  };
}

export function recordDeployment(
  db: Database.Database,
  deployment: {
    repoId: number;
    issueNumber: number;
    branchName: string;
    workspaceMode: Deployment["workspaceMode"];
    workspacePath: string;
    /**
     * Optional initial state. Defaults to "active" for callers that want
     * the legacy one-shot write. The launch flow passes "pending" so the
     * row stays invisible to the UI and reconciler until `activateDeployment`
     * flips it after the terminal opens — or `deleteDeployment` unwinds
     * it after a launch failure.
     */
    state?: DeploymentState;
  },
): Deployment {
  const state: DeploymentState = deployment.state ?? "active";
  const result = db
    .prepare(
      `INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path, state)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      deployment.repoId,
      deployment.issueNumber,
      deployment.branchName,
      deployment.workspaceMode,
      deployment.workspacePath,
      state,
    );

  const inserted = getDeploymentById(db, Number(result.lastInsertRowid));
  if (!inserted) throw new Error("Failed to read back deployment after insert");
  return inserted;
}

export function getDeploymentById(
  db: Database.Database,
  id: number,
): Deployment | undefined {
  const row = db
    .prepare("SELECT * FROM deployments WHERE id = ?")
    .get(id) as DeploymentRow | undefined;
  return row ? rowToDeployment(row) : undefined;
}

export function getDeploymentsForIssue(
  db: Database.Database,
  repoId: number,
  issueNumber: number,
): Deployment[] {
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

export function getDeploymentsByRepo(
  db: Database.Database,
  repoId: number,
): Deployment[] {
  // See getDeploymentsForIssue — pending rows are excluded from all
  // callers except the launch rollback path.
  const rows = db
    .prepare(
      "SELECT * FROM deployments WHERE repo_id = ? AND state = 'active' ORDER BY launched_at DESC",
    )
    .all(repoId) as DeploymentRow[];
  return rows.map(rowToDeployment);
}

/**
 * "Live" means pending or active (ended rows are excluded) — matches
 * the `idx_deployments_live` partial unique index predicate.
 */
export function hasLiveDeploymentForIssue(
  db: Database.Database,
  repoId: number,
  issueNumber: number,
): boolean {
  const row = db
    .prepare(
      "SELECT 1 FROM deployments WHERE repo_id = ? AND issue_number = ? AND ended_at IS NULL LIMIT 1",
    )
    .get(repoId, issueNumber);
  return row !== undefined;
}

export function updateLinkedPR(
  db: Database.Database,
  deploymentId: number,
  prNumber: number,
): void {
  const result = db
    .prepare("UPDATE deployments SET linked_pr_number = ? WHERE id = ?")
    .run(prNumber, deploymentId);
  if (result.changes === 0) {
    throw new Error(
      `No deployment found with id ${deploymentId} to link PR`,
    );
  }
}

export function endDeployment(
  db: Database.Database,
  deploymentId: number,
): void {
  const result = db
    .prepare("UPDATE deployments SET ended_at = datetime('now') WHERE id = ?")
    .run(deploymentId);
  if (result.changes === 0) {
    throw new Error(`No deployment found with id ${deploymentId}`);
  }
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
