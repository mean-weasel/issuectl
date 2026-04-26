import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { getDb, getRepo, withAuthRetry, listLabels, formatErrorForUser } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo } = await params;

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const labels = await withAuthRetry((octokit) =>
      listLabels(octokit, owner, repo),
    );
    log.info({ msg: "api_labels_listed", owner, repo, count: labels.length });
    return NextResponse.json({ labels });
  } catch (err) {
    log.error({ err, msg: "api_labels_list_failed", owner, repo });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
