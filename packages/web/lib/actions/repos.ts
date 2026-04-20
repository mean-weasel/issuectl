"use server";

import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import {
  getDb,
  addRepo as coreAddRepo,
  removeRepo as coreRemoveRepo,
  updateRepo as coreUpdateRepo,
  readCachedAccessibleRepos,
  refreshAccessibleRepos,
  getIssues,
  getPulls,
  listLabels,
  withAuthRetry,
  formatErrorForUser,
  type AccessibleReposSnapshot,
} from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

function expandHome(p: string): string {
  return p.startsWith("~") ? p.replace("~", homedir()) : p;
}

function errMessage(err: unknown): unknown {
  return err instanceof Error ? err.message : err;
}

export type AddRepoResult =
  | {
      success: true;
      addedRepo: { owner: string; name: string };
      warning?: string;
      cacheStale?: true;
    }
  | { success: false; error: string };

export async function addRepo(
  owner: string,
  name: string,
  localPath?: string,
): Promise<AddRepoResult> {
  if (!owner || !name) {
    return { success: false, error: "Owner and repo name are required" };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return { success: false, error: "Invalid owner/repo format" };
  }

  try {
    await withAuthRetry((octokit) =>
      octokit.rest.repos.get({ owner, repo: name }),
    );
  } catch (err) {
    console.error("[issuectl] Failed to fetch repo from GitHub:", errMessage(err));
    return {
      success: false,
      error: `Repository ${owner}/${name} not found on GitHub: ${formatErrorForUser(err)}`,
    };
  }

  try {
    const db = getDb();
    coreAddRepo(db, { owner, name, localPath });
  } catch (err) {
    console.error("[issuectl] Failed to add repo:", errMessage(err));
    const msg =
      err instanceof Error && err.message.includes("UNIQUE")
        ? "Repository already tracked"
        : "Failed to add repository";
    return { success: false, error: msg };
  }

  // Fire-and-forget: warm caches in the background so the dashboard is
  // pre-populated, but don't block the response. If warming hasn't
  // finished by the time the user visits the dashboard, the async
  // Server Component fetches from GitHub directly (slower first load,
  // but functionally correct).
  withAuthRetry(async (octokit) => {
    const db = getDb();
    await Promise.all([
      getIssues(db, octokit, owner, name).catch((err) => {
        console.warn(
          `[issuectl] Warm getIssues failed for ${owner}/${name}:`,
          errMessage(err),
        );
      }),
      getPulls(db, octokit, owner, name).catch((err) => {
        console.warn(
          `[issuectl] Warm getPulls failed for ${owner}/${name}:`,
          errMessage(err),
        );
      }),
      listLabels(octokit, owner, name).catch((err) => {
        console.warn(
          `[issuectl] Warm listLabels failed for ${owner}/${name}:`,
          errMessage(err),
        );
      }),
    ]);
  }).catch((err) => {
    console.error(
      `[issuectl] Warm sync failed for ${owner}/${name}:`,
      errMessage(err),
    );
  });

  const { stale } = revalidateSafely("/settings", "/");
  const addedRepo = { owner, name };

  if (localPath) {
    const exists = await stat(expandHome(localPath)).catch(() => null);
    if (!exists) {
      return {
        success: true,
        addedRepo,
        warning: "Local path does not exist — will prompt to clone on launch",
        ...(stale ? { cacheStale: true as const } : {}),
      };
    }
  }

  return {
    success: true,
    addedRepo,
    ...(stale ? { cacheStale: true as const } : {}),
  };
}

export async function removeRepo(
  id: number,
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (!id || id <= 0) {
    return { success: false, error: "Invalid repo ID" };
  }

  try {
    const db = getDb();
    coreRemoveRepo(db, id);
  } catch (err) {
    console.error("[issuectl] Failed to remove repo:", errMessage(err));
    return { success: false, error: "Failed to remove repository" };
  }
  const { stale } = revalidateSafely("/settings", "/");
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

export async function getGithubReposAction(): Promise<
  | { success: true; snapshot: AccessibleReposSnapshot }
  | { success: false; error: string }
> {
  try {
    const db = getDb();
    return { success: true, snapshot: readCachedAccessibleRepos(db) };
  } catch (err) {
    console.error("[issuectl] readCachedAccessibleRepos failed:", errMessage(err));
    return { success: false, error: formatErrorForUser(err) };
  }
}

export async function refreshGithubReposAction(): Promise<
  | { success: true; snapshot: AccessibleReposSnapshot }
  | { success: false; error: string }
> {
  try {
    const db = getDb();
    const snapshot = await withAuthRetry((octokit) =>
      refreshAccessibleRepos(db, octokit),
    );
    return { success: true, snapshot };
  } catch (err) {
    console.error(
      "[issuectl] refreshAccessibleRepos failed:",
      errMessage(err),
    );
    return { success: false, error: formatErrorForUser(err) };
  }
}

export async function updateRepo(
  id: number,
  updates: { localPath?: string; branchPattern?: string },
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (!id || id <= 0) {
    return { success: false, error: "Invalid repo ID" };
  }

  if (updates.localPath !== undefined && updates.localPath !== "") {
    const lp = updates.localPath.trim();
    if (!lp.startsWith("/") && !lp.startsWith("~")) {
      return { success: false, error: "Local path must be absolute (start with / or ~)" };
    }
    const home = homedir();
    let expanded: string;
    if (lp.startsWith("~/")) {
      expanded = home + lp.slice(1);
    } else if (lp === "~") {
      expanded = home;
    } else {
      expanded = lp;
    }
    const resolved = resolve(expanded);
    try {
      const dirStat = await stat(resolved);
      if (!dirStat.isDirectory()) {
        return { success: false, error: "Local path is not a directory" };
      }
    } catch {
      return { success: false, error: "Local path does not exist or is not accessible" };
    }
    try {
      await stat(resolve(resolved, ".git"));
    } catch {
      return { success: false, error: "Local path does not appear to be a git repository (no .git directory)" };
    }
  }

  try {
    const db = getDb();
    coreUpdateRepo(db, id, updates);
  } catch (err) {
    console.error("[issuectl] Failed to update repo:", errMessage(err));
    return { success: false, error: "Failed to update repository" };
  }
  const { stale } = revalidateSafely("/settings");
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}
