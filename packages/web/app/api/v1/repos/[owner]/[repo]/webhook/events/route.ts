import { NextRequest, NextResponse } from "next/server";
import { formatErrorForUser, getDb, getRepo, listWebhookLogEntries } from "@issuectl/core";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  buildWebhookEventsPayload,
  parseLimit,
  parsePositiveInt,
  parseTargetType,
  repoFullName,
} from "@/lib/mobile-api-contracts";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo: repoName } = await params;

  try {
    const searchParams = request.nextUrl.searchParams;
    const targetType = parseTargetType(searchParams.get("targetType"));
    const targetNumber = parsePositiveInt(searchParams.get("targetNumber"));
    const limit = parseLimit(searchParams.get("limit"), 50, 100);

    if (targetType === "invalid") {
      return NextResponse.json({ error: "Invalid target type" }, { status: 400 });
    }
    if (targetNumber === "invalid") {
      return NextResponse.json({ error: "Invalid target number" }, { status: 400 });
    }

    const db = getDb();
    const repo = getRepo(db, owner, repoName);
    if (!repo) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const entries = listWebhookLogEntries(db, {
      repoId: repo.id,
      ...(targetType ? { targetType } : {}),
      ...(targetNumber ? { targetNumber } : {}),
      limit,
    });
    const payload = buildWebhookEventsPayload({
      entries,
      repos: [repo],
      filters: {
        repo: repoFullName(repo),
        targetType,
        targetNumber,
        limit,
      },
    });

    return NextResponse.json({
      ...(payload as Record<string, unknown>),
      fromCache: false,
      cachedAt: null,
    });
  } catch (err) {
    log.error({ err, msg: "api_repo_webhook_events_failed", owner, name: repoName });
    return NextResponse.json({ error: formatErrorForUser(err) }, { status: 500 });
  }
}
