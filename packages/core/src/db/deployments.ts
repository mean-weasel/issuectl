import type Database from "better-sqlite3";
import type { Deployment } from "../types.js";

type DeploymentRow = {
  id: number;
  repo_id: number;
  issue_number: number;
  branch_name: string;
  workspace_mode: string;
  workspace_path: string;
  linked_pr_number: number | null;
  launched_at: string;
  ended_at: string | null;
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
    launchedAt: row.launched_at,
    endedAt: row.ended_at,
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
  },
): Deployment {
  const result = db
    .prepare(
      `INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      deployment.repoId,
      deployment.issueNumber,
      deployment.branchName,
      deployment.workspaceMode,
      deployment.workspacePath,
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
  const rows = db
    .prepare(
      "SELECT * FROM deployments WHERE repo_id = ? AND issue_number = ? ORDER BY launched_at DESC",
    )
    .all(repoId, issueNumber) as DeploymentRow[];
  return rows.map(rowToDeployment);
}

export function getDeploymentsByRepo(
  db: Database.Database,
  repoId: number,
): Deployment[] {
  const rows = db
    .prepare(
      "SELECT * FROM deployments WHERE repo_id = ? ORDER BY launched_at DESC",
    )
    .all(repoId) as DeploymentRow[];
  return rows.map(rowToDeployment);
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
