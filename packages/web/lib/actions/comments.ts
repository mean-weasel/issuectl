"use server";

import { revalidatePath } from "next/cache";
import { getDb, getOctokit, addComment as coreAddComment } from "@issuectl/core";

export async function addComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<{ success: boolean; error?: string }> {
  if (!owner || !repo || issueNumber <= 0 || !body.trim()) {
    return { success: false, error: "Invalid input" };
  }

  try {
    const db = getDb();
    const octokit = await getOctokit();
    await coreAddComment(db, octokit, owner, repo, issueNumber, body);
  } catch (err) {
    console.error("[issuectl] Failed to add comment:", err);
    return { success: false, error: "Failed to post comment" };
  }
  revalidatePath(`/${owner}/${repo}/issues/${issueNumber}`);
  return { success: true };
}
