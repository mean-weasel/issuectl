import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  getPriority,
  setPriority,
  formatErrorForUser,
} from "@issuectl/core";
import type { Priority } from "@issuectl/core";

export const dynamic = "force-dynamic";

const VALID_PRIORITIES: readonly string[] = ["low", "normal", "high"];

type PriorityBody = {
  priority: string;
};

export async function GET(
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

  try {
    const db = getDb();
    const repoRecord = getRepo(db, owner, repo);
    if (!repoRecord) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const priority = getPriority(db, repoRecord.id, issueNumber);
    return NextResponse.json({ priority });
  } catch (err) {
    log.error({ err, msg: "api_issue_priority_get_failed", owner, repo, issueNumber });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

export async function PUT(
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

  let body: PriorityBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_PRIORITIES.includes(body.priority)) {
    return NextResponse.json(
      { error: "Invalid priority — must be low, normal, or high" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const repoRecord = getRepo(db, owner, repo);
    if (!repoRecord) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    setPriority(db, repoRecord.id, issueNumber, body.priority as Priority);

    log.info({ msg: "api_issue_priority_set", owner, repo, issueNumber, priority: body.priority });
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_issue_priority_set_failed", owner, repo, issueNumber });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
