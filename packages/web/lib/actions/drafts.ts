"use server";

import {
  getDb,
  createDraft,
  assignDraftToRepo,
  listRepos,
  updateDraft,
  withAuthRetry,
  withIdempotency,
  DuplicateInFlightError,
  formatErrorForUser,
  DraftPartialCommitError,
  type DraftInput,
  type DraftUpdate,
  type Priority,
} from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

const VALID_PRIORITIES: readonly Priority[] = ["low", "normal", "high"];
const MAX_TITLE = 256;
const MAX_BODY = 65536;

// Server actions are HTTP endpoints reachable with arbitrary request bodies,
// not just via the UI. Validate shape at the boundary so untrusted clients
// can't hand garbage to core.

function validateTitle(title: unknown): string {
  if (typeof title !== "string") {
    throw new Error("Draft title must be a string");
  }
  if (title.trim().length === 0) {
    throw new Error("Draft title must not be empty");
  }
  if (title.length > MAX_TITLE) {
    throw new Error(`Draft title must be ${MAX_TITLE} characters or fewer`);
  }
  return title;
}

function validatePriority(priority: unknown): Priority | undefined {
  if (priority === undefined || priority === null) return undefined;
  if (
    typeof priority === "string" &&
    (VALID_PRIORITIES as readonly string[]).includes(priority)
  ) {
    return priority as Priority;
  }
  throw new Error(
    `Invalid priority: ${String(priority)}. Expected 'low', 'normal', or 'high'.`,
  );
}

function validateBody(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body !== "string") {
    throw new Error("Draft body must be a string");
  }
  if (body.length > MAX_BODY) {
    throw new Error(`Draft body must be ${MAX_BODY} characters or fewer`);
  }
  return body;
}

export async function createDraftAction(
  input: DraftInput,
): Promise<
  | { success: true; id: string; cacheStale?: true }
  | { success: false; error: string }
> {
  let draftId: string;
  try {
    const title = validateTitle(input.title);
    const body = validateBody(input.body);
    const priority = validatePriority(input.priority);

    const db = getDb();
    const draft = createDraft(db, { title, body, priority });
    draftId = draft.id;
  } catch (err) {
    console.error("[issuectl] createDraftAction failed", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create draft",
    };
  }
  const { stale } = revalidateSafely("/");
  return {
    success: true,
    id: draftId,
    ...(stale ? { cacheStale: true as const } : {}),
  };
}

export async function listReposAction(): Promise<
  Array<{ id: number; owner: string; name: string }>
> {
  const db = getDb();
  const repos = listRepos(db);
  return repos.map((r) => ({ id: r.id, owner: r.owner, name: r.name }));
}

export async function updateDraftAction(
  draftId: string,
  update: DraftUpdate,
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (typeof draftId !== "string" || draftId.length === 0) {
    return { success: false, error: "draftId must be a non-empty string" };
  }
  try {
    if (update.title !== undefined) validateTitle(update.title);
    if (update.body !== undefined) validateBody(update.body);
    if (update.priority !== undefined) validatePriority(update.priority);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Invalid draft update",
    };
  }

  try {
    const db = getDb();
    // updateDraft returns undefined when no row exists for the id —
    // a tab-A-deleted-the-draft / tab-B-still-editing race. Surface
    // that as an explicit failure so the editing tab cannot believe
    // its autosaves are persisting when they are silently no-ops.
    const updated = updateDraft(db, draftId, update);
    if (!updated) {
      return {
        success: false,
        error: "Draft no longer exists — it may have been deleted in another tab",
      };
    }
  } catch (err) {
    console.error("[issuectl] updateDraftAction failed", err);
    return { success: false, error: "Failed to update draft" };
  }
  const { stale } = revalidateSafely("/", `/drafts/${draftId}`);
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

export async function assignDraftAction(
  draftId: string,
  repoId: number,
  idempotencyKey?: string,
): Promise<
  | {
      success: true;
      issueNumber: number;
      issueUrl: string;
      // Set when the GitHub issue was created successfully but the local
      // draft cleanup failed (DraftPartialCommitError). The caller should
      // show the user the issue URL AND surface the warning so they know
      // to delete the lingering draft manually.
      cleanupWarning?: string;
      cacheStale?: true;
    }
  | { success: false; error: string }
> {
  if (typeof draftId !== "string" || draftId.length === 0) {
    return { success: false, error: "draftId must be a non-empty string" };
  }
  if (
    typeof repoId !== "number" ||
    !Number.isInteger(repoId) ||
    repoId <= 0
  ) {
    return { success: false, error: "repoId must be a positive integer" };
  }

  let issueNumber: number;
  let issueUrl: string;
  let cleanupWarning: string | undefined;
  try {
    const db = getDb();
    const runAssign = async () => {
      try {
        const result = await withAuthRetry((octokit) =>
          assignDraftToRepo(db, octokit, draftId, repoId),
        );
        return {
          issueNumber: result.issueNumber,
          issueUrl: result.issueUrl,
          cleanupWarning: null as string | null,
        };
      } catch (err) {
        if (err instanceof DraftPartialCommitError) {
          // The GitHub issue exists — return it as a "success with warning"
          // so the idempotency sentinel stores it as completed and a retry
          // replays the same issueNumber rather than creating a duplicate.
          console.warn(
            "[issuectl] assignDraftAction partial commit",
            { draftId, repoId, issueNumber: err.issueNumber },
            err,
          );
          return {
            issueNumber: err.issueNumber,
            issueUrl: err.issueUrl,
            cleanupWarning: err.message,
          };
        }
        throw err;
      }
    };
    // B10: a per-draft singleflight gate, layered under the user-nonce
    // idempotency. Two concurrent tabs send fresh (distinct) user nonces,
    // so the outer "assign-draft" sentinel does not deduplicate them —
    // both would race into runAssign and both would create GitHub issues,
    // orphaning whichever loses the local delete. Keying a second
    // sentinel on the draftId itself collapses cross-tab requests onto
    // the same result: the loser of the race either replays the winner's
    // {issueNumber, issueUrl} (if the winner has finished) or throws
    // DuplicateInFlightError (if the winner is still in flight). Both
    // surface the same friendly "already being assigned" UI message —
    // and the replay case actually returns the winner's issue URL so
    // the user is led directly to their newly created issue.
    //
    // withIdempotency's isValidNonce requires 8+ URL-safe chars. Draft
    // UUIDs are 36 chars hyphenated and pass cleanly; rejecting shorter
    // ids upfront keeps the singleflight error message coherent for
    // malformed callers.
    if (draftId.length < 8) {
      return { success: false, error: "draftId must be at least 8 characters" };
    }
    const runWithSingleflight = () =>
      withIdempotency(db, "assign-draft-singleflight", draftId, runAssign);
    const result = idempotencyKey
      ? await withIdempotency(
          db,
          "assign-draft",
          idempotencyKey,
          runWithSingleflight,
        )
      : await runWithSingleflight();
    issueNumber = result.issueNumber;
    issueUrl = result.issueUrl;
    cleanupWarning = result.cleanupWarning ?? undefined;
  } catch (err) {
    if (err instanceof DuplicateInFlightError) {
      return {
        success: false,
        error: "This draft is already being assigned — please wait.",
      };
    }
    console.error(
      "[issuectl] assignDraftAction failed",
      { draftId, repoId },
      err,
    );
    return { success: false, error: formatErrorForUser(err) };
  }

  const { stale } = revalidateSafely("/");
  return {
    success: true,
    issueNumber,
    issueUrl,
    ...(cleanupWarning ? { cleanupWarning } : {}),
    ...(stale ? { cacheStale: true as const } : {}),
  };
}
