"use server";

import { getDb, setPriority, type Priority } from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

const VALID_PRIORITIES: readonly Priority[] = ["low", "normal", "high"];

export async function setPriorityAction(
  repoId: number,
  issueNumber: number,
  priority: Priority,
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (typeof repoId !== "number" || !Number.isInteger(repoId) || repoId <= 0) {
    return { success: false, error: "repoId must be a positive integer" };
  }
  if (
    typeof issueNumber !== "number" ||
    !Number.isInteger(issueNumber) ||
    issueNumber <= 0
  ) {
    return { success: false, error: "issueNumber must be a positive integer" };
  }
  if (!(VALID_PRIORITIES as readonly string[]).includes(priority)) {
    return { success: false, error: "Invalid priority value" };
  }

  const db = getDb();
  setPriority(db, repoId, issueNumber, priority);
  const { stale } = revalidateSafely("/");
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}
