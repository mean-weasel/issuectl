import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createOrCheckoutBranch,
  isWorkingTreeClean,
  getDefaultBranch,
} from "./branch.js";

const execFileAsync = promisify(execFile);

export type WorkspaceMode = "existing" | "worktree" | "clone";

export interface WorkspaceResult {
  path: string;
  mode: WorkspaceMode;
  created: boolean;
}

export async function prepareWorkspace(options: {
  mode: WorkspaceMode;
  repoPath: string;
  owner: string;
  repo: string;
  branchName: string;
  issueNumber: number;
  worktreeDir: string;
}): Promise<WorkspaceResult> {
  switch (options.mode) {
    case "existing":
      return prepareExisting(options.repoPath, options.branchName);
    case "worktree":
      return prepareWorktree(options);
    case "clone":
      return prepareClone(options);
  }
}

async function prepareExisting(
  repoPath: string,
  branchName: string,
): Promise<WorkspaceResult> {
  const clean = await isWorkingTreeClean(repoPath);
  if (!clean) {
    throw new Error(
      `Working tree at ${repoPath} has uncommitted changes. Commit or stash them before launching.`,
    );
  }

  await execFileAsync("git", ["fetch", "origin"], { cwd: repoPath }).catch(
    (err) => {
      console.warn("[issuectl] git fetch failed, continuing with local state:", (err as Error).message);
    },
  );

  const baseBranch = await getDefaultBranch(repoPath);
  await createOrCheckoutBranch(repoPath, branchName, baseBranch);

  return { path: repoPath, mode: "existing", created: false };
}

async function prepareWorktree(options: {
  repoPath: string;
  branchName: string;
  repo: string;
  issueNumber: number;
  worktreeDir: string;
}): Promise<WorkspaceResult> {
  const worktreeName = `${options.repo}-issue-${options.issueNumber}`;
  const worktreePath = join(options.worktreeDir, worktreeName);

  await mkdir(options.worktreeDir, { recursive: true });

  try {
    await execFileAsync(
      "git",
      ["worktree", "add", worktreePath, "-b", options.branchName],
      { cwd: options.repoPath },
    );
    return { path: worktreePath, mode: "worktree", created: true };
  } catch (err) {
    // Branch may already exist — check stderr for the git error message
    const stderr = (err as { stderr?: string }).stderr ?? "";
    const message = err instanceof Error ? err.message : "";
    if (stderr.includes("already exists") || message.includes("already exists")) {
      try {
        await execFileAsync(
          "git",
          ["worktree", "add", worktreePath, options.branchName],
          { cwd: options.repoPath },
        );
        return { path: worktreePath, mode: "worktree", created: true };
      } catch (retryErr) {
        await rm(worktreePath, { recursive: true, force: true }).catch((e) => {
        console.warn("[issuectl] Failed to clean up worktree:", (e as Error).message);
      });
        throw retryErr;
      }
    }
    await rm(worktreePath, { recursive: true, force: true }).catch((e) => {
        console.warn("[issuectl] Failed to clean up worktree:", (e as Error).message);
      });
    throw err;
  }
}

async function prepareClone(options: {
  owner: string;
  repo: string;
  branchName: string;
  issueNumber: number;
  worktreeDir: string;
}): Promise<WorkspaceResult> {
  const cloneName = `${options.repo}-issue-${options.issueNumber}`;
  const clonePath = join(options.worktreeDir, cloneName);
  const cloneUrl = `https://github.com/${options.owner}/${options.repo}.git`;

  await mkdir(options.worktreeDir, { recursive: true });

  try {
    await execFileAsync("git", ["clone", "--depth=1", cloneUrl, clonePath]);
    await execFileAsync("git", ["checkout", "-b", options.branchName], {
      cwd: clonePath,
    });
  } catch (err) {
    await rm(clonePath, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  return { path: clonePath, mode: "clone", created: true };
}
