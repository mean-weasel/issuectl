import {
  getDb,
  getRepoById,
  getDeploymentById,
  endDeployment,
  isTtydAlive,
  isTmuxSessionAlive,
  respawnTtyd,
  tmuxSessionName,
  updateTtydInfo,
  formatErrorForUser,
} from "@issuectl/core";

export type EnsureTtydResult =
  | { port: number; respawned?: true; alive?: never; error?: never }
  | { alive: false; error?: string; port?: never };

export async function ensureTtydForDeployment(
  deploymentId: number,
): Promise<EnsureTtydResult> {
  if (!Number.isInteger(deploymentId) || deploymentId <= 0) {
    return { alive: false, error: "Invalid deployment ID" };
  }
  try {
    const db = getDb();
    const deployment = getDeploymentById(db, deploymentId);
    if (!deployment || deployment.endedAt !== null) {
      return { alive: false, error: "Deployment not found or already ended" };
    }
    if (!deployment.ttydPid || deployment.ttydPort === null) {
      return { alive: false, error: "No terminal process configured" };
    }
    const port = deployment.ttydPort;

    if (isTtydAlive(deployment.ttydPid)) {
      return { port };
    }

    const repo = getRepoById(db, deployment.repoId);
    if (!repo) {
      return { alive: false, error: "Repository not found" };
    }

    const sessionName = tmuxSessionName(repo.name, deployment.issueNumber);
    if (!isTmuxSessionAlive(sessionName)) {
      endDeployment(db, deploymentId);
      return { alive: false, error: "Terminal session has ended" };
    }

    const { pid } = await respawnTtyd(port, sessionName);
    updateTtydInfo(db, deploymentId, port, pid);
    return { port, respawned: true };
  } catch (err) {
    console.error("[issuectl] ensureTtydForDeployment failed:", deploymentId, err);
    return { alive: false, error: formatErrorForUser(err) };
  }
}
