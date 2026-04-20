"use server";

import type { GitHubComment } from "@issuectl/core";
import {
  getDb,
  getRepo,
  getIssueContent,
  addComment as coreAddComment,
  withAuthRetry,
  withIdempotency,
  DuplicateInFlightError,
  formatErrorForUser,
} from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

export async function getComments(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<{ success: true; comments: GitHubComment[] } | { success: false; error: string }> {
  if (!owner || !repo || issueNumber <= 0) {
    return { success: false, error: "Invalid input" };
  }
  try {
    const db = getDb();
    const { comments } = await withAuthRetry((octokit) =>
      getIssueContent(db, octokit, owner, repo, issueNumber),
    );
    return { success: true, comments };
  } catch (err) {
    console.error("[issuectl] Failed to fetch comments:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
}

const MAX_COMMENT_BODY = 65536;

export async function addComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  idempotencyKey?: string,
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
    const runAddComment = async () => {
      await withAuthRetry((octokit) =>
        coreAddComment(db, octokit, owner, repo, issueNumber, body),
      );
      return null;
    };
    if (idempotencyKey) {
      await withIdempotency(db, "add-comment", idempotencyKey, runAddComment);
    } else {
      await runAddComment();
    }
  } catch (err) {
    if (err instanceof DuplicateInFlightError) {
      return {
        success: false,
        error: "This comment is already being posted — please wait.",
      };
    }
    console.error("[issuectl] Failed to add comment:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
  const { stale } = revalidateSafely(
    `/${owner}/${repo}/issues/${issueNumber}`,
    `/${owner}/${repo}/pulls/${issueNumber}`,
  );
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}
