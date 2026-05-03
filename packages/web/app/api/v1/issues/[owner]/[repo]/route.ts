import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { notifyNewIssue } from "@/lib/push/notifications";
import {
  getCached,
  getDb,
  getRepo,
  getIssues,
  withAuthRetry,
  type GitHubIssue,
} from "@issuectl/core";

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

    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";
    const previousIssues = forceRefresh
      ? getCached<GitHubIssue[]>(db, `issues:${owner}/${repo}`)?.data
      : undefined;
    const result = await withAuthRetry((octokit) =>
      getIssues(db, octokit, owner, repo, { forceRefresh }),
    );
    if (forceRefresh && previousIssues && !result.fromCache) {
      const previousNumbers = new Set(previousIssues.map((issue) => issue.number));
      for (const issue of result.issues) {
        if (previousNumbers.has(issue.number)) continue;
        notifyNewIssue({
          owner,
          repo,
          issueNumber: issue.number,
          title: issue.title,
        });
      }
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[issuectl] GET /api/v1/issues/${owner}/${repo} failed:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
