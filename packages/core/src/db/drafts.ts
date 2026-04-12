import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import type { Draft, DraftInput } from "../types.js";
import { getRepoById } from "./repos.js";
import { parsePriority, setPriority } from "./priority.js";

type DraftRow = {
  id: string;
  title: string;
  body: string;
  priority: string;
  created_at: number;
  updated_at: number;
};

function rowToDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    priority: parsePriority(row.priority),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createDraft(db: Database.Database, input: DraftInput): Draft {
  if (input.title.trim().length === 0) {
    throw new Error("Draft title must not be empty or whitespace-only");
  }

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
  // Secondary sort by id ensures deterministic ordering when two drafts
  // share an updated_at (unix seconds has second precision, so two drafts
  // created in the same second would otherwise have undefined order).
  const rows = db
    .prepare(
      `SELECT id, title, body, priority, created_at, updated_at
       FROM drafts
       ORDER BY updated_at DESC, id DESC`,
    )
    .all() as DraftRow[];
  return rows.map(rowToDraft);
}

export function getDraft(
  db: Database.Database,
  id: string,
): Draft | undefined {
  const row = db
    .prepare(
      `SELECT id, title, body, priority, created_at, updated_at
       FROM drafts
       WHERE id = ?`,
    )
    .get(id) as DraftRow | undefined;
  return row ? rowToDraft(row) : undefined;
}

export type DraftUpdate = Partial<Pick<Draft, "title" | "body" | "priority">>;

export function updateDraft(
  db: Database.Database,
  id: string,
  update: DraftUpdate,
): Draft | undefined {
  const existing = getDraft(db, id);
  if (!existing) return undefined;

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

/**
 * Thrown when `assignDraftToRepo` successfully creates the GitHub issue but
 * the follow-up local DB commit (priority carryover + draft delete) fails.
 * The issue is already on GitHub, so the error carries enough context for
 * the UI to tell the user where their work ended up and let them recover.
 *
 * Callers (server actions) should catch this explicitly and surface both
 * the human message AND the `issueNumber` / `issueUrl` to the UI — a plain
 * catch that returns `{success: false, error: "Failed to …"}` loses the
 * information the user needs to find their issue.
 */
export class DraftPartialCommitError extends Error {
  readonly issueNumber: number;
  readonly issueUrl: string;
  readonly repoId: number;

  constructor(
    result: AssignDraftResult,
    cause: unknown,
  ) {
    super(
      `Issue #${result.issueNumber} was created on GitHub but the local draft cleanup failed. See ${result.issueUrl} — the draft can be deleted manually.`,
      { cause },
    );
    this.name = "DraftPartialCommitError";
    this.issueNumber = result.issueNumber;
    this.issueUrl = result.issueUrl;
    this.repoId = result.repoId;
  }
}

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

  const result: AssignDraftResult = {
    repoId,
    issueNumber: response.data.number,
    issueUrl: response.data.html_url,
  };

  // Run the two local writes (priority carryover + draft delete) in a
  // single DB transaction after the network call succeeds. If either
  // throws, both roll back and the draft stays intact locally — but the
  // GitHub issue already exists. Wrap the failure in a typed error that
  // carries the issue number/url so the UI can point the user at it.
  try {
    const localCommit = db.transaction(() => {
      if (draft.priority !== "normal") {
        setPriority(db, repoId, result.issueNumber, draft.priority);
      }
      deleteDraft(db, draftId);
    });
    localCommit();
  } catch (err) {
    throw new DraftPartialCommitError(result, err);
  }

  return result;
}
