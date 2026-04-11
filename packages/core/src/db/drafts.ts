import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Draft, DraftInput, Priority } from "../types.js";

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
