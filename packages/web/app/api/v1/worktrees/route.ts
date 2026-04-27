import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { formatErrorForUser } from "@issuectl/core";
import { listWorktrees } from "@/lib/actions/worktrees";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const worktrees = await listWorktrees();
    return NextResponse.json({ worktrees });
  } catch (err) {
    log.error({ err, msg: "api_worktrees_list_failed" });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
