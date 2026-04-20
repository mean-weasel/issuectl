"use server";

import {
  getDb,
  getRepo,
  getDeploymentById,
  executeLaunch,
  endDeployment as coreEndDeployment,
  withAuthRetry,
  withIdempotency,
  DuplicateInFlightError,
  formatErrorForUser,
  cleanupStaleContextFiles,
  type WorkspaceMode,
} from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

type LaunchFormData = {
  owner: string;
  repo: string;
  issueNumber: number;
  branchName: string;
  workspaceMode: WorkspaceMode;
  selectedCommentIndices: number[];
  selectedFilePaths: string[];
  preamble?: string;
  idempotencyKey?: string;
};

type LaunchResponse = {
  success: boolean;
  deploymentId?: number;
  error?: string;
  cacheStale?: true;
  /**
   * Set when the `issuectl:deployed` label could not be applied after the
   * retry budget. Launch still succeeded — the deployment row exists and
   * the terminal opened — but the reconciler may not auto-advance this
   * issue's lifecycle state.
   */
  labelWarning?: string;
};

const VALID_WORKSPACE_MODES: WorkspaceMode[] = [
  "existing",
  "worktree",
  "clone",
];

const VALID_BRANCH_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;

export async function launchIssue(
  formData: LaunchFormData,
): Promise<LaunchResponse> {
  const { owner, repo, issueNumber, branchName, workspaceMode } = formData;

  if (!owner || !repo || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    return { success: false, error: "Invalid issue reference" };
  }
  const trimmedBranch = branchName.trim();
  if (!trimmedBranch) {
    return { success: false, error: "Branch name is required" };
  }
  if (!VALID_BRANCH_RE.test(trimmedBranch)) {
    return { success: false, error: "Branch name contains invalid characters" };
  }
  if (!VALID_WORKSPACE_MODES.includes(workspaceMode)) {
    return { success: false, error: "Invalid workspace mode" };
  }
  if (formData.selectedCommentIndices.some((i) => !Number.isInteger(i) || i < 0)) {
    return { success: false, error: "Invalid comment selection" };
  }

  let deploymentId: number;
  let labelWarning: string | undefined;
  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return { success: false, error: "Repository is not tracked" };
    }

    const runLaunch = async () => {
      const r = await withAuthRetry((octokit) =>
        executeLaunch(db, octokit, {
          owner,
          repo,
          issueNumber,
          branchName: trimmedBranch,
          workspaceMode,
          selectedComments: formData.selectedCommentIndices,
          selectedFiles: formData.selectedFilePaths,
          preamble: formData.preamble || undefined,
        }),
      );
      return {
        deploymentId: r.deploymentId,
        labelWarning: r.labelWarning ?? null,
      };
    };
    const result = formData.idempotencyKey
      ? await withIdempotency(db, "launch-issue", formData.idempotencyKey, runLaunch)
      : await runLaunch();
    deploymentId = result.deploymentId;
    labelWarning = result.labelWarning ?? undefined;
  } catch (err) {
    if (err instanceof DuplicateInFlightError) {
      return {
        success: false,
        error: "This launch is already in progress — please wait.",
      };
    }
    console.error("[issuectl] Launch failed:", err);
    return { success: false, error: formatErrorForUser(err) };
  }

  const { stale } = revalidateSafely(
    `/${owner}/${repo}/issues/${issueNumber}`,
  );
  return {
    success: true,
    deploymentId,
    ...(stale ? { cacheStale: true as const } : {}),
    ...(labelWarning ? { labelWarning } : {}),
  };
}

export async function endSession(
  deploymentId: number,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (!Number.isInteger(deploymentId) || deploymentId <= 0) {
    return { success: false, error: "Invalid deployment ID" };
  }
  if (!owner || typeof owner !== "string" || !repo || typeof repo !== "string") {
    return { success: false, error: "Invalid repository reference" };
  }
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    return { success: false, error: "Invalid issue number" };
  }

  try {
    const db = getDb();

    const deployment = getDeploymentById(db, deploymentId);
    if (!deployment) {
      return { success: false, error: "Deployment not found" };
    }

    const repoRecord = getRepo(db, owner, repo);
    if (!repoRecord) {
      return { success: false, error: "Repository not found" };
    }

    if (deployment.repoId !== repoRecord.id || deployment.issueNumber !== issueNumber) {
      return { success: false, error: "Deployment does not match the specified issue" };
    }

    coreEndDeployment(db, deploymentId);

    // Best-effort cleanup of stale context temp files
    cleanupStaleContextFiles().catch(() => { /* best-effort */ });
  } catch (err) {
    console.error("[issuectl] Failed to end session:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
  const { stale } = revalidateSafely(
    `/${owner}/${repo}/issues/${issueNumber}`,
    `/${owner}/${repo}/issues/${issueNumber}/launch`,
  );
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}
