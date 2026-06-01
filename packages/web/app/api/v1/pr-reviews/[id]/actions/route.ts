import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { requestPrReviewRun, type ReviewActionMode } from "@/lib/review-actions";
import { formatErrorForUser } from "@issuectl/core";

export const dynamic = "force-dynamic";

type Body = {
  mode?: unknown;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { id } = await params;
  const reviewId = parseReviewId(id);
  if (reviewId === null) {
    return NextResponse.json({ error: "Invalid review id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = await request.json() as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = parseMode(body.mode);
  if (!mode) {
    return NextResponse.json({ error: "Invalid review action mode" }, { status: 400 });
  }

  try {
    const result = requestPrReviewRun(reviewId, mode);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      reviewId: result.reviewId,
      intentId: result.intentId,
      mode: result.mode,
      message: result.message,
    });
  } catch (err) {
    log.error({ err, msg: "api_pr_review_action_failed", reviewId, mode });
    return NextResponse.json({ error: formatErrorForUser(err) }, { status: 500 });
  }
}

function parseReviewId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseMode(value: unknown): ReviewActionMode | null {
  return value === "retry" || value === "full" ? value : null;
}
