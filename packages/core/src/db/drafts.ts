import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Draft, DraftInput, Priority } from "../types.js";
import type { Octokit } from "@octokit/rest";
import { getRepoById } from "./repos.js";
import { setPriority } from "./priority.js";

type DraftRow = {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  created_at: number;
  updated_at: number;
};

function rowToDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createDraft(db: Database.Database, input: DraftInput): Draft {
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const body = input.body ?? "";
  const priority = input.priority ?? "normal";

  db.prepare(
    `INSERT INTO drafts (id, title, body, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, input.title, body, priority, now, now);

  return {
    id,
    title: input.title,
    body,
    priority,
    createdAt: now,
    updatedAt: now,
  };
}

export function listDrafts(db: Database.Database): Draft[] {
  const rows = db
    .prepare(
      `SELECT id, title, body, priority, created_at, updated_at
       FROM drafts
       ORDER BY updated_at DESC`,
    )
    .all() as DraftRow[];
  return rows.map(rowToDraft);
}

export function getDraft(db: Database.Database, id: string): Draft | null {
  const row = db
    .prepare(
      `SELECT id, title, body, priority, created_at, updated_at
       FROM drafts
       WHERE id = ?`,
    )
    .get(id) as DraftRow | undefined;
  return row ? rowToDraft(row) : null;
}

export type DraftUpdate = Partial<Pick<Draft, "title" | "body" | "priority">>;

export function updateDraft(
  db: Database.Database,
  id: string,
  update: DraftUpdate,
): Draft | null {
  const existing = getDraft(db, id);
  if (!existing) return null;

  const next: Draft = {
    ...existing,
    ...update,
    updatedAt: Math.floor(Date.now() / 1000),
  };

  db.prepare(
    `UPDATE drafts
     SET title = ?, body = ?, priority = ?, updated_at = ?
     WHERE id = ?`,
  ).run(next.title, next.body, next.priority, next.updatedAt, id);

  return next;
}

export function deleteDraft(db: Database.Database, id: string): boolean {
  const info = db.prepare("DELETE FROM drafts WHERE id = ?").run(id);
  return info.changes > 0;
}

export type AssignDraftResult = {
  repoId: number;
  issueNumber: number;
  issueUrl: string;
};

export async function assignDraftToRepo(
  db: Database.Database,
  octokit: Octokit,
  draftId: string,
  repoId: number,
): Promise<AssignDraftResult> {
  const draft = getDraft(db, draftId);
  if (!draft) {
    throw new Error(`No draft with id '${draftId}'`);
  }

  const repo = getRepoById(db, repoId);
  if (!repo) {
    throw new Error(`No tracked repo with id ${repoId}`);
  }

  // Create the issue on GitHub first. If this throws, we leave the draft
  // in place so the user can retry — do not delete the draft until we know
  // the push succeeded.
  const response = await octokit.rest.issues.create({
    owner: repo.owner,
    repo: repo.name,
    title: draft.title,
    body: draft.body,
  });

  const issueNumber = response.data.number;
  const issueUrl = response.data.html_url;

  // Carry the local priority over to issue_metadata if it wasn't 'normal'.
  // Priority is local-only metadata — the GitHub issue itself has no concept
  // of it, so we key it under (repoId, issueNumber) on this side.
  if (draft.priority !== "normal") {
    setPriority(db, repoId, issueNumber, draft.priority);
  }

  // Finally, remove the local draft now that the GitHub issue exists.
  deleteDraft(db, draftId);

  return { repoId, issueNumber, issueUrl };
}
