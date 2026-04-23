import { access, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { isWorkingTreeClean } from "./branch.js";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 5_000;

export interface WorktreeStatus {
  exists: boolean;
  dirty: boolean;
  path: string;
}

export async function checkWorktreeStatus(
  worktreeDir: string,
  repo: string,
  issueNumber: number,
): Promise<WorktreeStatus> {
  const worktreeName = `${repo}-issue-${issueNumber}`;
  const worktreePath = join(worktreeDir, worktreeName);

  try {
    await access(worktreePath);
  } catch {
    return { exists: false, dirty: false, path: worktreePath };
  }

  try {
    await execFileAsync("git", ["rev-parse", "--git-dir"], {
      cwd: worktreePath,
      timeout: GIT_TIMEOUT_MS,
    });
  } catch {
    return { exists: false, dirty: false, path: worktreePath };
  }

  const clean = await isWorkingTreeClean(worktreePath);
  return { exists: true, dirty: !clean, path: worktreePath };
}

export async function resetWorktree(
  worktreePath: string,
  repoPath: string,
): Promise<void> {
  await rm(worktreePath, { recursive: true, force: true });
  await execFileAsync("git", ["worktree", "prune"], {
    cwd: repoPath,
    timeout: GIT_TIMEOUT_MS,
  });
}
