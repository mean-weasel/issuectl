"use server";

import { getDb, clearCache, clearCacheKey, dbExists } from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

const REFRESH_COOLDOWN_MS = 10_000;
let lastRefreshAt = 0;

export async function refreshAction(): Promise<{
  success: boolean;
  error?: string;
  cacheStale?: true;
}> {
  const now = Date.now();
  if (now - lastRefreshAt < REFRESH_COOLDOWN_MS) {
    return {
      success: false,
      error: "Please wait a few seconds before refreshing again",
    };
  }
  try {
    if (dbExists()) {
      const db = getDb();
      clearCache(db);
    }
  } catch (err) {
    console.error("[issuectl] refreshAction failed to clear cache:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to refresh",
    };
  }
  lastRefreshAt = now;
  const { stale } = revalidateSafely("/", "/settings");
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

/**
 * Targeted refresh for a single issue detail page — clears only the
 * cache keys relevant to this issue so the next render fetches fresh
 * comments, labels, and status from GitHub.
 */
export async function refreshIssueAction(
  owner: string,
  repo: string,
  number: number,
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  try {
    if (dbExists()) {
      const db = getDb();
      clearCacheKey(db, `issue-detail:${owner}/${repo}#${number}`);
      clearCacheKey(db, `issues:${owner}/${repo}`);
      clearCacheKey(db, `comments:${owner}/${repo}#${number}`);
    }
  } catch (err) {
    console.error("[issuectl] refreshIssueAction failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to refresh",
    };
  }
  const { stale } = revalidateSafely(`/issues/${owner}/${repo}/${number}`);
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}
