import { NextRequest, NextResponse } from "next/server";
import { resolve, join } from "node:path";
import { requireAuth } from "@/lib/api-auth";
import {
  getDb,
  getRepo,
  expandHome,
  formatErrorForUser,
  resetWorktree as coreResetWorktree,
} from "@issuectl/core";
import { getWorktreeDir } from "@/lib/worktree-dir";
import log from "@/lib/logger";

export const dynamic = "force-dynamic";

type ResetBody = {
  owner: string;
  repo: string;
  issueNumber: number;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  let body: ResetBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { owner, repo, issueNumber } = body;
  if (!owner || !repo || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    return NextResponse.json(
      { success: false, error: "Invalid parameters" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const repoRecord = getRepo(db, owner, repo);
    if (!repoRecord) {
      return NextResponse.json(
        { success: false, error: "Repository not found" },
        { status: 404 },
      );
    }

    const repoLocalPath = repoRecord.localPath;
    if (!repoLocalPath) {
      return NextResponse.json(
        { success: false, error: "Repository has no local path" },
        { status: 400 },
      );
    }

    const worktreeDir = getWorktreeDir();
    const worktreeName = `${repoRecord.name}-issue-${issueNumber}`;
    const worktreePath = join(worktreeDir, worktreeName);

    const resolved = resolve(worktreePath);
    if (!resolved.startsWith(resolve(worktreeDir))) {
      return NextResponse.json(
        { success: false, error: "Invalid worktree path" },
        { status: 400 },
      );
    }

    await coreResetWorktree(resolved, expandHome(repoLocalPath));
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_worktree_reset_failed", owner, repo, issueNumber });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
