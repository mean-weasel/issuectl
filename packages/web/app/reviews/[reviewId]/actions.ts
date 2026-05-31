"use server";

import { revalidatePath } from "next/cache";
import { requestPrReviewRun, type ReviewActionMode } from "@/lib/review-actions";

export async function retryPrReviewAction(formData: FormData): Promise<void> {
  return requestReviewRun(formData, "retry");
}

export async function manualFullRerunPrReviewAction(formData: FormData): Promise<void> {
  return requestReviewRun(formData, "full");
}

async function requestReviewRun(
  formData: FormData,
  mode: ReviewActionMode,
): Promise<void> {
  const reviewId = Number(formData.get("reviewId"));
  const result = requestPrReviewRun(reviewId, mode);
  if (!result.ok) return;

  revalidatePath(`/reviews/${result.reviewId}`);
  revalidatePath("/sessions");
}
