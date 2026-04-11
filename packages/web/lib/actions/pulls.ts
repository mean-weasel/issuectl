"use server";

import { revalidatePath } from "next/cache";
import { getOctokit } from "@issuectl/core";

export async function mergePullAction(
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<{ success: boolean; error?: string }> {
  if (typeof owner !== "string" || owner.trim().length === 0) {
    return { success: false, error: "Invalid owner" };
  }
  if (typeof repo !== "string" || repo.trim().length === 0) {
    return { success: false, error: "Invalid repo" };
  }
  if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
    return { success: false, error: "Invalid pull request number" };
  }

  try {
    const octokit = await getOctokit();
    await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
    });
    revalidatePath(`/pulls/${owner}/${repo}/${pullNumber}`);
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    console.error(
      "[issuectl] mergePullAction failed",
      { owner, repo, pullNumber },
      err,
    );
    return {
      success: false,
      error: err instanceof Error ? err.message : "Merge failed",
    };
  }
}
