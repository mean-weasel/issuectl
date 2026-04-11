"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  getOctokit,
  createDraft,
  assignDraftToRepo,
  type DraftInput,
} from "@issuectl/core";

export async function createDraftAction(
  input: DraftInput,
): Promise<{ id: string }> {
  const db = getDb();
  const draft = createDraft(db, input);
  revalidatePath("/");
  return { id: draft.id };
}

export async function assignDraftAction(
  draftId: string,
  repoId: number,
): Promise<{ issueNumber: number; issueUrl: string }> {
  const db = getDb();
  const octokit = await getOctokit();
  const result = await assignDraftToRepo(db, octokit, draftId, repoId);
  revalidatePath("/");
  return { issueNumber: result.issueNumber, issueUrl: result.issueUrl };
}
