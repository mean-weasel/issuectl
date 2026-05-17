import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { MAX_COMMENT_BODY } from "@/lib/constants";
import log from "@/lib/logger";
import {
  clearCacheKey,
  createReview,
  formatErrorForUser,
  getDb,
  getRepo,
  withAuthRetry,
  type ReviewEvent,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

const VALID_EVENTS: readonly ReviewEvent[] = ["APPROVE", "REQUEST_CHANGES", "COMMENT"];

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
  const pullNumber = Number.parseInt(numStr, 10);
  if (Number.isNaN(pullNumber) || pullNumber <= 0) {
    return NextResponse.json({ error: "Invalid pull request number" }, { status: 400 });
  }

  let body: ReviewBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_EVENTS.includes(body.event)) {
    return NextResponse.json({ error: "Invalid review event" }, { status: 400 });
  }
  if (body.body !== undefined && typeof body.body !== "string") {
    return NextResponse.json({ error: "Review body must be a string" }, { status: 400 });
  }
  if (body.body && body.body.length > MAX_COMMENT_BODY) {
    return NextResponse.json(
      { error: `Review body must be ${MAX_COMMENT_BODY} characters or fewer` },
      { status: 400 },
    );
  }
  if (body.event === "REQUEST_CHANGES" && !body.body?.trim()) {
    return NextResponse.json({ error: "Body is required when requesting changes" }, { status: 400 });
  }
  if (body.event === "COMMENT" && !body.body?.trim()) {
    return NextResponse.json({ error: "Body is required when commenting" }, { status: 400 });
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const review = await withAuthRetry((octokit) =>
      createReview(octokit, owner, repo, pullNumber, body.event, body.body),
    );
    clearPullCaches(db, owner, repo, pullNumber);
    return NextResponse.json({ success: true, reviewId: review.id });
  } catch (err) {
    log.error({ err, msg: "api_pull_review_failed", owner, repo, pullNumber });
    return NextResponse.json({ success: false, error: formatErrorForUser(err) }, { status: 500 });
  }
}

function clearPullCaches(db: Parameters<typeof clearCacheKey>[0], owner: string, repo: string, pullNumber: number): void {
  clearCacheKey(db, `pull-detail:${owner}/${repo}#${pullNumber}`);
  clearCacheKey(db, `pulls:${owner}/${repo}`);
  clearCacheKey(db, `pulls-open:${owner}/${repo}`);
  clearCacheKey(db, `pulls-with-checks:${owner}/${repo}`);
}
