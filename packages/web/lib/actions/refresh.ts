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

const ISSUE_REFRESH_COOLDOWN_MS = 5_000;
let lastIssueRefreshAt = 0;

/**
 * Targeted refresh for a single issue detail page — clears the cache
 * keys that the detail page actually reads (issue-header, issue-content)
 * plus the repo-wide issue list, so the next render fetches fresh data
 * from GitHub.
 */
export async function refreshIssueAction(
  owner: string,
  repo: string,
  number: number,
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (
    typeof owner !== "string" || !/^[\w.-]+$/.test(owner) ||
    typeof repo !== "string" || !/^[\w.-]+$/.test(repo) ||
    !Number.isInteger(number) || number <= 0
  ) {
    return { success: false, error: "Invalid issue reference" };
  }

  const now = Date.now();
  if (now - lastIssueRefreshAt < ISSUE_REFRESH_COOLDOWN_MS) {
    return {
      success: false,
      error: "Please wait a few seconds before refreshing again",
    };
  }

  try {
    if (dbExists()) {
      const db = getDb();
      clearCacheKey(db, `issue-header:${owner}/${repo}#${number}`);
      clearCacheKey(db, `issue-content:${owner}/${repo}#${number}`);
      clearCacheKey(db, `issues:${owner}/${repo}`);
    }
    lastIssueRefreshAt = now;
    const { stale } = revalidateSafely(`/issues/${owner}/${repo}/${number}`);
    return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
  } catch (err) {
    console.error("[issuectl] refreshIssueAction failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to refresh",
    };
  }
}
