"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  getOctokit,
  executeLaunch,
  type WorkspaceMode,
} from "@issuectl/core";

type LaunchFormData = {
  owner: string;
  repo: string;
  issueNumber: number;
  branchName: string;
  workspaceMode: WorkspaceMode;
  selectedCommentIndices: number[];
  selectedFilePaths: string[];
  preamble?: string;
};

type LaunchResponse = {
  success: boolean;
  deploymentId?: number;
  error?: string;
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

  try {
    const db = getDb();
    const octokit = await getOctokit();

    const result = await executeLaunch(db, octokit, {
      owner,
      repo,
      issueNumber,
      branchName: trimmedBranch,
      workspaceMode,
      selectedComments: formData.selectedCommentIndices,
      selectedFiles: formData.selectedFilePaths,
      preamble: formData.preamble || undefined,
      terminalMode: "window",
    });

    try {
      revalidatePath(`/${owner}/${repo}/issues/${issueNumber}`);
    } catch (revalErr) {
      console.warn("[issuectl] Cache revalidation failed (launch succeeded):", revalErr);
    }

    return { success: true, deploymentId: result.deploymentId };
  } catch (err) {
    console.error("[issuectl] Launch failed:", err);
    const message =
      err instanceof Error ? err.message : "Launch failed unexpectedly";
    return { success: false, error: message };
  }
}
