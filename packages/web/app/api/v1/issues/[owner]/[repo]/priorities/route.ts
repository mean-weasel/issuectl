import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { getDb, getRepo, listPrioritiesForRepo, formatErrorForUser } from "@issuectl/core";

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
    const repoRecord = getRepo(db, owner, repo);
    if (!repoRecord) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const priorities = listPrioritiesForRepo(db, repoRecord.id);
    return NextResponse.json({ priorities });
  } catch (err) {
    log.error({ err, msg: "api_issue_priorities_list_failed", owner, repo });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
