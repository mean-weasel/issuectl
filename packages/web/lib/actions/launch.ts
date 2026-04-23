"use server";

import {
  getDb,
  getRepo,
  getDeploymentById,
  executeLaunch,
  endDeployment as coreEndDeployment,
  killTtyd,
  isTtydAlive,
  tmuxSessionName,
  withAuthRetry,
  withIdempotency,
  DuplicateInFlightError,
  formatErrorForUser,
  cleanupStaleContextFiles,
  type WorkspaceMode,
} from "@issuectl/core";
import { VALID_BRANCH_RE, MAX_PREAMBLE } from "@/lib/constants";
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
  forceResume?: boolean;
};

type LaunchResponse = {
  success: boolean;
  deploymentId?: number;
  error?: string;
  cacheStale?: true;
  /**
   * Set when the `issuectl:deployed` label could not be applied after the
   * retry budget. Launch still succeeded — the deployment and ttyd process
   * are running — but the reconciler may not auto-advance this issue's
   * lifecycle state.
   */
  labelWarning?: string;
};

const VALID_WORKSPACE_MODES: WorkspaceMode[] = [
  "existing",
  "worktree",
  "clone",
];

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
  if (formData.preamble && formData.preamble.length > MAX_PREAMBLE) {
    return {
      success: false,
      error: `Preamble must be ${MAX_PREAMBLE} characters or fewer`,
    };
  }

  for (const filePath of formData.selectedFilePaths) {
    if (typeof filePath !== "string" || filePath.length === 0) {
      return { success: false, error: "Invalid file path" };
    }
    if (filePath.includes("\0")) {
      return { success: false, error: "File path contains invalid characters" };
    }
    if (filePath.startsWith("/") || filePath.includes("..")) {
      return {
        success: false,
        error: "File paths must be relative to the repository and cannot contain '..'",
      };
    }
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
          forceResume: formData.forceResume,
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
    `/issues/${owner}/${repo}/${issueNumber}`,
    "/",
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
  if (!owner || !repo) {
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

    if (deployment.ttydPid) {
      try {
        killTtyd(deployment.ttydPid, tmuxSessionName(repo, issueNumber));
      } catch (killErr) {
        console.warn(
          "[issuectl] Failed to kill ttyd process, proceeding with session end:",
          { deploymentId, pid: deployment.ttydPid },
          killErr,
        );
      }
    }
    coreEndDeployment(db, deploymentId);

    // Best-effort cleanup of stale context temp files
    cleanupStaleContextFiles().catch((err) => {
      console.warn("[issuectl] Failed to clean up stale context files:", err);
    });
  } catch (err) {
    console.error("[issuectl] Failed to end session:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
  const { stale } = revalidateSafely(
    `/issues/${owner}/${repo}/${issueNumber}`,
    `/launch/${owner}/${repo}/${issueNumber}`,
    "/",
  );
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

export async function checkTtydAlive(
  deploymentId: number,
): Promise<{ alive: boolean; error?: string }> {
  try {
    const db = getDb();
    const deployment = getDeploymentById(db, deploymentId);
    if (!deployment || deployment.endedAt !== null) {
      return { alive: false };
    }
    if (!deployment.ttydPid) {
      return { alive: false };
    }
    const alive = isTtydAlive(deployment.ttydPid);
    if (!alive) {
      // Process died — clean up the deployment
      coreEndDeployment(db, deploymentId);
    }
    return { alive };
  } catch (err) {
    console.error("[issuectl] Health check failed:", err);
    return { alive: false, error: "Health check failed" };
  }
}
