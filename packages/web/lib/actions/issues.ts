"use server";

import {
  getDb,
  getRepo,
  getRepoById,
  createIssue as coreCreateIssue,
  updateIssue as coreUpdateIssue,
  closeIssue as coreCloseIssue,
  reassignIssue as coreReassignIssue,
  addLabel as coreAddLabel,
  removeLabel as coreRemoveLabel,
  clearCacheKey,
  withAuthRetry,
  withIdempotency,
  DuplicateInFlightError,
  formatErrorForUser,
  type ReassignResult,
} from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

const MAX_TITLE = 256;
const MAX_BODY = 65536;

export async function createIssue(data: {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  /**
   * Idempotency nonce — optional but strongly recommended for any
   * client-originated call. If present, a second call with the same nonce
   * replays the stored result rather than creating a duplicate issue on
   * GitHub. Generated client-side via `crypto.randomUUID()` per submission.
   */
  idempotencyKey?: string;
}): Promise<{
  success: boolean;
  issueNumber?: number;
  error?: string;
  cacheStale?: true;
}> {
  const { owner, repo, title, body, labels, idempotencyKey } = data;
  if (!owner || !repo || !title.trim()) {
    return { success: false, error: "Owner, repo, and title are required" };
  }
  if (title.length > MAX_TITLE) {
    return { success: false, error: `Title must be ${MAX_TITLE} characters or fewer` };
  }
  if (body !== undefined && body.length > MAX_BODY) {
    return { success: false, error: `Body must be ${MAX_BODY} characters or fewer` };
  }

  let issueNumber: number;
  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return { success: false, error: "Repository is not tracked" };
    }
    const runCreate = async () => {
      const issue = await withAuthRetry((octokit) =>
        coreCreateIssue(octokit, owner, repo, {
          title: title.trim(),
          body: body?.trim() || undefined,
          labels,
        }),
      );
      clearCacheKey(db, `issues:${owner}/${repo}`);
      return { number: issue.number };
    };
    const result = idempotencyKey
      ? await withIdempotency(db, "create-issue", idempotencyKey, runCreate)
      : await runCreate();
    issueNumber = result.number;
  } catch (err) {
    if (err instanceof DuplicateInFlightError) {
      return {
        success: false,
        error: "This issue is already being created — please wait.",
      };
    }
    console.error("[issuectl] Failed to create issue:", err);
    return { success: false, error: formatErrorForUser(err) };
  }

  const { stale } = revalidateSafely(`/${owner}/${repo}`);
  return {
    success: true,
    issueNumber,
    ...(stale ? { cacheStale: true as const } : {}),
  };
}

export async function updateIssue(data: {
  owner: string;
  repo: string;
  number: number;
  title?: string;
  body?: string;
}): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  const { owner, repo, number, title, body } = data;
  if (!owner || !repo || !Number.isFinite(number) || number <= 0) {
    return { success: false, error: "Valid owner, repo, and issue number are required" };
  }
  if (title !== undefined && !title.trim()) {
    return { success: false, error: "Title cannot be empty" };
  }
  if (title !== undefined && title.length > MAX_TITLE) {
    return { success: false, error: `Title must be ${MAX_TITLE} characters or fewer` };
  }
  if (body !== undefined && body.length > MAX_BODY) {
    return { success: false, error: `Body must be ${MAX_BODY} characters or fewer` };
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return { success: false, error: "Repository is not tracked" };
    }
    await withAuthRetry((octokit) =>
      coreUpdateIssue(octokit, owner, repo, number, {
        title: title?.trim(),
        body: body !== undefined ? body.trim() : undefined,
      }),
    );
    clearCacheKey(db, `issue-detail:${owner}/${repo}#${number}`);
    clearCacheKey(db, `issues:${owner}/${repo}`);
  } catch (err) {
    console.error("[issuectl] Failed to update issue:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
  const { stale } = revalidateSafely(`/${owner}/${repo}/issues/${number}`);
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

export async function closeIssue(
  owner: string,
  repo: string,
  number: number,
): Promise<{ success: true; cacheStale?: true } | { success: false; error: string }> {
  if (!owner || !repo || !Number.isFinite(number) || number <= 0) {
    return { success: false, error: "Valid owner, repo, and issue number are required" };
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return { success: false, error: "Repository is not tracked" };
    }
    await withAuthRetry((octokit) =>
      coreCloseIssue(octokit, owner, repo, number),
    );
    clearCacheKey(db, `issue-detail:${owner}/${repo}#${number}`);
    clearCacheKey(db, `issues:${owner}/${repo}`);
  } catch (err) {
    console.error("[issuectl] Failed to close issue:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
  const { stale } = revalidateSafely(`/${owner}/${repo}/issues/${number}`);
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

export async function toggleLabel(data: {
  owner: string;
  repo: string;
  number: number;
  label: string;
  action: "add" | "remove";
}): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  const { owner, repo, number, label, action } = data;
  if (!owner || !repo || !Number.isFinite(number) || number <= 0 || !label) {
    return { success: false, error: "Valid owner, repo, issue number, and label are required" };
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return { success: false, error: "Repository is not tracked" };
    }
    if (action === "add") {
      await withAuthRetry((octokit) =>
        coreAddLabel(octokit, owner, repo, number, label),
      );
    } else {
      await withAuthRetry((octokit) =>
        coreRemoveLabel(octokit, owner, repo, number, label),
      );
    }
    clearCacheKey(db, `issue-detail:${owner}/${repo}#${number}`);
    clearCacheKey(db, `issues:${owner}/${repo}`);
  } catch (err) {
    console.error(`[issuectl] Failed to ${action} label:`, err);
    return { success: false, error: formatErrorForUser(err) };
  }
  const { stale } = revalidateSafely(`/${owner}/${repo}/issues/${number}`);
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

export async function reassignIssueAction(
  oldRepoId: number,
  issueNumber: number,
  newRepoId: number,
): Promise<
  | {
      success: true;
      newIssueNumber: number;
      newOwner: string;
      newRepo: string;
      cacheStale?: true;
    }
  | { success: false; error: string }
> {
  if (
    typeof oldRepoId !== "number" ||
    !Number.isInteger(oldRepoId) ||
    oldRepoId <= 0
  ) {
    return { success: false, error: "oldRepoId must be a positive integer" };
  }
  if (
    typeof newRepoId !== "number" ||
    !Number.isInteger(newRepoId) ||
    newRepoId <= 0
  ) {
    return { success: false, error: "newRepoId must be a positive integer" };
  }
  if (
    typeof issueNumber !== "number" ||
    !Number.isFinite(issueNumber) ||
    issueNumber <= 0
  ) {
    return {
      success: false,
      error: "issueNumber must be a positive integer",
    };
  }
  if (oldRepoId === newRepoId) {
    return { success: false, error: "Cannot re-assign to the same repo" };
  }

  let result: ReassignResult;
  try {
    const db = getDb();
    const oldRepo = getRepoById(db, oldRepoId);
    if (!oldRepo) {
      return { success: false, error: "Old repository is not tracked" };
    }
    const newRepo = getRepoById(db, newRepoId);
    if (!newRepo) {
      return { success: false, error: "New repository is not tracked" };
    }

    result = await withAuthRetry((octokit) =>
      coreReassignIssue(db, octokit, oldRepoId, issueNumber, newRepoId),
    );
  } catch (err) {
    console.error("[issuectl] Failed to re-assign issue:", err);
    return { success: false, error: formatErrorForUser(err) };
  }

  const { stale } = revalidateSafely("/");
  return {
    success: true,
    newIssueNumber: result.newIssueNumber,
    newOwner: result.newOwner,
    newRepo: result.newRepo,
    ...(stale ? { cacheStale: true as const } : {}),
  };
}
