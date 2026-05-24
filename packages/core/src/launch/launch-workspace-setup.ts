import type Database from "better-sqlite3";
import { getRepo } from "../db/repos.js";
import { getSetting } from "../db/settings.js";
import { hasLiveDeploymentForTarget } from "../db/deployments.js";
import type { DeploymentTargetType, Repo } from "../types.js";
import { prepareWorkspace, type WorkspaceMode, type WorkspaceResult } from "./workspace.js";

type LaunchWorkspaceOptions = {
  owner: string;
  repo: string;
  targetType?: DeploymentTargetType;
  targetNumber: number;
  branchName: string;
  workspaceMode: WorkspaceMode;
  forceResume?: boolean;
};

export function expandHome(p: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "/";
  if (p === "~") return home;
  if (p.startsWith("~/")) return home + p.slice(1);
  return p;
}

export function duplicateLaunchError(targetNumber: number, targetType: DeploymentTargetType = "issue"): Error {
  const label = targetType === "issue" ? `Issue #${targetNumber}` : `PR #${targetNumber}`;
  return new Error(
    `${label} already has an active deployment. End the existing session before launching again.`,
  );
}

export async function prepareLaunchWorkspace(
  db: Database.Database,
  options: LaunchWorkspaceOptions,
): Promise<{ repoRecord: Repo; workspace: WorkspaceResult }> {
  const repoRecord = getRepo(db, options.owner, options.repo);
  if (!repoRecord) {
    throw new Error(
      `Repository ${options.owner}/${options.repo} not found in database`,
    );
  }

  const targetType = options.targetType ?? "issue";
  if (hasLiveDeploymentForTarget(db, repoRecord.id, targetType, options.targetNumber)) {
    throw duplicateLaunchError(options.targetNumber, targetType);
  }

  const repoPath = repoRecord.localPath
    ? expandHome(repoRecord.localPath)
    : null;

  if (!repoPath && options.workspaceMode !== "clone") {
    const modeLabel =
      options.workspaceMode === "worktree" ? "Worktree mode" : "Existing-repo mode";
    throw new Error(
      `${modeLabel} requires a local path for ${options.owner}/${options.repo}. ` +
      `Set a local path in Settings, or use "Fresh clone" mode instead.`,
    );
  }

  const worktreeDir = expandHome(
    getSetting(db, "worktree_dir") ?? "~/.issuectl/worktrees/",
  );

  const workspace = await prepareWorkspace({
    mode: options.workspaceMode,
    repoPath: repoPath ?? "",
    owner: options.owner,
    repo: options.repo,
    branchName: options.branchName,
    issueNumber: options.targetNumber,
    worktreeDir,
    forceResume: options.forceResume,
  });

  return { repoRecord, workspace };
}
