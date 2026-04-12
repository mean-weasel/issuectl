"use server";

import {
  getDb,
  getRepo,
  addComment as coreAddComment,
  withAuthRetry,
  formatErrorForUser,
} from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

const MAX_COMMENT_BODY = 65536;

export async function addComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (!owner || !repo || issueNumber <= 0 || !body.trim()) {
    return { success: false, error: "Invalid input" };
  }
  if (body.length > MAX_COMMENT_BODY) {
    return {
      success: false,
      error: `Comment must be ${MAX_COMMENT_BODY} characters or fewer`,
    };
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return { success: false, error: "Repository is not tracked" };
    }
    await withAuthRetry((octokit) =>
      coreAddComment(db, octokit, owner, repo, issueNumber, body),
    );
  } catch (err) {
    console.error("[issuectl] Failed to add comment:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
  const { stale } = revalidateSafely(
    `/${owner}/${repo}/issues/${issueNumber}`,
    `/${owner}/${repo}/pulls/${issueNumber}`,
  );
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}
