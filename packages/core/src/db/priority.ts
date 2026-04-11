import type Database from "better-sqlite3";
import type { Priority, IssuePriority } from "../types.js";

type IssuePriorityRow = {
  repo_id: number;
  issue_number: number;
  priority: Priority;
  updated_at: number;
};

function rowToIssuePriority(row: IssuePriorityRow): IssuePriority {
  return {
    repoId: row.repo_id,
    issueNumber: row.issue_number,
    priority: row.priority,
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
    .get(repoId, issueNumber) as { priority: Priority } | undefined;
  return row?.priority ?? "normal";
}
