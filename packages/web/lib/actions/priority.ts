"use server";

import { revalidatePath } from "next/cache";
import { getDb, setPriority, type Priority } from "@issuectl/core";

const VALID_PRIORITIES: readonly Priority[] = ["low", "normal", "high"];

export async function setPriorityAction(
  repoId: number,
  issueNumber: number,
  priority: Priority,
): Promise<void> {
  if (typeof repoId !== "number" || !Number.isInteger(repoId) || repoId <= 0) {
    throw new Error("repoId must be a positive integer");
  }
  if (
    typeof issueNumber !== "number" ||
    !Number.isInteger(issueNumber) ||
    issueNumber <= 0
  ) {
    throw new Error("issueNumber must be a positive integer");
  }
  if (!(VALID_PRIORITIES as readonly string[]).includes(priority)) {
    throw new Error(`Invalid priority: ${String(priority)}`);
  }

  const db = getDb();
  setPriority(db, repoId, issueNumber, priority);
  revalidatePath("/");
}
