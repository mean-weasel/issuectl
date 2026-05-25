"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  getPrReviewById,
  getRepoById,
  mergeWebhookIntent,
  recordDiagnosticEventSafely,
} from "@issuectl/core";
import { buildReviewActionRequest } from "@/lib/review-detail-data";

export async function retryPrReviewAction(formData: FormData): Promise<void> {
  return requestReviewRun(formData, "retry");
}

export async function manualFullRerunPrReviewAction(formData: FormData): Promise<void> {
  return requestReviewRun(formData, "full");
}

async function requestReviewRun(
  formData: FormData,
  mode: "retry" | "full",
): Promise<void> {
  const reviewId = Number(formData.get("reviewId"));
  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    return;
  }

  const db = getDb();
  const review = getPrReviewById(db, reviewId);
  if (!review) return;
  const repo = getRepoById(db, review.repoId);
  if (!repo) return;

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

  revalidatePath(`/reviews/${review.id}`);
  revalidatePath("/sessions");
}
