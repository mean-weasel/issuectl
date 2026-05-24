import type Database from "better-sqlite3";

export function runPrReviewsMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pr_reviews (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id             INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      pr_number           INTEGER NOT NULL,
      deployment_id       INTEGER REFERENCES deployments(id),
      started_head_sha    TEXT NOT NULL,
      completed_head_sha  TEXT,
      review_base_sha     TEXT NOT NULL,
      reviewed_from_sha   TEXT,
      reviewed_to_sha     TEXT NOT NULL,
      head_repo_full_name TEXT NOT NULL,
      head_ref            TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'reserved'
                          CHECK (status IN ('reserved', 'launching', 'in_progress', 'completed', 'failed', 'superseded')),
      triggered_by        TEXT NOT NULL CHECK (triggered_by IN ('webhook', 'comment_command', 'manual')),
      result_json         TEXT,
      started_at          INTEGER NOT NULL,
      completed_at        INTEGER,
      UNIQUE(repo_id, pr_number, reviewed_to_sha)
    );

    CREATE INDEX IF NOT EXISTS idx_pr_reviews_active
      ON pr_reviews(repo_id, pr_number)
      WHERE status IN ('reserved', 'launching', 'in_progress');
  `);
}
