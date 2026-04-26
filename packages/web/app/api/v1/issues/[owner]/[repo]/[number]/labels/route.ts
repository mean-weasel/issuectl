import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  addLabel,
  removeLabel,
  clearCacheKey,
  withAuthRetry,
  formatErrorForUser,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

type ToggleLabelBody = {
  label: string;
  action: "add" | "remove";
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo, number: numStr } = await params;
  const issueNumber = parseInt(numStr, 10);
  if (Number.isNaN(issueNumber) || issueNumber <= 0) {
    return NextResponse.json({ error: "Invalid issue number" }, { status: 400 });
  }

  let body: ToggleLabelBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.label !== "string" || !body.label.trim()) {
    return NextResponse.json({ error: "Label name is required" }, { status: 400 });
  }
  if (body.action !== "add" && body.action !== "remove") {
    return NextResponse.json({ error: "Action must be 'add' or 'remove'" }, { status: 400 });
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    if (body.action === "add") {
      await withAuthRetry((octokit) =>
        addLabel(octokit, owner, repo, issueNumber, body.label),
      );
    } else {
      await withAuthRetry((octokit) =>
        removeLabel(octokit, owner, repo, issueNumber, body.label),
      );
    }

    clearCacheKey(db, `issue-detail:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issue-header:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issue-content:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issues:${owner}/${repo}`);

    log.info({ msg: "api_issue_label_toggled", owner, repo, issueNumber, label: body.label, action: body.action });
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_issue_label_toggle_failed", owner, repo, issueNumber, label: body.label });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
