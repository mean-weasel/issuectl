import {
  getDb,
  getPrReviewById,
  getRepoById,
  listPrReviewsForPull,
  mergeWebhookIntent,
  recordDiagnosticEventSafely,
} from "@issuectl/core";
import { buildReviewActionRequest } from "@/lib/review-detail-data";

export type ReviewActionMode = "retry" | "full";

export type RequestReviewActionResult =
  | {
      ok: true;
      reviewId: number;
      intentId: number;
      mode: ReviewActionMode;
      message: string;
    }
  | {
      ok: false;
      status: 400 | 404 | 409;
      error: string;
    };

export function requestPrReviewRun(reviewId: number, mode: ReviewActionMode): RequestReviewActionResult {
  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    return { ok: false, status: 400, error: "Invalid review id" };
  }

  const db = getDb();
  const review = getPrReviewById(db, reviewId);
  if (!review) return { ok: false, status: 404, error: "Review not found" };
  const repo = getRepoById(db, review.repoId);
  if (!repo) return { ok: false, status: 404, error: "Repository not found" };

  const activeReview = listPrReviewsForPull(db, review.repoId, review.prNumber, 24)
    .find((item) => ACTIVE_REVIEW_STATUSES.has(item.status));
  if (activeReview) {
    return {
      ok: false,
      status: 409,
      error: `Run #${activeReview.id} is still ${labelize(activeReview.status)}.`,
    };
  }

  const request = buildReviewActionRequest({ review, repo, mode, now: Date.now() });
  const intentId = mergeWebhookIntent(db, request.intent);
  recordDiagnosticEventSafely(db, {
    level: "info",
    event: request.diagnosticEvent,
    source: "review-detail",
    owner: repo.owner,
    repo: repo.name,
    targetType: "pr",
    targetNumber: review.prNumber,
    deploymentId: review.deploymentId ?? undefined,
    message: request.diagnosticMessage,
    data: {
      reviewId: review.id,
      intentId,
      reviewMode: request.intent.reviewMode,
      desiredHeadSha: request.intent.desiredHeadSha,
    },
  });

  return {
    ok: true,
    reviewId: review.id,
    intentId,
    mode,
    message: request.diagnosticMessage,
  };
}

function labelize(value: string): string {
  return value.replaceAll("_", " ");
}

const ACTIVE_REVIEW_STATUSES = new Set(["reserved", "launching", "in_progress"]);
