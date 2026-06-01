import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  addLabel,
  clearCacheKey,
  formatErrorForUser,
  getDb,
  getRepo,
  removeLabel,
  withAuthRetry,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

type LabelBody = {
  label?: string;
  action?: "add" | "remove";
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo, number: numberString } = await params;
  const pullNumber = Number.parseInt(numberString, 10);
  if (!Number.isFinite(pullNumber) || pullNumber <= 0) {
    return NextResponse.json({ success: false, error: "Invalid pull request number" }, { status: 400 });
  }

  const body = await readBody(request);
  if (body instanceof NextResponse) return body;
  if (!body.label || (body.action !== "add" && body.action !== "remove")) {
    return NextResponse.json({ success: false, error: "label and action add/remove are required" }, { status: 400 });
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ success: false, error: "Repository not tracked" }, { status: 404 });
    }

    if (body.action === "add") {
      await withAuthRetry((octokit) => addLabel(octokit, owner, repo, pullNumber, body.label ?? ""));
    } else {
      await withAuthRetry((octokit) => removeLabel(octokit, owner, repo, pullNumber, body.label ?? ""));
    }
    clearCacheKey(db, `pull-detail:${owner}/${repo}#${pullNumber}`);
    clearCacheKey(db, `pulls-open:${owner}/${repo}`);
    clearCacheKey(db, `pulls-with-checks:${owner}/${repo}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_pr_label_toggle_failed", owner, repo, pullNumber, action: body.action });
    return NextResponse.json({ success: false, error: formatErrorForUser(err) }, { status: 500 });
  }
}

async function readBody(request: NextRequest): Promise<LabelBody | NextResponse> {
  try {
    return await request.json() as LabelBody;
  } catch (err) {
    log.warn({ err, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
}
