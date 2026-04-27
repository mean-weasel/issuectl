import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { formatErrorForUser } from "@issuectl/core";
import { cleanupWorktree, cleanupStaleWorktrees } from "@/lib/actions/worktrees";

export const dynamic = "force-dynamic";

type CleanupBody = {
  path?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  let body: CleanupBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  try {
    if (body.path) {
      if (typeof body.path !== "string") {
        return NextResponse.json(
          { error: "path must be a string" },
          { status: 400 },
        );
      }

      const result = await cleanupWorktree(body.path);
      if (!result.success) {
        log.warn({ msg: "api_worktree_cleanup_failed", path: body.path, error: result.error });
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 422 },
        );
      }

      log.info({ msg: "api_worktree_cleaned", path: body.path });
      return NextResponse.json({ success: true });
    }

    // No path — clean all stale worktrees
    const result = await cleanupStaleWorktrees();
    if (!result.success) {
      log.warn({ msg: "api_worktrees_cleanup_stale_failed", removed: result.removed, error: result.error });
      return NextResponse.json(
        { success: false, removed: result.removed, error: result.error },
        { status: 422 },
      );
    }

    log.info({ msg: "api_worktrees_stale_cleaned", removed: result.removed });
    return NextResponse.json({ success: true, removed: result.removed });
  } catch (err) {
    log.error({ err, msg: "api_worktrees_cleanup_error" });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
