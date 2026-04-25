import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getDb, getRepo, getPullDetail, withAuthRetry } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function GET(
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

  const db = getDb();
  if (!getRepo(db, owner, repo)) {
    return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
  }

  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";
    const result = await withAuthRetry((octokit) =>
      getPullDetail(db, octokit, owner, repo, pullNumber, { forceRefresh }),
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[issuectl] GET /api/v1/pulls/${owner}/${repo}/${pullNumber} failed:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
