import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getDb, getRepo, checkWorktreeStatus, formatErrorForUser } from "@issuectl/core";
import { getWorktreeDir } from "@/lib/worktree-dir";
import log from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const issueNumberStr = searchParams.get("issueNumber");

  if (!owner || !repo || !issueNumberStr) {
    return NextResponse.json(
      { error: "owner, repo, and issueNumber are required" },
      { status: 400 },
    );
  }

  const issueNumber = parseInt(issueNumberStr, 10);
  if (Number.isNaN(issueNumber) || issueNumber <= 0) {
    return NextResponse.json(
      { error: "Invalid issue number" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const repoRecord = getRepo(db, owner, repo);
    if (!repoRecord) {
      return NextResponse.json({ exists: false, dirty: false, path: "" });
    }

    const worktreeDir = getWorktreeDir();
    const status = await checkWorktreeStatus(
      worktreeDir,
      repoRecord.name,
      issueNumber,
    );
    return NextResponse.json(status);
  } catch (err) {
    log.error({ err, msg: "api_worktree_status_failed", owner, repo, issueNumber });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
