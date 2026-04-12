import { mkdir, rm, access } from "node:fs/promises";
import { join } from "node:path";
import {
  createOrCheckoutBranch,
  isWorkingTreeClean,
  getDefaultBranch,
} from "./branch.js";
import { timedExec } from "./exec-timeout.js";

export type WorkspaceMode = "existing" | "worktree" | "clone";

export interface WorkspaceResult {
  path: string;
  mode: WorkspaceMode;
  created: boolean;
}

// Timeout budgets (milliseconds). None of these are unbounded — a hung network
// operation should fail loudly after a reasonable wait, not pin the Server
// Action indefinitely. Values are tuned for "slow but plausible" — shallow
// clones of medium repos, git fetches over a bad wifi, etc. If a repo is so
// large that these are unrealistic, the right answer is to adjust them in one
// place rather than dropping timeouts entirely.
const GIT_FETCH_TIMEOUT_MS = 30_000;
const GIT_CLONE_TIMEOUT_MS = 120_000;
const GIT_WORKTREE_TIMEOUT_MS = 15_000;
const GIT_BRANCH_OP_TIMEOUT_MS = 10_000;
const GIT_REV_PARSE_TIMEOUT_MS = 5_000;

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function isGitRepo(p: string): Promise<boolean> {
  try {
    await timedExec("git", ["rev-parse", "--git-dir"], {
      cwd: p,
      timeoutMs: GIT_REV_PARSE_TIMEOUT_MS,
      step: "git rev-parse",
    });
    return true;
  } catch {
    return false;
  }
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

  await timedExec("git", ["fetch", "origin"], {
    cwd: repoPath,
    timeoutMs: GIT_FETCH_TIMEOUT_MS,
    step: "git fetch",
  }).catch((err) => {
    // A failing fetch is non-fatal — we continue with local state — but if
    // the failure was a timeout we want the warning to say so clearly.
    console.warn(
      "[issuectl] git fetch failed, continuing with local state:",
      (err as Error).message,
    );
  });

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

  // If the directory already exists from a previous launch, reuse it
  if (await pathExists(worktreePath)) {
    if (await isGitRepo(worktreePath)) {
      await createOrCheckoutBranch(worktreePath, options.branchName);
      return { path: worktreePath, mode: "worktree", created: false };
    }
    // Not a valid git repo — clean up the leftover directory
    await rm(worktreePath, { recursive: true, force: true });
  }

  try {
    await timedExec(
      "git",
      ["worktree", "add", worktreePath, "-b", options.branchName],
      {
        cwd: options.repoPath,
        timeoutMs: GIT_WORKTREE_TIMEOUT_MS,
        step: "git worktree add",
      },
    );
    return { path: worktreePath, mode: "worktree", created: true };
  } catch (err) {
    // Branch may already exist — retry without -b
    const stderr = (err as { stderr?: string }).stderr ?? "";
    const message = err instanceof Error ? err.message : "";
    if (stderr.includes("already exists") || message.includes("already exists")) {
      try {
        await timedExec(
          "git",
          ["worktree", "add", worktreePath, options.branchName],
          {
            cwd: options.repoPath,
            timeoutMs: GIT_WORKTREE_TIMEOUT_MS,
            step: "git worktree add (existing branch)",
          },
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

  // If the directory already exists from a previous launch, reuse it
  if (await pathExists(clonePath)) {
    if (await isGitRepo(clonePath)) {
      await timedExec("git", ["fetch", "origin"], {
        cwd: clonePath,
        timeoutMs: GIT_FETCH_TIMEOUT_MS,
        step: "git fetch (existing clone)",
      }).catch((err) => {
        console.warn(
          "[issuectl] git fetch failed on existing clone:",
          (err as Error).message,
        );
      });
      await createOrCheckoutBranch(clonePath, options.branchName);
      return { path: clonePath, mode: "clone", created: false };
    }
    // Not a valid git repo — clean up the leftover directory
    await rm(clonePath, { recursive: true, force: true });
  }

  try {
    await timedExec("git", ["clone", "--depth=1", cloneUrl, clonePath], {
      timeoutMs: GIT_CLONE_TIMEOUT_MS,
      step: "git clone",
    });
    await timedExec("git", ["checkout", "-b", options.branchName], {
      cwd: clonePath,
      timeoutMs: GIT_BRANCH_OP_TIMEOUT_MS,
      step: "git checkout",
    });
  } catch (err) {
    await rm(clonePath, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  return { path: clonePath, mode: "clone", created: true };
}
