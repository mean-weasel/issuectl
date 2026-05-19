"use server";

import {
  DuplicateInFlightError,
  formatErrorForUser,
  getDb,
  reassignIssue as coreReassignIssue,
  withAuthRetry,
  withIdempotency,
  type ReassignResult,
} from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

export async function reassignIssueAction(
  oldRepoId: number,
  issueNumber: number,
  newRepoId: number,
  idempotencyKey?: string,
): Promise<
  | {
      success: true;
      newIssueNumber: number;
      newOwner: string;
      newRepo: string;
      cleanupWarning?: string;
      cacheStale?: true;
    }
  | { success: false; error: string }
> {
  const validationError = validateReassignInput(oldRepoId, issueNumber, newRepoId);
  if (validationError) return { success: false, error: validationError };

  let result: ReassignResult;
  try {
    const db = getDb();

    const runReassign = async () => {
      return withAuthRetry((octokit) =>
        coreReassignIssue(db, octokit, oldRepoId, issueNumber, newRepoId),
      );
    };

    result = idempotencyKey
      ? await withIdempotency(db, "reassign-issue", idempotencyKey, runReassign)
      : await runReassign();
  } catch (err) {
    if (err instanceof DuplicateInFlightError) {
      return {
        success: false,
        error: "This issue is already being re-assigned — please wait.",
      };
    }
    console.error("[issuectl] Failed to re-assign issue:", err);
    return { success: false, error: formatErrorForUser(err) };
  }

  const { stale } = revalidateSafely("/");
  return {
    success: true,
    newIssueNumber: result.newIssueNumber,
    newOwner: result.newOwner,
    newRepo: result.newRepo,
    ...(result.cleanupWarning ? { cleanupWarning: result.cleanupWarning } : {}),
    ...(stale ? { cacheStale: true as const } : {}),
  };
}

function validateReassignInput(
  oldRepoId: number,
  issueNumber: number,
  newRepoId: number,
): string | null {
  if (!isPositiveInteger(oldRepoId)) {
    return "oldRepoId must be a positive integer";
  }
  if (!isPositiveInteger(newRepoId)) {
    return "newRepoId must be a positive integer";
  }
  if (typeof issueNumber !== "number" || !Number.isFinite(issueNumber) || issueNumber <= 0) {
    return "issueNumber must be a positive integer";
  }
  if (oldRepoId === newRepoId) {
    return "Cannot re-assign to the same repo";
  }
  return null;
}

function isPositiveInteger(value: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
