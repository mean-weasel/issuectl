import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  clearCacheKey,
  withAuthRetry,
  reassignIssue,
  formatErrorForUser,
  type ReassignResult,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

type ReassignBody = {
  targetOwner: string;
  targetRepo: string;
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

  let body: ReassignBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.targetOwner || typeof body.targetOwner !== "string") {
    return NextResponse.json({ error: "targetOwner is required and must be a string" }, { status: 400 });
  }
  if (!body.targetRepo || typeof body.targetRepo !== "string") {
    return NextResponse.json({ error: "targetRepo is required and must be a string" }, { status: 400 });
  }

  try {
    const db = getDb();

    // Look up source repo by owner/name
    const sourceRepo = getRepo(db, owner, repo);
    if (!sourceRepo) {
      return NextResponse.json({ error: "Source repository not tracked" }, { status: 404 });
    }

    // Look up target repo by owner/name
    const targetRepo = getRepo(db, body.targetOwner, body.targetRepo);
    if (!targetRepo) {
      return NextResponse.json({ error: "Target repository not tracked" }, { status: 404 });
    }

    if (sourceRepo.id === targetRepo.id) {
      return NextResponse.json({ error: "Cannot re-assign to the same repo" }, { status: 400 });
    }

    const result: ReassignResult = await withAuthRetry((octokit) =>
      reassignIssue(db, octokit, sourceRepo.id, issueNumber, targetRepo.id),
    );

    // Caches are already invalidated inside reassignIssue, but clear
    // any remaining detail/header keys for the source issue.
    clearCacheKey(db, `issue-detail:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issue-header:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issue-content:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issues:${owner}/${repo}`);
    clearCacheKey(db, `issues:${body.targetOwner}/${body.targetRepo}`);

    log.info({
      msg: "api_issue_reassigned",
      owner,
      repo,
      issueNumber,
      targetOwner: result.newOwner,
      targetRepo: result.newRepo,
      newIssueNumber: result.newIssueNumber,
    });

    return NextResponse.json({
      success: true,
      newIssueNumber: result.newIssueNumber,
      newOwner: result.newOwner,
      newRepo: result.newRepo,
      ...(result.cleanupWarning ? { cleanupWarning: result.cleanupWarning } : {}),
    });
  } catch (err) {
    log.error({ err, msg: "api_issue_reassign_failed", owner, repo, issueNumber });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
