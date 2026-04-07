"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  getOctokit,
  createIssue as coreCreateIssue,
  updateIssue as coreUpdateIssue,
  closeIssue as coreCloseIssue,
  addLabel as coreAddLabel,
  removeLabel as coreRemoveLabel,
  clearCacheKey,
} from "@issuectl/core";

export async function createIssue(data: {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
}): Promise<{ success: boolean; issueNumber?: number; error?: string }> {
  const { owner, repo, title, body, labels } = data;
  if (!owner || !repo || !title.trim()) {
    return { success: false, error: "Owner, repo, and title are required" };
  }

  try {
    const db = getDb();
    const octokit = await getOctokit();
    const issue = await coreCreateIssue(octokit, owner, repo, {
      title: title.trim(),
      body: body?.trim() || undefined,
      labels,
    });
    clearCacheKey(db, `issues:${owner}/${repo}`);
    revalidatePath(`/${owner}/${repo}`);
    return { success: true, issueNumber: issue.number };
  } catch (err) {
    console.error("[issuectl] Failed to create issue:", err);
    return { success: false, error: "Failed to create issue" };
  }
}

export async function updateIssue(data: {
  owner: string;
  repo: string;
  number: number;
  title?: string;
  body?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { owner, repo, number, title, body } = data;
  if (!owner || !repo || number <= 0) {
    return { success: false, error: "Invalid input" };
  }
  if (title !== undefined && !title.trim()) {
    return { success: false, error: "Title cannot be empty" };
  }

  try {
    const db = getDb();
    const octokit = await getOctokit();
    await coreUpdateIssue(octokit, owner, repo, number, {
      title: title?.trim(),
      body: body !== undefined ? body.trim() : undefined,
    });
    clearCacheKey(db, `issue-detail:${owner}/${repo}#${number}`);
    clearCacheKey(db, `issues:${owner}/${repo}`);
  } catch (err) {
    console.error("[issuectl] Failed to update issue:", err);
    return { success: false, error: "Failed to update issue" };
  }
  revalidatePath(`/${owner}/${repo}/issues/${number}`);
  return { success: true };
}

export async function closeIssue(
  owner: string,
  repo: string,
  number: number,
): Promise<{ success: boolean; error?: string }> {
  if (!owner || !repo || number <= 0) {
    return { success: false, error: "Invalid input" };
  }

  try {
    const db = getDb();
    const octokit = await getOctokit();
    await coreCloseIssue(octokit, owner, repo, number);
    clearCacheKey(db, `issue-detail:${owner}/${repo}#${number}`);
    clearCacheKey(db, `issues:${owner}/${repo}`);
  } catch (err) {
    console.error("[issuectl] Failed to close issue:", err);
    return { success: false, error: "Failed to close issue" };
  }
  revalidatePath(`/${owner}/${repo}/issues/${number}`);
  return { success: true };
}

export async function toggleLabel(data: {
  owner: string;
  repo: string;
  number: number;
  label: string;
  action: "add" | "remove";
}): Promise<{ success: boolean; error?: string }> {
  const { owner, repo, number, label, action } = data;
  if (!owner || !repo || number <= 0 || !label) {
    return { success: false, error: "Invalid input" };
  }

  try {
    const db = getDb();
    const octokit = await getOctokit();
    if (action === "add") {
      await coreAddLabel(octokit, owner, repo, number, label);
    } else {
      await coreRemoveLabel(octokit, owner, repo, number, label);
    }
    clearCacheKey(db, `issue-detail:${owner}/${repo}#${number}`);
    clearCacheKey(db, `issues:${owner}/${repo}`);
  } catch (err) {
    console.error(`[issuectl] Failed to ${action} label:`, err);
    return { success: false, error: `Failed to ${action} label` };
  }
  revalidatePath(`/${owner}/${repo}/issues/${number}`);
  return { success: true };
}
