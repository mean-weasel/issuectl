import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { getDb, removeRepo, getRepo, updateRepo, formatErrorForUser } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo: repoName } = await params;
  if (!owner || !repoName) {
    return NextResponse.json(
      { success: false, error: "Owner and repo name are required" },
      { status: 400 },
    );
  }

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
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

type UpdateRepoBody = {
  localPath?: string;
  branchPattern?: string;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo: repoName } = await params;
  if (!owner || !repoName) {
    return NextResponse.json(
      { success: false, error: "Owner and repo name are required" },
      { status: 400 },
    );
  }

  let body: UpdateRepoBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (body.localPath !== undefined && typeof body.localPath !== "string") {
    return NextResponse.json(
      { success: false, error: "localPath must be a string" },
      { status: 400 },
    );
  }
  if (body.branchPattern !== undefined && typeof body.branchPattern !== "string") {
    return NextResponse.json(
      { success: false, error: "branchPattern must be a string" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const repo = getRepo(db, owner, repoName);
    if (!repo) {
      return NextResponse.json(
        { success: false, error: "Repository not found" },
        { status: 404 },
      );
    }

    const updates: { localPath?: string | null; branchPattern?: string | null } = {};
    if (body.localPath !== undefined) updates.localPath = body.localPath || null;
    if (body.branchPattern !== undefined) updates.branchPattern = body.branchPattern || null;

    const updated = updateRepo(db, repo.id, updates);
    log.info({ msg: "api_repo_updated", repoId: repo.id, owner, name: repoName, updates });
    return NextResponse.json({ success: true, repo: updated });
  } catch (err) {
    log.error({ err, msg: "api_repo_update_failed", owner, name: repoName });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
