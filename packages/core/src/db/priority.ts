import type Database from "better-sqlite3";
import type { Priority, IssuePriority } from "../types.js";

const PRIORITIES: readonly Priority[] = ["low", "normal", "high"];

// Narrowing helper for values coming out of SQLite. The CHECK constraint
// on the drafts and issue_metadata tables prevents invalid writes, so this
// is defense-in-depth for row reads that bypass the type system via casts.
export function parsePriority(value: unknown): Priority {
  if (
    typeof value === "string" &&
    (PRIORITIES as readonly string[]).includes(value)
  ) {
    return value as Priority;
  }
  throw new Error(
    `Invalid priority value: ${JSON.stringify(value)}. Expected one of ${PRIORITIES.join(
      ", ",
    )}.`,
  );
}

type IssuePriorityRow = {
  repo_id: number;
  issue_number: number;
  priority: string;
  updated_at: number;
};

function rowToIssuePriority(row: IssuePriorityRow): IssuePriority {
  return {
    repoId: row.repo_id,
    issueNumber: row.issue_number,
    priority: parsePriority(row.priority),
    updatedAt: row.updated_at,
  };
}

export function setPriority(
  db: Database.Database,
  repoId: number,
  issueNumber: number,
  priority: Priority,
): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO issue_metadata (repo_id, issue_number, priority, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (repo_id, issue_number)
     DO UPDATE SET priority = excluded.priority, updated_at = excluded.updated_at`,
  ).run(repoId, issueNumber, priority, now);
}

export function getPriority(
  db: Database.Database,
  repoId: number,
  issueNumber: number,
): Priority {
  const row = db
    .prepare(
      `SELECT priority FROM issue_metadata
       WHERE repo_id = ? AND issue_number = ?`,
    )
    .get(repoId, issueNumber) as { priority: string } | undefined;
  return row ? parsePriority(row.priority) : "normal";
}

export function deletePriority(
  db: Database.Database,
  repoId: number,
  issueNumber: number,
): boolean {
  const info = db
    .prepare(
      `DELETE FROM issue_metadata WHERE repo_id = ? AND issue_number = ?`,
    )
    .run(repoId, issueNumber);
  return info.changes > 0;
}

export function listPrioritiesForRepo(
  db: Database.Database,
  repoId: number,
): IssuePriority[] {
  const rows = db
    .prepare(
      `SELECT repo_id, issue_number, priority, updated_at
       FROM issue_metadata
       WHERE repo_id = ?`,
    )
    .all(repoId) as IssuePriorityRow[];
  return rows.map(rowToIssuePriority);
}
