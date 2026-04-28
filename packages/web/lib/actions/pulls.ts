"use server";

import {
  getDb,
  getRepo,
  clearCacheKey,
  withAuthRetry,
  formatErrorForUser,
  createReview,
} from "@issuectl/core";
import type { ReviewEvent } from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

export async function mergePullAction(
  owner: string,
  repo: string,
  pullNumber: number,
  mergeMethod?: "merge" | "squash" | "rebase",
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (typeof owner !== "string" || owner.trim().length === 0) {
    return { success: false, error: "Invalid owner" };
  }
  if (typeof repo !== "string" || repo.trim().length === 0) {
    return { success: false, error: "Invalid repo" };
  }
  if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
    return { success: false, error: "Invalid pull request number" };
  }
  const VALID_MERGE_METHODS = ["merge", "squash", "rebase"] as const;
  if (mergeMethod !== undefined && !(VALID_MERGE_METHODS as readonly string[]).includes(mergeMethod)) {
    return { success: false, error: "Invalid merge method" };
  }

  try {
    const db = getDb();
    const tracked = getRepo(db, owner, repo);
    if (!tracked) {
      return { success: false, error: "Repository is not tracked" };
    }

    await withAuthRetry((octokit) =>
      octokit.rest.pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        ...(mergeMethod ? { merge_method: mergeMethod } : {}),
      }),
    );
    // Clear the PR detail cache so the re-rendered page shows merged state
    // instead of the pre-merge snapshot (otherwise the top StateChip stays
    // "open" until TTL expiry, contradicting the "merged successfully" banner).
    clearCacheKey(db, `pull-detail:${owner}/${repo}#${pullNumber}`);
    clearCacheKey(db, `pulls:${owner}/${repo}`);
  } catch (err) {
    console.error(
      "[issuectl] mergePullAction failed",
      { owner, repo, pullNumber },
      err,
    );
    return { success: false, error: formatErrorForUser(err) };
  }

  const { stale } = revalidateSafely(
    `/pulls/${owner}/${repo}/${pullNumber}`,
    "/",
  );
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

export async function submitReviewAction(
  owner: string,
  repo: string,
  pullNumber: number,
  event: ReviewEvent,
  body?: string,
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (typeof owner !== "string" || owner.trim().length === 0) {
    return { success: false, error: "Invalid owner" };
  }
  if (typeof repo !== "string" || repo.trim().length === 0) {
    return { success: false, error: "Invalid repo" };
  }
  if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
    return { success: false, error: "Invalid pull request number" };
  }
  const VALID_EVENTS = ["APPROVE", "REQUEST_CHANGES", "COMMENT"] as const;
  if (!(VALID_EVENTS as readonly string[]).includes(event)) {
    return { success: false, error: "Invalid review event" };
  }
  if (body !== undefined && typeof body !== "string") {
    return { success: false, error: "Invalid review body" };
  }

  try {
    const db = getDb();
    const tracked = getRepo(db, owner, repo);
    if (!tracked) {
      return { success: false, error: "Repository is not tracked" };
    }

    await withAuthRetry((octokit) =>
      createReview(octokit, owner, repo, pullNumber, event, body),
    );
    clearCacheKey(db, `pull-detail:${owner}/${repo}#${pullNumber}`);
  } catch (err) {
    console.error(
      "[issuectl] submitReviewAction failed",
      { owner, repo, pullNumber, event },
      err,
    );
    return { success: false, error: formatErrorForUser(err) };
  }

  const { stale } = revalidateSafely(
    `/pulls/${owner}/${repo}/${pullNumber}`,
  );
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}
