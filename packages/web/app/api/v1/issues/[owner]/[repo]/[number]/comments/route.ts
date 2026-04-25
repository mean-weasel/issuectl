import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  withAuthRetry,
  addComment,
  formatErrorForUser,
} from "@issuectl/core";
import { MAX_COMMENT_BODY } from "@/lib/constants";

export const dynamic = "force-dynamic";

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
  const issueNumber = parseInt(numStr, 10);
  if (Number.isNaN(issueNumber) || issueNumber <= 0) {
    return NextResponse.json({ error: "Invalid issue number" }, { status: 400 });
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
    return NextResponse.json(
      { error: `Comment must be ${MAX_COMMENT_BODY} characters or fewer` },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const comment = await withAuthRetry((octokit) =>
      addComment(db, octokit, owner, repo, issueNumber, body.body),
    );

    log.info({ msg: "api_issue_comment_added", owner, repo, issueNumber, commentId: comment.id });
    return NextResponse.json({ success: true, commentId: comment.id });
  } catch (err) {
    log.error({ err, msg: "api_issue_comment_failed", owner, repo, issueNumber });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
