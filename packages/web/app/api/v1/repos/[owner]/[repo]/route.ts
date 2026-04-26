import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { getDb, removeRepo, getRepo } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo: repoName } = await params;

  try {
    const db = getDb();
    const repo = getRepo(db, owner, repoName);
    if (!repo) {
      return NextResponse.json(
        { success: false, error: "Repository not found" },
        { status: 404 },
      );
    }

    removeRepo(db, repo.id);
    log.info({ msg: "api_repo_removed", repoId: repo.id, owner, name: repoName });
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_repo_remove_failed", owner, name: repoName });
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
