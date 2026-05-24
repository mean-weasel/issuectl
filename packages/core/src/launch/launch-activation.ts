import type Database from "better-sqlite3";
import {
  activateDeployment,
  deletePendingDeployment,
} from "../db/deployments.js";
import {
  recordDeploymentActivated,
  recordLaunchActivationFailed,
  type LaunchDiagnosticContext,
} from "./launch-diagnostics.js";

export function activateRecordedDeployment(
  db: Database.Database,
  deploymentId: number,
  diagnosticContext: LaunchDiagnosticContext,
): void {
  try {
    activateDeployment(db, deploymentId);
    recordDeploymentActivated(diagnosticContext, deploymentId);
  } catch (err) {
    recordLaunchActivationFailed(diagnosticContext, { deploymentId, error: err });
    console.error(
      "[issuectl] Failed to activate deployment after terminal opened — deleting pending row",
      { deploymentId },
      err,
    );
    try {
      deletePendingDeployment(db, deploymentId);
    } catch (deleteErr) {
      console.error("[issuectl] Failed to clean up orphaned pending deployment", { deploymentId }, deleteErr);
    }
    throw new Error(
      `Launch failed: terminal opened but deployment could not be activated (id=${deploymentId}). Close the terminal manually.`,
      { cause: err },
    );
  }
}
