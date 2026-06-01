import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { getWebhookAutomationHealth } from "@/lib/webhook-health";
import {
  formatErrorForUser,
  getDb,
  getRepo,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function GET(
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
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const health = await getWebhookAutomationHealth(db, repo);
    return NextResponse.json({ health });
  } catch (err) {
    log.error({ err, msg: "api_repo_webhook_health_failed", owner, name: repoName });
    return NextResponse.json({ error: formatErrorForUser(err) }, { status: 500 });
  }
}
