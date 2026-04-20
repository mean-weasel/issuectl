"use server";

import { readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  getDb,
  getSetting,
  listRepos,
  withAuthRetry,
  mapLimit,
  DEFAULT_REPO_FANOUT,
} from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

const execFileAsync = promisify(execFile);

export type WorktreeInfo = {
  path: string;
  name: string;
  repo: string | null;
  owner: string | null;
  localPath: string | null;
  issueNumber: number | null;
  stale: boolean;
};

function expandHome(p: string): string {
  return p.startsWith("~") ? p.replace("~", homedir()) : p;
}

const DEFAULT_WORKTREE_DIR = "~/.issuectl/worktrees/";

function getWorktreeDir(): string {
  const db = getDb();
  const configured = getSetting(db, "worktree_dir");
  return expandHome(configured ?? DEFAULT_WORKTREE_DIR);
}

export async function listWorktrees(): Promise<WorktreeInfo[]> {
  const dir = getWorktreeDir();
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    // EACCES, ENOTDIR, ELOOP, and other filesystem errors indicate a
    // misconfigured worktree directory — surface them so settings can
    // show a real error instead of silently hiding worktrees.
    throw err;
  }

  const db = getDb();
  const repos = listRepos(db);

  const results = await Promise.all(
    entries.map(async (name) => {
      const fullPath = join(dir, name);
      const info = await stat(fullPath).catch(() => null);
      if (!info?.isDirectory()) return null;

      // Worktree dirs follow: {repo-or-owner-repo}-issue-{number}
      const match = name.match(/^(.+)-issue-(\d+)$/);
      const repoName = match ? match[1] : null;
      const issueNumber = match ? Number(match[2]) : null;

      // Match against tracked repos — worktree dirs may use "repo" or "owner-repo" naming
      const trackedRepo = repoName
        ? repos.find((r) => r.name === repoName || `${r.owner}-${r.name}` === repoName)
        : null;

      const wt: WorktreeInfo = {
        path: fullPath,
        name,
        repo: repoName,
        owner: trackedRepo?.owner ?? null,
        localPath: trackedRepo?.localPath ?? null,
        issueNumber,
        stale: false,
      };
      return wt;
    }),
  );

  const worktrees = results.filter((wt): wt is WorktreeInfo => wt !== null);

  // Check staleness via GitHub API — a closed issue means the worktree is stale.
  // Each issue lookup goes through withAuthRetry so a rotated token doesn't
  // leave the entire staleness check in the dark.
  await mapLimit(worktrees, DEFAULT_REPO_FANOUT, async (wt) => {
    if (!wt.owner || !wt.repo || !wt.issueNumber) return;

    const repoName = repos.find(
      (r) => r.name === wt.repo || `${r.owner}-${r.name}` === wt.repo,
    )?.name;
    if (!repoName) return;

    try {
      const { data } = await withAuthRetry((octokit) =>
        octokit.rest.issues.get({
          owner: wt.owner!,
          repo: repoName,
          issue_number: wt.issueNumber!,
        }),
      );
      wt.stale = data.state === "closed";
    } catch (err) {
      if (err && typeof err === "object" && "status" in err) {
        const status = (err as { status: number }).status;
        if (status === 404 || status === 410) {
          wt.stale = true;
          return;
        }
      }
      console.warn(
        `[issuectl] Failed to check staleness for ${wt.owner}/${repoName}#${wt.issueNumber}:`,
        err,
      );
    }
  });

  return worktrees;
}

export async function cleanupWorktree(
  path: string,
  parentRepoPath?: string,
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  const worktreeDir = getWorktreeDir();
  // Prevent path traversal — only allow deletion within the configured worktree directory
  const resolved = resolve(path);
  if (!resolved.startsWith(resolve(worktreeDir))) {
    return { success: false, error: "Invalid worktree path" };
  }

  // Validate parentRepoPath against tracked repos if provided
  let cwd: string | undefined;
  if (parentRepoPath) {
    const db = getDb();
    const repos = listRepos(db);
    const matched = repos.find(
      (r) => r.localPath && resolve(expandHome(r.localPath)) === resolve(expandHome(parentRepoPath)),
    );
    if (!matched) {
      return { success: false, error: "Unknown repository path" };
    }
    cwd = expandHome(parentRepoPath);
  }

  // R9: two-phase cleanup. Git worktree removal is best-effort (the worktree
  // entry may already be missing from .git/worktrees). rm, however, is the
  // source of truth — if it fails with a permission error, the directory is
  // orphaned and we MUST surface that to the user with the full path so they
  // can clean it up manually.
  let gitWarning: string | null = null;
  try {
    await execFileAsync("git", ["worktree", "remove", resolved, "--force"], { cwd, timeout: 15_000 });
  } catch (err) {
    gitWarning =
      err instanceof Error ? err.message : "git worktree remove failed";
    console.warn("[issuectl] git worktree remove failed, will still rm directory:", gitWarning);
  }
  if (cwd) {
    try {
      await execFileAsync("git", ["worktree", "prune"], { cwd, timeout: 15_000 });
    } catch (err) {
      console.warn(
        "[issuectl] git worktree prune failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  try {
    await rm(resolved, { recursive: true, force: true });
  } catch (err) {
    console.error(
      "[issuectl] Failed to rm worktree directory:",
      { path: resolved, gitWarning },
      err,
    );
    const rmMessage = err instanceof Error ? err.message : String(err);
    const errorMessage = gitWarning
      ? `Filesystem cleanup of ${resolved} failed (${rmMessage}); the git worktree entry also had a problem earlier (${gitWarning}). Remove the directory manually and run \`git worktree prune\` in the parent repo.`
      : `Filesystem cleanup of ${resolved} failed (${rmMessage}). Remove the directory manually.`;
    return { success: false, error: errorMessage };
  }

  const { stale } = revalidateSafely("/settings");
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

export async function cleanupStaleWorktrees(): Promise<{
  success: boolean;
  removed: number;
  error?: string;
  cacheStale?: true;
}> {
  let worktrees;
  try {
    worktrees = await listWorktrees();
  } catch (err) {
    console.error("[issuectl] cleanupStaleWorktrees: failed to list worktrees:", err);
    return {
      success: false,
      removed: 0,
      error: err instanceof Error ? err.message : "Failed to read worktree directory",
    };
  }
  const stale = worktrees.filter((wt) => wt.stale);

  if (stale.length === 0) {
    return { success: true, removed: 0 };
  }

  let removed = 0;
  const failures: string[] = [];
  for (const wt of stale) {
    const result = await cleanupWorktree(wt.path, wt.localPath ?? undefined);
    if (result.success) {
      removed++;
    } else {
      failures.push(`${wt.name}: ${result.error}`);
    }
  }

  const { stale: cacheStale } = revalidateSafely("/settings");
  if (failures.length > 0) {
    return {
      success: false,
      removed,
      error: `Failed to remove ${failures.length} worktree(s):\n${failures.join("\n")}`,
      ...(cacheStale ? { cacheStale: true as const } : {}),
    };
  }
  return {
    success: true,
    removed,
    ...(cacheStale ? { cacheStale: true as const } : {}),
  };
}
