import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  clearCacheKey,
  withAuthRetry,
  closeIssue,
  reopenIssue,
  addComment,
  formatErrorForUser,
} from "@issuectl/core";
import { MAX_COMMENT_BODY } from "@/lib/constants";

export const dynamic = "force-dynamic";

const VALID_STATES = ["open", "closed"] as const;
type IssueState = (typeof VALID_STATES)[number];

type StateBody = {
  state: IssueState;
  comment?: string;
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

  let body: StateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_STATES.includes(body.state as IssueState)) {
    return NextResponse.json({ error: "Invalid state — must be open or closed" }, { status: 400 });
  }

  if (body.comment !== undefined) {
    if (typeof body.comment !== "string" || !body.comment.trim()) {
      return NextResponse.json({ error: "Comment must be a non-empty string" }, { status: 400 });
    }
    if (body.comment.length > MAX_COMMENT_BODY) {
      return NextResponse.json(
        { error: `Comment must be ${MAX_COMMENT_BODY} characters or fewer` },
        { status: 400 },
      );
    }
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    // Post comment before changing state so the closing rationale appears
    // in the timeline first. If the comment fails, state is left unchanged.
    let commentPosted = false;
    if (body.comment?.trim()) {
      await withAuthRetry((octokit) =>
        addComment(db, octokit, owner, repo, issueNumber, body.comment!),
      );
      commentPosted = true;
    }

    try {
      if (body.state === "closed") {
        await withAuthRetry((octokit) => closeIssue(octokit, owner, repo, issueNumber));
      } else {
        await withAuthRetry((octokit) => reopenIssue(octokit, owner, repo, issueNumber));
      }
    } catch (stateErr) {
      // addComment clears its own comment/content caches; clear state caches here
      clearCacheKey(db, `issue-detail:${owner}/${repo}#${issueNumber}`);
      clearCacheKey(db, `issues:${owner}/${repo}`);
      log.error({ err: stateErr, msg: "api_issue_state_failed", owner, repo, issueNumber, state: body.state, commentPosted });
      return NextResponse.json(
        {
          success: false,
          commentPosted,
          error: commentPosted
            ? "Your comment was posted, but the issue state could not be changed."
            : formatErrorForUser(stateErr),
        },
        { status: 500 },
      );
    }

    clearCacheKey(db, `issue-detail:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issues:${owner}/${repo}`);

    log.info({ msg: "api_issue_state_changed", owner, repo, issueNumber, state: body.state });
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_issue_state_failed", owner, repo, issueNumber, state: body.state });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
