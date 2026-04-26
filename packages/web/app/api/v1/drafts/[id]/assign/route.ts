import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  withAuthRetry,
  assignDraftToRepo,
  DraftPartialCommitError,
  formatErrorForUser,
  getRepoById,
  clearCacheKey,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AssignBody = {
  repoId: number;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });
  }

  let body: AssignBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.repoId !== "number" || !Number.isInteger(body.repoId) || body.repoId <= 0) {
    return NextResponse.json({ error: "repoId must be a positive integer" }, { status: 400 });
  }

  try {
    const db = getDb();
    const result = await withAuthRetry((octokit) =>
      assignDraftToRepo(db, octokit, id, body.repoId),
    );

    // Clear issue cache so next fetch includes the new issue
    try {
      const repo = getRepoById(db, body.repoId);
      if (repo) {
        clearCacheKey(db, `issues:${repo.owner}/${repo.name}`);
      }
    } catch (cacheErr) {
      log.warn({ err: cacheErr, msg: "api_cache_clear_failed", repoId: body.repoId });
    }

    log.info({ msg: "api_draft_assigned", draftId: id, repoId: body.repoId, issueNumber: result.issueNumber });
    return NextResponse.json({
      success: true,
      issueNumber: result.issueNumber,
      issueUrl: result.issueUrl,
    });
  } catch (err) {
    if (err instanceof DraftPartialCommitError) {
      log.warn({ err, msg: "api_draft_assign_partial", draftId: id, issueNumber: err.issueNumber });
      return NextResponse.json({
        success: true,
        issueNumber: err.issueNumber,
        issueUrl: err.issueUrl,
        cleanupWarning: err.message,
      });
    }
    log.error({ err, msg: "api_draft_assign_failed", draftId: id });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
