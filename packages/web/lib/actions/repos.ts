"use server";

import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import {
  getDb,
  addRepo as coreAddRepo,
  removeRepo as coreRemoveRepo,
  updateRepo as coreUpdateRepo,
  withAuthRetry,
  formatErrorForUser,
} from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

function expandHome(p: string): string {
  return p.startsWith("~") ? p.replace("~", homedir()) : p;
}

export async function addRepo(
  owner: string,
  name: string,
  localPath?: string,
): Promise<{
  success: boolean;
  warning?: string;
  error?: string;
  cacheStale?: true;
}> {
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
    console.error("[issuectl] Failed to fetch repo from GitHub:", err);
    return {
      success: false,
      error: `Repository ${owner}/${name} not found on GitHub: ${formatErrorForUser(err)}`,
    };
  }

  try {
    const db = getDb();
    coreAddRepo(db, { owner, name, localPath });
  } catch (err) {
    console.error("[issuectl] Failed to add repo:", err);
    const msg =
      err instanceof Error && err.message.includes("UNIQUE")
        ? "Repository already tracked"
        : "Failed to add repository";
    return { success: false, error: msg };
  }
  const { stale } = revalidateSafely("/settings", "/");

  if (localPath) {
    const exists = await stat(expandHome(localPath)).catch(() => null);
    if (!exists) {
      return {
        success: true,
        warning: "Local path does not exist — will prompt to clone on launch",
        ...(stale ? { cacheStale: true as const } : {}),
      };
    }
  }

  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
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
    console.error("[issuectl] Failed to remove repo:", err);
    return { success: false, error: "Failed to remove repository" };
  }
  const { stale } = revalidateSafely("/settings", "/");
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

export async function updateRepo(
  id: number,
  updates: { localPath?: string; branchPattern?: string },
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (!id || id <= 0) {
    return { success: false, error: "Invalid repo ID" };
  }

  try {
    const db = getDb();
    coreUpdateRepo(db, id, updates);
  } catch (err) {
    console.error("[issuectl] Failed to update repo:", err);
    return { success: false, error: "Failed to update repository" };
  }
  const { stale } = revalidateSafely("/settings");
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}
