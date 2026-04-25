import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  clearCacheKey,
  withAuthRetry,
  createReview,
  formatErrorForUser,
  type ReviewEvent,
} from "@issuectl/core";
import { MAX_COMMENT_BODY } from "@/lib/constants";

export const dynamic = "force-dynamic";

const VALID_EVENTS: ReviewEvent[] = ["APPROVE", "REQUEST_CHANGES"];

type ReviewBody = {
  event: ReviewEvent;
  body?: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo, number: numStr } = await params;
  const pullNumber = parseInt(numStr, 10);
  if (Number.isNaN(pullNumber) || pullNumber <= 0) {
    return NextResponse.json({ error: "Invalid pull request number" }, { status: 400 });
  }

  let body: ReviewBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_EVENTS.includes(body.event)) {
    return NextResponse.json({ error: "Invalid review event" }, { status: 400 });
  }
  if (body.event === "REQUEST_CHANGES" && (!body.body || !body.body.trim())) {
    return NextResponse.json({ error: "Body is required when requesting changes" }, { status: 400 });
  }
  if (body.body && body.body.length > MAX_COMMENT_BODY) {
    return NextResponse.json(
      { error: `Review body must be ${MAX_COMMENT_BODY} characters or fewer` },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const review = await withAuthRetry((octokit) =>
      createReview(octokit, owner, repo, pullNumber, body.event, body.body),
    );

    clearCacheKey(db, `pull-detail:${owner}/${repo}#${pullNumber}`);

    return NextResponse.json({ success: true, reviewId: review.id });
  } catch (err) {
    log.error({ err, msg: "api_review_pull_failed", owner, repo, pullNumber, event: body.event });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
