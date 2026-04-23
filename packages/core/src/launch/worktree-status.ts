import { access, rm } from "node:fs/promises";
import { join } from "node:path";
import { isWorkingTreeClean } from "./branch.js";
import { timedExec } from "./exec-timeout.js";

const GIT_TIMEOUT_MS = 5_000;

export interface WorktreeStatus {
  exists: boolean;
  dirty: boolean;
  path: string;
}

/**
 * Check if a worktree directory exists for this issue and whether it
 * has uncommitted changes.
 */
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
    await timedExec("git", ["rev-parse", "--git-dir"], {
      cwd: worktreePath,
      timeoutMs: GIT_TIMEOUT_MS,
      step: "git rev-parse (worktree check)",
    });
  } catch {
    return { exists: false, dirty: false, path: worktreePath };
  }

  try {
    const clean = await isWorkingTreeClean(worktreePath);
    return { exists: true, dirty: !clean, path: worktreePath };
  } catch (err) {
    console.warn("[issuectl] isWorkingTreeClean failed, assuming dirty:", (err as Error).message);
    return { exists: true, dirty: true, path: worktreePath };
  }
}

/**
 * Remove a worktree directory and prune stale git worktree references.
 * The caller must ensure `repoPath` is the parent repository, not the
 * worktree itself.
 */
export async function resetWorktree(
  worktreePath: string,
  repoPath: string,
): Promise<void> {
  await rm(worktreePath, { recursive: true, force: true });
  try {
    await timedExec("git", ["worktree", "prune"], {
      cwd: repoPath,
      timeoutMs: GIT_TIMEOUT_MS,
      step: "git worktree prune",
    });
  } catch (err) {
    console.warn("[issuectl] git worktree prune failed (non-fatal):", (err as Error).message);
  }
}
