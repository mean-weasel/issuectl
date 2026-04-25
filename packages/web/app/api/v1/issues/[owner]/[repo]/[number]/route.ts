import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getDb, getRepo, getIssueDetail, withAuthRetry } from "@issuectl/core";

export const dynamic = "force-dynamic";

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

  const db = getDb();
  if (!getRepo(db, owner, repo)) {
    return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
  }

  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";
    const result = await withAuthRetry((octokit) =>
      getIssueDetail(db, octokit, owner, repo, issueNumber, { forceRefresh }),
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[issuectl] GET /api/v1/issues/${owner}/${repo}/${issueNumber} failed:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
