import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  clearCacheKey,
  withAuthRetry,
  mergePull,
  formatErrorForUser,
  type MergeMethod,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

const VALID_MERGE_METHODS: MergeMethod[] = ["merge", "squash", "rebase"];

type MergeBody = {
  mergeMethod: MergeMethod;
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

  let body: MergeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_MERGE_METHODS.includes(body.mergeMethod)) {
    return NextResponse.json({ error: "Invalid merge method" }, { status: 400 });
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const result = await withAuthRetry((octokit) =>
      mergePull(octokit, owner, repo, pullNumber, body.mergeMethod),
    );

    if (!result.merged) {
      return NextResponse.json(
        { success: false, error: result.message || "Merge did not complete" },
        { status: 409 },
      );
    }

    clearCacheKey(db, `pull-detail:${owner}/${repo}#${pullNumber}`);
    clearCacheKey(db, `pulls-open:${owner}/${repo}`);

    return NextResponse.json({ success: true, sha: result.sha });
  } catch (err) {
    log.error({ err, msg: "api_merge_pull_failed", owner, repo, pullNumber });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
