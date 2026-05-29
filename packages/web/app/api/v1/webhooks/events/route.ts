import { NextRequest, NextResponse } from "next/server";
import { formatErrorForUser, getDb, listRepos, listWebhookLogEntries } from "@issuectl/core";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  buildWebhookEventsPayload,
  findRepoByFullName,
  parseLimit,
  parsePositiveInt,
  parseTargetType,
} from "@/lib/mobile-api-contracts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const db = getDb();
    const repos = listRepos(db);
    const params = request.nextUrl.searchParams;
    const repoFilter = params.get("repo");
    const targetType = parseTargetType(params.get("targetType"));
    const targetNumber = parsePositiveInt(params.get("targetNumber"));
    const limit = parseLimit(params.get("limit"), 50, 100);

    if (targetType === "invalid") {
      return NextResponse.json({ error: "Invalid target type" }, { status: 400 });
    }
    if (targetNumber === "invalid") {
      return NextResponse.json({ error: "Invalid target number" }, { status: 400 });
    }

    const repo = repoFilter ? findRepoByFullName(repos, repoFilter) : undefined;
    if (repoFilter && !repo) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const entries = listWebhookLogEntries(db, {
      ...(repo ? { repoId: repo.id } : {}),
      ...(targetType ? { targetType } : {}),
      ...(targetNumber ? { targetNumber } : {}),
      limit,
    });

    return NextResponse.json(buildWebhookEventsPayload({
      entries,
      repos,
      filters: {
        repo: repoFilter,
        targetType,
        targetNumber,
        limit,
      },
    }));
  } catch (err) {
    log.error({ err, msg: "api_webhook_events_failed" });
    return NextResponse.json({ error: formatErrorForUser(err) }, { status: 500 });
  }
}
