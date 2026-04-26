import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  readCachedAccessibleRepos,
  refreshAccessibleRepos,
  withAuthRetry,
  formatErrorForUser,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const refresh = request.nextUrl.searchParams.get("refresh") === "true";

  try {
    const db = getDb();

    if (refresh) {
      const snapshot = await withAuthRetry((octokit) =>
        refreshAccessibleRepos(db, octokit),
      );
      return NextResponse.json(snapshot);
    }

    const snapshot = readCachedAccessibleRepos(db);
    return NextResponse.json(snapshot);
  } catch (err) {
    log.error({ err, msg: "api_github_repos_failed", refresh });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
