import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getDb, getRepo, getPulls, getPullsWithChecks, withAuthRetry } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo } = await params;

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";
    const includeChecks = request.nextUrl.searchParams.get("checks") !== "false";

    const result = includeChecks
      ? await withAuthRetry((octokit) =>
          getPullsWithChecks(db, octokit, owner, repo, { forceRefresh }),
        )
      : await withAuthRetry((octokit) =>
          getPulls(db, octokit, owner, repo, { forceRefresh }),
        );
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[issuectl] GET /api/v1/pulls/${owner}/${repo} failed:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
