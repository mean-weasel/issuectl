"use server";

import { revalidatePath } from "next/cache";
import { readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getDb, getSetting, listRepos, getOctokit } from "@issuectl/core";

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
  } catch {
    return [];
  }

  const db = getDb();
  const repos = listRepos(db);

  const results = await Promise.all(
    entries.map(async (name) => {
      const fullPath = join(dir, name);
      const info = await stat(fullPath).catch(() => null);
      if (!info?.isDirectory()) return null;

      const match = name.match(/^(.+)-issue-(\d+)$/);
      const repoName = match ? match[1] : null;
      const issueNumber = match ? Number(match[2]) : null;

      // Try to match against tracked repos by name
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

  // Check staleness via GitHub API — a closed issue means the worktree is stale
  let octokit;
  try {
    octokit = await getOctokit();
  } catch {
    return worktrees;
  }

  await Promise.all(
    worktrees.map(async (wt) => {
      if (!wt.owner || !wt.repo || !wt.issueNumber) return;

      // Resolve the actual repo name (strip owner prefix if present)
      const repoName = repos.find(
        (r) => r.name === wt.repo || `${r.owner}-${r.name}` === wt.repo,
      )?.name;
      if (!repoName) return;

      try {
        const { data } = await octokit.rest.issues.get({
          owner: wt.owner,
          repo: repoName,
          issue_number: wt.issueNumber,
        });
        wt.stale = data.state === "closed";
      } catch {
        // API failure — leave as not stale
      }
    }),
  );

  return worktrees;
}

export async function cleanupWorktree(
  path: string,
  parentRepoPath?: string,
): Promise<{ success: boolean; error?: string }> {
  const worktreeDir = getWorktreeDir();
  const resolved = resolve(path);
  if (!resolved.startsWith(resolve(worktreeDir))) {
    return { success: false, error: "Invalid worktree path" };
  }

  try {
    const cwd = parentRepoPath ? expandHome(parentRepoPath) : undefined;
    await execFileAsync("git", ["worktree", "remove", resolved, "--force"], { cwd }).catch(
      (err) => {
        console.warn("[issuectl] git worktree remove failed, falling back to rm:", err.message);
      },
    );
    if (cwd) {
      await execFileAsync("git", ["worktree", "prune"], { cwd }).catch(() => {});
    }
    await rm(resolved, { recursive: true, force: true });
  } catch (err) {
    console.error("[issuectl] Failed to cleanup worktree:", err);
    return { success: false, error: "Failed to remove worktree" };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function cleanupStaleWorktrees(): Promise<{ success: boolean; removed: number; error?: string }> {
  const worktrees = await listWorktrees();
  const stale = worktrees.filter((wt) => wt.stale);

  if (stale.length === 0) {
    return { success: true, removed: 0 };
  }

  let removed = 0;
  for (const wt of stale) {
    const result = await cleanupWorktree(wt.path, wt.localPath ?? undefined);
    if (result.success) removed++;
  }

  revalidatePath("/settings");
  return { success: true, removed };
}
