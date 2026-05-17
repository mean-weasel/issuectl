import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { notifyMergedPullRequest } from "@/lib/push/notifications";
import {
  clearCacheKey,
  formatErrorForUser,
  getDb,
  getRepo,
  mergePull,
  withAuthRetry,
  type MergeMethod,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

const VALID_MERGE_METHODS: readonly MergeMethod[] = ["merge", "squash", "rebase"];

type MergeBody = {
  mergeMethod?: MergeMethod;
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

  let body: MergeBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mergeMethod = body.mergeMethod ?? "merge";
  if (!VALID_MERGE_METHODS.includes(mergeMethod)) {
    return NextResponse.json({ error: "Invalid merge method" }, { status: 400 });
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const result = await withAuthRetry((octokit) =>
      mergePull(octokit, owner, repo, pullNumber, mergeMethod),
    );
    if (!result.merged) {
      return NextResponse.json(
        { success: false, error: result.message || "Pull request was not merged" },
        { status: 409 },
      );
    }
    clearPullCaches(db, owner, repo, pullNumber);
    notifyMergedPullRequest({ owner, repo, pullNumber, sha: result.sha });
    return NextResponse.json({ success: result.merged, sha: result.sha, message: result.message });
  } catch (err) {
    log.error({ err, msg: "api_pull_merge_failed", owner, repo, pullNumber });
    return NextResponse.json({ success: false, error: formatErrorForUser(err) }, { status: 500 });
  }
}

function clearPullCaches(db: Parameters<typeof clearCacheKey>[0], owner: string, repo: string, pullNumber: number): void {
  clearCacheKey(db, `pull-detail:${owner}/${repo}#${pullNumber}`);
  clearCacheKey(db, `pulls:${owner}/${repo}`);
  clearCacheKey(db, `pulls-open:${owner}/${repo}`);
  clearCacheKey(db, `pulls-with-checks:${owner}/${repo}`);
}
