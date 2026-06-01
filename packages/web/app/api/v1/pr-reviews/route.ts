import { NextRequest, NextResponse } from "next/server";
import {
  formatErrorForUser,
  getDb,
  listPrReviewsForPull,
  listPrReviewsForRepo,
  listRecentTerminalDeploymentsByRepo,
  listRepos,
  type Deployment,
  type PrReview,
  type PrReviewStatus,
  type Repo,
} from "@issuectl/core";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  buildPrReviewsPayload,
  findRepoByFullName,
  parseLimit,
  parsePositiveInt,
} from "@/lib/mobile-api-contracts";

export const dynamic = "force-dynamic";

const REVIEW_STATUSES: readonly PrReviewStatus[] = [
  "reserved",
  "launching",
  "in_progress",
  "completed",
  "failed",
  "superseded",
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const params = request.nextUrl.searchParams;
    const limit = parseLimit(params.get("limit"), 24, 100);
    const pr = parsePositiveInt(params.get("pr"));
    const status = parseReviewStatus(params.get("status"));
    const repoFilter = params.get("repo");

    if (pr === "invalid") {
      return NextResponse.json({ error: "Invalid pull request number" }, { status: 400 });
    }
    if (status === "invalid") {
      return NextResponse.json({ error: "Invalid review status" }, { status: 400 });
    }

    const db = getDb();
    const allRepos = listRepos(db);
    const repo = repoFilter ? findRepoByFullName(allRepos, repoFilter) : undefined;
    if (repoFilter && !repo) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const repos = repo ? [repo] : allRepos;
    const reviews = collectReviews({ db, repos, pr, limit })
      .filter((review) => status === "all" || review.status === status)
      .sort((left, right) => right.startedAt - left.startedAt || right.id - left.id);
    const deploymentsById = collectDeploymentsById(db, repos, limit);

    return NextResponse.json(buildPrReviewsPayload({
      reviews,
      repos: allRepos,
      deploymentsById,
      filters: {
        repo: repoFilter,
        pr,
        status,
        limit,
      },
    }));
  } catch (err) {
    log.error({ err, msg: "api_pr_reviews_failed" });
    return NextResponse.json({ error: formatErrorForUser(err) }, { status: 500 });
  }
}

function collectReviews(input: {
  db: Parameters<typeof listPrReviewsForRepo>[0];
  repos: Repo[];
  pr: number | null;
  limit: number;
}): PrReview[] {
  return input.repos.flatMap((repo) =>
    input.pr === null
      ? listPrReviewsForRepo(input.db, repo.id, input.limit)
      : listPrReviewsForPull(input.db, repo.id, input.pr, input.limit),
  );
}

function collectDeploymentsById(
  db: Parameters<typeof listRecentTerminalDeploymentsByRepo>[0],
  repos: Repo[],
  limit: number,
): Map<number, Deployment> {
  return new Map(
    repos
      .flatMap((repo) => listRecentTerminalDeploymentsByRepo(db, repo.id, limit))
      .map((deployment) => [deployment.id, deployment]),
  );
}

function parseReviewStatus(value: string | null): PrReviewStatus | "all" | "invalid" {
  if (value === null || value.trim() === "") return "all";
  if (value === "all") return "all";
  return REVIEW_STATUSES.includes(value as PrReviewStatus) ? value as PrReviewStatus : "invalid";
}
