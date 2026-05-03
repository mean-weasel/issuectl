import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { notifyMergedPullRequest } from "@/lib/push/notifications";
import {
  getCached,
  getDb,
  getRepo,
  getPulls,
  getPullsWithChecks,
  withAuthRetry,
  type GitHubPull,
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
    const includeChecks = request.nextUrl.searchParams.get("checks") !== "false";
    const cacheKey = includeChecks
      ? `pulls-with-checks:${owner}/${repo}`
      : `pulls-open:${owner}/${repo}`;
    const previousPulls = forceRefresh
      ? getCached<GitHubPull[]>(db, cacheKey)?.data
      : undefined;

    const result = includeChecks
      ? await withAuthRetry((octokit) =>
          getPullsWithChecks(db, octokit, owner, repo, { forceRefresh }),
        )
      : await withAuthRetry((octokit) =>
          getPulls(db, octokit, owner, repo, { forceRefresh }),
        );
    if (forceRefresh && previousPulls && !result.fromCache) {
      const openNumbers = new Set(result.pulls.map((pull) => pull.number));
      const missing = previousPulls.filter((pull) => !openNumbers.has(pull.number));
      if (missing.length > 0) {
        await withAuthRetry(async (octokit) => {
          await Promise.all(missing.slice(0, 10).map(async (pull) => {
            try {
              const response = await octokit.pulls.get({
                owner,
                repo,
                pull_number: pull.number,
              });
              if (response.data.merged_at) {
                notifyMergedPullRequest({
                  owner,
                  repo,
                  pullNumber: pull.number,
                  sha: response.data.merge_commit_sha ?? undefined,
                });
              }
            } catch (err) {
              console.warn(
                `[issuectl] Failed to inspect disappeared PR ${owner}/${repo}#${pull.number}:`,
                err,
              );
            }
          }));
        });
      }
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[issuectl] GET /api/v1/pulls/${owner}/${repo} failed:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
