"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  getOctokit,
  closeIssue as coreCloseIssue,
  clearCacheKey,
} from "@issuectl/core";

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
