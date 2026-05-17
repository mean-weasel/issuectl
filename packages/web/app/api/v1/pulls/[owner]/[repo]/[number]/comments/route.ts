import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  clearCacheKey,
  createPullComment,
  formatErrorForUser,
  getDb,
  getRepo,
  withAuthRetry,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

const MAX_COMMENT_BODY = 65_536;

type CommentBody = {
  body: string;
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

  let body: CommentBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }
  if (body.body.length > MAX_COMMENT_BODY) {
    return NextResponse.json({ error: `Comment must be ${MAX_COMMENT_BODY} characters or fewer` }, { status: 400 });
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const comment = await withAuthRetry((octokit) =>
      createPullComment(octokit, owner, repo, pullNumber, body.body),
    );
    clearPullCaches(db, owner, repo, pullNumber);
    return NextResponse.json({ success: true, commentId: comment.id });
  } catch (err) {
    log.error({ err, msg: "api_pull_comment_failed", owner, repo, pullNumber });
    return NextResponse.json({ success: false, error: formatErrorForUser(err) }, { status: 500 });
  }
}

function clearPullCaches(db: Parameters<typeof clearCacheKey>[0], owner: string, repo: string, pullNumber: number): void {
  clearCacheKey(db, `pull-detail:${owner}/${repo}#${pullNumber}`);
  clearCacheKey(db, `pulls:${owner}/${repo}`);
  clearCacheKey(db, `pulls-open:${owner}/${repo}`);
  clearCacheKey(db, `pulls-with-checks:${owner}/${repo}`);
}
