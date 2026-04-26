import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { getDb, getRepo, withAuthRetry, formatErrorForUser } from "@issuectl/core";

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

    const collaborators = await withAuthRetry(async (octokit) => {
      const { data } = await octokit.rest.repos.listCollaborators({
        owner,
        repo,
        per_page: 100,
      });
      return data.map((c) => ({
        login: c.login,
        avatarUrl: c.avatar_url,
      }));
    });

    log.info({ msg: "api_collaborators_listed", owner, repo, count: collaborators.length });
    return NextResponse.json({ collaborators });
  } catch (err) {
    log.error({ err, msg: "api_collaborators_list_failed", owner, repo });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
