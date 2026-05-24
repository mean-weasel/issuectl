import type Database from "better-sqlite3";
import { withAuthRetry } from "@issuectl/core";
import type { Repo, WebhookIntent } from "@issuectl/core";
import type { PrReviewRecord, PullState, PullWorkerDeps } from "./webhook-pr-intent";

type Plan =
  | { action: "launch"; review: PrReviewRecord }
  | { action: "skip"; event: string; reason: string };

export async function planPrReview(
  db: Database.Database,
  repo: Repo,
  intent: WebhookIntent,
  pull: PullState,
  now: number,
  deps: PullWorkerDeps,
  triggeredBy: "webhook" | "comment_command" | "manual" = "webhook",
): Promise<Plan> {
  const active = getActivePrReview(db, repo.id, intent.targetNumber);
  if (active) return planForActiveReview(db, active, pull);

  const completed = getLatestCompletedPrReview(db, repo.id, intent.targetNumber);
  if (completed?.reviewedToSha === pull.headSha) {
    return { action: "skip", event: "webhook.pr_already_reviewed", reason: "PR head was already reviewed." };
  }
  let reviewedFromSha: string | null = null;
  if (completed) {
    const ancestor = await (deps.isAncestor ?? defaultIsAncestor)(repo, completed.reviewedToSha, pull.headSha);
    if (ancestor) reviewedFromSha = completed.completedHeadSha ?? completed.reviewedToSha;
    else supersedePrReview(db, completed.id, now, "force_push");
  }

  return {
    action: "launch",
    review: reservePrReview(db, repo.id, intent.targetNumber, pull, now, triggeredBy, reviewedFromSha),
  };
}

function planForActiveReview(db: Database.Database, active: PrReviewRecord, pull: PullState): Plan {
  if (active.reviewedToSha === pull.headSha) {
    return { action: "skip", event: "webhook.skipped_locked", reason: "PR already has an active review." };
  }
  const stored = coalesceDesiredHead(db, active.id, pull);
  return {
    action: "skip",
    event: stored ? "webhook.pr_coalesced" : "webhook.pr_followup_capped",
    reason: stored ? "Coalesced desired PR head into active review." : "Follow-up generation is already capped.",
  };
}

async function defaultIsAncestor(repo: Repo, baseSha: string, headSha: string): Promise<boolean> {
  return withAuthRetry(async (octokit) => {
    const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
      owner: repo.owner,
      repo: repo.name,
      basehead: `${baseSha}...${headSha}`,
    });
    return data.status === "ahead" || data.status === "identical";
  });
}

function reservePrReview(db: Database.Database, repoId: number, prNumber: number, pull: PullState, now: number, triggeredBy: "webhook" | "comment_command" | "manual", reviewedFromSha: string | null): PrReviewRecord {
  const result = db.prepare(
    `INSERT INTO pr_reviews (
      repo_id, pr_number, started_head_sha, review_base_sha, reviewed_from_sha,
      reviewed_to_sha, head_repo_full_name, head_ref, status, triggered_by, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?)`,
  ).run(repoId, prNumber, pull.headSha, pull.baseSha, reviewedFromSha, pull.headSha, pull.headRepoFullName, pull.headRef, triggeredBy, now);
  const row = db.prepare(
    `SELECT id, repo_id, pr_number, deployment_id, status, reviewed_from_sha,
            reviewed_to_sha, completed_head_sha, result_json
     FROM pr_reviews WHERE id = ?`,
  ).get(Number(result.lastInsertRowid)) as PrReviewRow | undefined;
  if (!row) throw new Error("Failed to read PR review reservation");
  return rowToPrReview(row);
}

function getActivePrReview(db: Database.Database, repoId: number, prNumber: number): PrReviewRecord | undefined {
  const active = db.prepare(
    `SELECT id, repo_id, pr_number, deployment_id, status, reviewed_from_sha,
            reviewed_to_sha, completed_head_sha, result_json
     FROM pr_reviews
     WHERE repo_id = ? AND pr_number = ?
       AND status IN ('reserved', 'launching', 'in_progress')
     ORDER BY started_at DESC, id DESC LIMIT 1`,
  ).get(repoId, prNumber) as PrReviewRow | undefined;
  return active ? rowToPrReview(active) : undefined;
}

function getLatestCompletedPrReview(db: Database.Database, repoId: number, prNumber: number): PrReviewRecord | undefined {
  const row = db.prepare(
    `SELECT id, repo_id, pr_number, deployment_id, status, reviewed_from_sha,
            reviewed_to_sha, completed_head_sha, result_json
     FROM pr_reviews
     WHERE repo_id = ? AND pr_number = ? AND status = 'completed'
     ORDER BY completed_at DESC, id DESC LIMIT 1`,
  ).get(repoId, prNumber) as PrReviewRow | undefined;
  return row ? rowToPrReview(row) : undefined;
}

type PrReviewRow = {
  id: number; repo_id: number; pr_number: number; deployment_id: number | null;
  status: string; reviewed_from_sha: string | null; reviewed_to_sha: string;
  completed_head_sha: string | null; result_json: string | null;
};

function rowToPrReview(row: PrReviewRow): PrReviewRecord {
  return {
    id: row.id, repoId: row.repo_id, prNumber: row.pr_number, deploymentId: row.deployment_id,
    status: row.status, reviewedFromSha: row.reviewed_from_sha, reviewedToSha: row.reviewed_to_sha,
    completedHeadSha: row.completed_head_sha, resultJson: row.result_json,
  };
}

function coalesceDesiredHead(db: Database.Database, reviewId: number, pull: PullState): boolean {
  const review = db.prepare("SELECT result_json FROM pr_reviews WHERE id = ?").get(reviewId) as { result_json: string | null } | undefined;
  const current = parseResultJson(review?.result_json ?? null);
  if (typeof current.desiredHeadSha === "string" || current.followUpGeneration === 1) return false;
  db.prepare("UPDATE pr_reviews SET result_json = ? WHERE id = ?").run(JSON.stringify({
    ...current, desiredHeadSha: pull.headSha, desiredBaseSha: pull.baseSha,
    desiredHeadRef: pull.headRef, followUpGeneration: 1,
  }), reviewId);
  return true;
}

function supersedePrReview(db: Database.Database, reviewId: number, now: number, reason: string): void {
  db.prepare("UPDATE pr_reviews SET status = 'superseded', completed_at = ?, result_json = ? WHERE id = ?")
    .run(now, JSON.stringify({ reason }), reviewId);
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
