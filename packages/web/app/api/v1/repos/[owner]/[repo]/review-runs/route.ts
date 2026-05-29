import { NextRequest, NextResponse } from "next/server";
import {
  formatErrorForUser,
  getDb,
  getRepo,
  listPrReviewsForPull,
  listPrReviewsForRepo,
  listRecentTerminalDeploymentsByRepo,
  type PrReviewStatus,
} from "@issuectl/core";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { buildPrReviewsPayload, parseLimit, parsePositiveInt, repoFullName } from "@/lib/mobile-api-contracts";

export const dynamic = "force-dynamic";

const REVIEW_STATUSES: readonly PrReviewStatus[] = [
  "reserved",
  "launching",
  "in_progress",
  "completed",
  "failed",
  "superseded",
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo: repoName } = await params;

  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseLimit(searchParams.get("limit"), 24, 100);
    const pr = parsePositiveInt(searchParams.get("pr"));
    const status = parseReviewStatus(searchParams.get("status"));

    if (pr === "invalid") {
      return NextResponse.json({ error: "Invalid pull request number" }, { status: 400 });
    }
    if (status === "invalid") {
      return NextResponse.json({ error: "Invalid review status" }, { status: 400 });
    }

    const db = getDb();
    const repo = getRepo(db, owner, repoName);
    if (!repo) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const reviews = (pr === null
      ? listPrReviewsForRepo(db, repo.id, limit)
      : listPrReviewsForPull(db, repo.id, pr, limit))
      .filter((review) => status === "all" || review.status === status)
      .sort((left, right) => right.startedAt - left.startedAt || right.id - left.id);
    const deploymentsById = new Map(
      listRecentTerminalDeploymentsByRepo(db, repo.id, limit)
        .map((deployment) => [deployment.id, deployment]),
    );
    const payload = buildPrReviewsPayload({
      reviews,
      repos: [repo],
      deploymentsById,
      filters: {
        repo: repoFullName(repo),
        pr,
        status,
        limit,
      },
    }) as { reviews?: unknown };

    return NextResponse.json({
      reviewRuns: payload.reviews ?? [],
      fromCache: false,
      cachedAt: null,
    });
  } catch (err) {
    log.error({ err, msg: "api_repo_review_runs_failed", owner, name: repoName });
    return NextResponse.json({ error: formatErrorForUser(err) }, { status: 500 });
  }
}

function parseReviewStatus(value: string | null): PrReviewStatus | "all" | "invalid" {
  if (value === null || value.trim() === "") return "all";
  if (value === "all") return "all";
  return REVIEW_STATUSES.includes(value as PrReviewStatus) ? value as PrReviewStatus : "invalid";
}
