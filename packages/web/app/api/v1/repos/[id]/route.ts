import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { getDb, removeRepo, getRepoById, formatErrorForUser } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid repo id" }, { status: 400 });
  }

  try {
    const db = getDb();
    const repo = getRepoById(db, id);
    if (!repo) {
      return NextResponse.json(
        { success: false, error: "Repository not found" },
        { status: 404 },
      );
    }

    removeRepo(db, id);
    log.info({ msg: "api_repo_removed", repoId: id, owner: repo.owner, name: repo.name });
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_repo_remove_failed", repoId: id });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
