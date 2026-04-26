import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  getIssueDetail,
  updateIssue,
  clearCacheKey,
  withAuthRetry,
  formatErrorForUser,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

const MAX_TITLE = 256;
const MAX_BODY = 65536;

export async function GET(
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

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";
    const result = await withAuthRetry((octokit) =>
      getIssueDetail(db, octokit, owner, repo, issueNumber, { forceRefresh }),
    );
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err, msg: "api_issue_detail_failed", owner, repo, issueNumber });
    return NextResponse.json({ error: formatErrorForUser(err) }, { status: 500 });
  }
}

type PatchBody = {
  title?: string;
  body?: string;
};

export async function PATCH(
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

  let body: PatchBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) {
    return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
  }
  if (body.title !== undefined && body.title.length > MAX_TITLE) {
    return NextResponse.json(
      { error: `Title must be ${MAX_TITLE} characters or fewer` },
      { status: 400 },
    );
  }
  if (body.body !== undefined && typeof body.body !== "string") {
    return NextResponse.json({ error: "Body must be a string" }, { status: 400 });
  }
  if (body.body !== undefined && body.body.length > MAX_BODY) {
    return NextResponse.json(
      { error: `Body must be ${MAX_BODY} characters or fewer` },
      { status: 400 },
    );
  }

  if (body.title === undefined && body.body === undefined) {
    return NextResponse.json({ error: "At least one of title or body is required" }, { status: 400 });
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    // Note: body.trim() may produce an empty string — this is intentional.
    // GitHub allows clearing an issue body to empty.
    await withAuthRetry((octokit) =>
      updateIssue(octokit, owner, repo, issueNumber, {
        title: body.title?.trim(),
        body: body.body !== undefined ? body.body.trim() : undefined,
      }),
    );

    clearCacheKey(db, `issue-detail:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issue-header:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issue-content:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issues:${owner}/${repo}`);

    log.info({ msg: "api_issue_updated", owner, repo, issueNumber });
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_issue_update_failed", owner, repo, issueNumber });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
