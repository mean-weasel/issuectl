import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  clearCacheKey,
  withAuthRetry,
  formatErrorForUser,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

type AssigneesBody = {
  assignees: string[];
};

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

  let body: AssigneesBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.assignees)) {
    return NextResponse.json({ error: "assignees must be an array of strings" }, { status: 400 });
  }

  const desired = body.assignees.filter((a) => typeof a === "string" && a.trim());

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const finalAssignees = await withAuthRetry(async (octokit) => {
      // Fetch current assignees
      const { data: issue } = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      const current = (issue.assignees ?? [])
        .map((a) => a.login)
        .filter(Boolean);

      const toAdd = desired.filter((a) => !current.includes(a));
      const toRemove = current.filter((a) => !desired.includes(a));

      if (toAdd.length > 0) {
        await octokit.rest.issues.addAssignees({
          owner,
          repo,
          issue_number: issueNumber,
          assignees: toAdd,
        });
      }

      if (toRemove.length > 0) {
        await octokit.rest.issues.removeAssignees({
          owner,
          repo,
          issue_number: issueNumber,
          assignees: toRemove,
        });
      }

      // Re-fetch to get the final state
      const { data: updated } = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      return (updated.assignees ?? [])
        .map((a) => a.login)
        .filter(Boolean);
    });

    clearCacheKey(db, `issue-detail:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issue-header:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issue-content:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issues:${owner}/${repo}`);

    log.info({ msg: "api_issue_assignees_updated", owner, repo, issueNumber, assignees: finalAssignees });
    return NextResponse.json({ assignees: finalAssignees });
  } catch (err) {
    log.error({ err, msg: "api_issue_assignees_update_failed", owner, repo, issueNumber });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
