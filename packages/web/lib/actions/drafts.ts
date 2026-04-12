"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  getOctokit,
  createDraft,
  assignDraftToRepo,
  listRepos,
  updateDraft,
  type DraftInput,
  type DraftUpdate,
  type Priority,
} from "@issuectl/core";

const VALID_PRIORITIES: readonly Priority[] = ["low", "normal", "high"];

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
  return body;
}

export async function createDraftAction(
  input: DraftInput,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    const title = validateTitle(input.title);
    const body = validateBody(input.body);
    const priority = validatePriority(input.priority);

    const db = getDb();
    const draft = createDraft(db, { title, body, priority });
    revalidatePath("/");
    return { success: true, id: draft.id };
  } catch (err) {
    console.error("[issuectl] createDraftAction failed", err);
    return { success: false, error: "Failed to create draft" };
  }
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
): Promise<{ success: boolean; error?: string }> {
  if (typeof draftId !== "string" || draftId.length === 0) {
    return { success: false, error: "draftId must be a non-empty string" };
  }
  if (update.title !== undefined) validateTitle(update.title);
  if (update.body !== undefined) validateBody(update.body);
  if (update.priority !== undefined) validatePriority(update.priority);

  try {
    const db = getDb();
    updateDraft(db, draftId, update);
    revalidatePath("/");
    revalidatePath(`/drafts/${draftId}`);
    return { success: true };
  } catch (err) {
    console.error("[issuectl] updateDraftAction failed", err);
    return { success: false, error: "Failed to update draft" };
  }
}

export async function assignDraftAction(
  draftId: string,
  repoId: number,
): Promise<
  | { success: true; issueNumber: number; issueUrl: string }
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

  try {
    const db = getDb();
    const octokit = await getOctokit();
    const result = await assignDraftToRepo(db, octokit, draftId, repoId);
    revalidatePath("/");
    return {
      success: true,
      issueNumber: result.issueNumber,
      issueUrl: result.issueUrl,
    };
  } catch (err) {
    console.error(
      "[issuectl] assignDraftAction failed",
      { draftId, repoId },
      err,
    );
    return { success: false, error: "Failed to assign draft to repo" };
  }
}
