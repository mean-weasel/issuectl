import type { Octokit } from "@octokit/rest";
import { ensureLifecycleLabels, addLabels, LIFECYCLE_LABEL } from "../github/labels.js";
import type { DeploymentTargetType } from "../types.js";
import { retryLabel } from "./launch-agent-command.js";
import {
  recordLaunchLabelsFailed,
  type LaunchDiagnosticContext,
} from "./launch-diagnostics.js";

export async function applyLaunchLifecycleLabels(input: {
  octokit: Octokit;
  owner: string;
  repo: string;
  targetType: DeploymentTargetType;
  targetNumber: number;
  diagnosticContext: LaunchDiagnosticContext;
}): Promise<string | undefined> {
  if (input.targetType !== "issue") return undefined;
  try {
    await ensureLifecycleLabels(input.octokit, input.owner, input.repo);
    await retryLabel(() =>
      addLabels(input.octokit, input.owner, input.repo, input.targetNumber, [
        LIFECYCLE_LABEL.deployed,
        LIFECYCLE_LABEL.inProgress,
      ]),
    );
    return undefined;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordLaunchLabelsFailed(input.diagnosticContext, msg);
    console.warn("[issuectl] Failed to apply lifecycle labels after retries:", err);
    return `Could not apply lifecycle labels after 3 attempts (${msg}). Launch continued, but lifecycle status may not update automatically — you may need to add labels manually.`;
  }
}
