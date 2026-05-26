import type Database from "better-sqlite3";
import type { DeploymentTriggeredBy, PrReview, PrReviewStatus } from "../types.js";

type PrReviewRow = {
  id: number; repo_id: number; pr_number: number; deployment_id: number | null;
  started_head_sha: string; completed_head_sha: string | null;
  review_base_sha: string; reviewed_from_sha: string | null; reviewed_to_sha: string;
  head_repo_full_name: string; head_ref: string; status: string; triggered_by: string;
  result_json: string | null; started_at: number; completed_at: number | null;
};

function rowToPrReview(row: PrReviewRow): PrReview {
  return {
    id: row.id, repoId: row.repo_id, prNumber: row.pr_number, deploymentId: row.deployment_id,
    startedHeadSha: row.started_head_sha, completedHeadSha: row.completed_head_sha,
    reviewBaseSha: row.review_base_sha, reviewedFromSha: row.reviewed_from_sha,
    reviewedToSha: row.reviewed_to_sha, headRepoFullName: row.head_repo_full_name,
    headRef: row.head_ref, status: row.status as PrReviewStatus,
    triggeredBy: row.triggered_by as DeploymentTriggeredBy, resultJson: row.result_json,
    startedAt: row.started_at, completedAt: row.completed_at,
  };
}

export function reservePrReview(db: Database.Database, input: {
  repoId: number; prNumber: number; deploymentId?: number | null;
  startedHeadSha: string; reviewBaseSha: string; reviewedFromSha?: string | null;
  reviewedToSha: string; headRepoFullName: string; headRef: string;
  triggeredBy: DeploymentTriggeredBy; startedAt: number;
}): PrReview {
  const result = db.prepare(
    `INSERT INTO pr_reviews (
      repo_id, pr_number, deployment_id, started_head_sha, review_base_sha,
      reviewed_from_sha, reviewed_to_sha, head_repo_full_name, head_ref,
      status, triggered_by, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?)`,
  ).run(
    input.repoId, input.prNumber, input.deploymentId ?? null, input.startedHeadSha,
    input.reviewBaseSha, input.reviewedFromSha ?? null, input.reviewedToSha,
    input.headRepoFullName, input.headRef, input.triggeredBy, input.startedAt,
  );
  const review = getPrReviewById(db, Number(result.lastInsertRowid));
  if (!review) throw new Error("Failed to read back PR review after insert");
  return review;
}

export function getPrReviewById(db: Database.Database, id: number): PrReview | undefined {
  const row = db.prepare("SELECT * FROM pr_reviews WHERE id = ?").get(id) as PrReviewRow | undefined;
  return row ? rowToPrReview(row) : undefined;
}

export function getActivePrReview(
  db: Database.Database,
  repoId: number,
  prNumber: number,
): PrReview | undefined {
  const row = db.prepare(
    `SELECT * FROM pr_reviews
     WHERE repo_id = ? AND pr_number = ?
       AND status IN ('reserved', 'launching', 'in_progress')
     ORDER BY started_at DESC, id DESC LIMIT 1`,
  ).get(repoId, prNumber) as PrReviewRow | undefined;
  return row ? rowToPrReview(row) : undefined;
}

export function getActivePrReviewForDeployment(
  db: Database.Database,
  deploymentId: number,
): PrReview | undefined {
  const row = db.prepare(
    `SELECT * FROM pr_reviews
     WHERE deployment_id = ?
       AND status IN ('reserved', 'launching', 'in_progress')
     ORDER BY started_at DESC, id DESC
     LIMIT 1`,
  ).get(deploymentId) as PrReviewRow | undefined;
  return row ? rowToPrReview(row) : undefined;
}

export function getLatestCompletedPrReview(
  db: Database.Database,
  repoId: number,
  prNumber: number,
): PrReview | undefined {
  const row = db.prepare(
    `SELECT * FROM pr_reviews
     WHERE repo_id = ? AND pr_number = ? AND status = 'completed'
     ORDER BY completed_at DESC, id DESC LIMIT 1`,
  ).get(repoId, prNumber) as PrReviewRow | undefined;
  return row ? rowToPrReview(row) : undefined;
}

export function listPrReviewsForRepo(
  db: Database.Database,
  repoId: number,
  limit = 8,
): PrReview[] {
  const boundedLimit = Math.max(1, Math.floor(limit));
  const rows = db.prepare(
    `SELECT * FROM pr_reviews
     WHERE repo_id = ?
     ORDER BY started_at DESC, id DESC
     LIMIT ?`,
  ).all(repoId, boundedLimit) as PrReviewRow[];
  return rows.map(rowToPrReview);
}

export function listPrReviewsForPull(
  db: Database.Database,
  repoId: number,
  prNumber: number,
  limit = 24,
): PrReview[] {
  const boundedLimit = Math.max(1, Math.floor(limit));
  const rows = db.prepare(
    `SELECT * FROM pr_reviews
     WHERE repo_id = ? AND pr_number = ?
     ORDER BY started_at DESC, id DESC
     LIMIT ?`,
  ).all(repoId, prNumber, boundedLimit) as PrReviewRow[];
  return rows.map(rowToPrReview);
}

export function completePrReview(
  db: Database.Database,
  reviewId: number,
  input: { completedHeadSha: string; completedAt: number; result?: unknown },
): void {
  db.prepare(
    `UPDATE pr_reviews
     SET status = 'completed',
         completed_head_sha = ?,
         completed_at = ?,
         result_json = ?
     WHERE id = ?`,
  ).run(input.completedHeadSha, input.completedAt, JSON.stringify(input.result ?? {}), reviewId);
}

export function supersedePrReview(
  db: Database.Database,
  reviewId: number,
  completedAt: number,
  reason: string,
): void {
  db.prepare(
    `UPDATE pr_reviews
     SET status = 'superseded',
         completed_at = ?,
         result_json = ?
     WHERE id = ?`,
  ).run(completedAt, JSON.stringify({ reason }), reviewId);
}

export function markActivePrReviewForDeploymentTerminal(
  db: Database.Database,
  deploymentId: number,
  input: { completedAt: number; status: Extract<PrReviewStatus, "failed" | "superseded">; reason: string },
): PrReview | undefined {
  const review = getActivePrReviewForDeployment(db, deploymentId);
  if (!review) return undefined;

  db.prepare(
    `UPDATE pr_reviews
     SET status = ?,
         completed_at = ?,
         result_json = ?
     WHERE id = ?`,
  ).run(input.status, input.completedAt, JSON.stringify({ reason: input.reason }), review.id);
  return getPrReviewById(db, review.id);
}

export function markPrReviewDeploymentStarted(
  db: Database.Database,
  reviewId: number,
  deploymentId: number,
): PrReview | undefined {
  const result = db.prepare(
    `UPDATE pr_reviews
     SET status = 'in_progress',
         deployment_id = ?
     WHERE id = ?
       AND status IN ('reserved', 'launching')
       AND EXISTS (
         SELECT 1
         FROM deployments d
         WHERE d.id = ?
           AND d.repo_id = pr_reviews.repo_id
           AND d.target_type = 'pr'
           AND d.target_number = pr_reviews.pr_number
           AND d.state = 'active'
           AND d.ended_at IS NULL
       )`,
  ).run(deploymentId, reviewId, deploymentId);
  return result.changes > 0 ? getPrReviewById(db, reviewId) : undefined;
}

export function recoverOrphanedActivePrReviews(
  db: Database.Database,
  completedAt: number,
): PrReview[] {
  const rows = db.prepare(
    `SELECT r.*
     FROM pr_reviews r
     LEFT JOIN deployments d ON d.id = r.deployment_id
     WHERE r.status IN ('reserved', 'launching', 'in_progress')
       AND (
         r.deployment_id IS NULL
         OR d.id IS NULL
         OR d.state != 'active'
         OR d.ended_at IS NOT NULL
       )
     ORDER BY r.started_at ASC, r.id ASC`,
  ).all() as PrReviewRow[];
  const recovered: PrReview[] = [];
  const update = db.prepare(
    `UPDATE pr_reviews
     SET status = ?,
         completed_at = ?,
         result_json = ?
     WHERE id = ?
       AND status IN ('reserved', 'launching', 'in_progress')`,
  );
  for (const row of rows) {
    const status: Extract<PrReviewStatus, "failed" | "superseded"> = row.deployment_id === null ? "failed" : "superseded";
    const reason = row.deployment_id === null ? "orphaned_before_deployment" : "orphaned_deployment_terminal";
    update.run(status, completedAt, JSON.stringify({ reason }), row.id);
    const review = getPrReviewById(db, row.id);
    if (review) recovered.push(review);
  }
  return recovered;
}

export function coalescePrReviewDesiredHead(
  db: Database.Database,
  reviewId: number,
  input: { desiredHeadSha: string; desiredBaseSha: string; desiredHeadRef: string },
): boolean {
  const review = getPrReviewById(db, reviewId);
  if (!review) return false;
  const current = parseResultJson(review.resultJson);
  if (typeof current.desiredHeadSha === "string" || current.followUpGeneration === 1) {
    return false;
  }
  db.prepare("UPDATE pr_reviews SET result_json = ? WHERE id = ?").run(
    JSON.stringify({
      ...current,
      desiredHeadSha: input.desiredHeadSha,
      desiredBaseSha: input.desiredBaseSha,
      desiredHeadRef: input.desiredHeadRef,
      followUpGeneration: 1,
    }),
    reviewId,
  );
  return true;
}

function parseResultJson(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
