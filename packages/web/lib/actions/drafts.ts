"use server";

import {
  getDb,
  createDraft,
  deleteDraft,
  assignDraftToRepo,
  listRepos,
  updateDraft,
  getSetting,
  setSetting,
  withAuthRetry,
  withIdempotency,
  DuplicateInFlightError,
  formatErrorForUser,
  DraftPartialCommitError,
  getRepoById,
  clearCacheKey,
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
  try {
    const db = getDb();
    const repos = listRepos(db);
    return repos.map((r) => ({ id: r.id, owner: r.owner, name: r.name }));
  } catch (err) {
    console.error("[issuectl] listReposAction failed", err);
    throw err;
  }
}

export async function updateDraftAction(
  draftId: string,
  update: DraftUpdate,
): Promise<{ success: boolean; error?: string; code?: "NOT_FOUND"; cacheStale?: true }> {
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
    // updateDraft returns undefined when no row exists for the id.
    // Surface that as an explicit failure so the editing surface
    // cannot believe its autosaves are persisting when they are
    // silently no-ops — reachable via cross-tab delete, stale router
    // cache on back-navigation, or an unmounted editor still
    // referencing a freshly-deleted id.
    const updated = updateDraft(db, draftId, update);
    if (!updated) {
      return {
        success: false,
        code: "NOT_FOUND",
        error: "Draft no longer exists — it may have been deleted.",
      };
    }
  } catch (err) {
    console.error("[issuectl] updateDraftAction failed", err);
    return { success: false, error: "Failed to update draft" };
  }
  const { stale } = revalidateSafely("/", `/drafts/${draftId}`);
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

export async function deleteDraftAction(
  draftId: string,
): Promise<{ success: true; cacheStale?: true } | { success: false; error: string }> {
  if (typeof draftId !== "string" || draftId.length === 0) {
    return { success: false, error: "draftId must be a non-empty string" };
  }

  try {
    const db = getDb();
    const deleted = deleteDraft(db, draftId);
    if (!deleted) {
      return { success: false, error: "Draft not found — it may have already been deleted." };
    }
  } catch (err) {
    console.error("[issuectl] deleteDraftAction failed", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete draft",
    };
  }
  const { stale } = revalidateSafely("/");
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
  // Length floor matches `isValidNonce`'s 8-char minimum so the
  // singleflight wrap below can use draftId as a sentinel key without
  // tripping on a malformed caller. UUID drafts are 36 chars and pass.
  if (typeof draftId !== "string" || draftId.length < 8) {
    return { success: false, error: "draftId must be at least 8 characters" };
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
    // Two-layer idempotency: the outer sentinel deduplicates same-tab
    // retries (one user nonce → one stored result), while the inner
    // sentinel collapses cross-tab races onto the same draft. Distinct
    // user nonces bypass the outer layer, so without this the second
    // tab would race into runAssign and create a duplicate GitHub
    // issue; keying the inner layer on the draftId itself means the
    // loser of the race either replays the winner's {issueNumber,
    // issueUrl} or throws DuplicateInFlightError.
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

  // Clear the SQLite issues cache for this repo so the next page render
  // fetches fresh data from GitHub that includes the newly created issue.
  try {
    const db = getDb();
    const repo = getRepoById(db, repoId);
    if (repo) {
      clearCacheKey(db, `issues:${repo.owner}/${repo.name}`);
    }
  } catch (err) {
    // Cache miss on next render is the fallback — don't fail the action.
    console.warn(
      "[issuectl] Failed to clear issues cache after draft assignment",
      { repoId },
      err,
    );
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

export async function getDefaultRepoIdAction(): Promise<number | null> {
  try {
    const db = getDb();
    const value = getSetting(db, "default_repo_id");
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch (err) {
    console.error("[issuectl] getDefaultRepoIdAction failed", err);
    return null;
  }
}

export async function setDefaultRepoIdAction(
  repoId: number | null,
): Promise<{ success: boolean; error?: string }> {
  if (repoId !== null) {
    if (typeof repoId !== "number" || !Number.isInteger(repoId) || repoId <= 0) {
      return { success: false, error: "repoId must be a positive integer" };
    }
  }

  try {
    const db = getDb();
    setSetting(db, "default_repo_id", repoId !== null ? String(repoId) : "");
    return { success: true };
  } catch (err) {
    console.error("[issuectl] setDefaultRepoIdAction failed", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update default repo",
    };
  }
}
