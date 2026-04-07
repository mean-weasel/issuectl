"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  getOctokit,
  executeLaunch,
  type LaunchResult,
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
  launchResult?: LaunchResult;
  error?: string;
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
  if (!branchName.trim()) {
    return { success: false, error: "Branch name is required" };
  }
  if (!VALID_WORKSPACE_MODES.includes(workspaceMode)) {
    return { success: false, error: "Invalid workspace mode" };
  }

  try {
    const db = getDb();
    const octokit = await getOctokit();

    const result = await executeLaunch(db, octokit, {
      owner,
      repo,
      issueNumber,
      branchName,
      workspaceMode,
      selectedComments: formData.selectedCommentIndices,
      selectedFiles: formData.selectedFilePaths,
      preamble: formData.preamble || undefined,
      terminalMode: "window",
    });

    revalidatePath(`/${owner}/${repo}/issues/${issueNumber}`);

    return { success: true, launchResult: result };
  } catch (err) {
    console.error("[issuectl] Launch failed:", err);
    const message =
      err instanceof Error ? err.message : "Launch failed unexpectedly";
    return { success: false, error: message };
  }
}
