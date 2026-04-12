"use server";

import {
  getDb,
  getRepo,
  createIssue as coreCreateIssue,
  updateIssue as coreUpdateIssue,
  closeIssue as coreCloseIssue,
  addLabel as coreAddLabel,
  removeLabel as coreRemoveLabel,
  clearCacheKey,
  withAuthRetry,
  formatErrorForUser,
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
}): Promise<{
  success: boolean;
  issueNumber?: number;
  error?: string;
  cacheStale?: true;
}> {
  const { owner, repo, title, body, labels } = data;
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
    const issue = await withAuthRetry((octokit) =>
      coreCreateIssue(octokit, owner, repo, {
        title: title.trim(),
        body: body?.trim() || undefined,
        labels,
      }),
    );
    clearCacheKey(db, `issues:${owner}/${repo}`);
    issueNumber = issue.number;
  } catch (err) {
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
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
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
