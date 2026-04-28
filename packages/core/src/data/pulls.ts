import type { Octokit } from "@octokit/rest";
import type Database from "better-sqlite3";
import type { GitHubPull, GitHubCheck, GitHubIssue, GitHubPullFile, GitHubPullReview } from "../github/types.js";
import { listPulls, getPull, getPullChecks, listPullFiles, listReviews, getChecksRollupForRef, type ChecksRollupStatus } from "../github/pulls.js";
import { getIssue } from "../github/issues.js";
import { getCacheTtl, getCached, setCached, isFresh } from "../db/cache.js";

function extractLinkedIssueNumber(body: string | null): number | null {
  if (!body) return null;
  const match = body.match(
    /(?:closes|fixes|resolves)\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)/i,
  );
  return match ? Number(match[1]) : null;
}

export async function getPulls(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  options?: { forceRefresh?: boolean },
): Promise<{
  pulls: GitHubPull[];
  fromCache: boolean;
  cachedAt: Date | null;
}> {
  // Prefix is `pulls-open:` (not `pulls:`) so the switch from state="all" to
  // state="open" on upgrade doesn't briefly render stale merged/closed PRs
  // from the old cache until TTL expires.
  const cacheKey = `pulls-open:${owner}/${repo}`;
  const ttl = getCacheTtl(db);

  if (!options?.forceRefresh) {
    const cached = getCached<GitHubPull[]>(db, cacheKey);
    if (cached) {
      if (!isFresh(cached.fetchedAt, ttl)) {
        listPulls(octokit, owner, repo, "open").then((data) => {
          setCached(db, cacheKey, data);
        }).catch((err) => {
          console.warn(`[issuectl] Background revalidation failed for ${cacheKey}:`, err);
        });
      }
      return { pulls: cached.data, fromCache: true, cachedAt: cached.fetchedAt };
    }
  }

  const pulls = await listPulls(octokit, owner, repo, "open");
  setCached(db, cacheKey, pulls);
  return { pulls, fromCache: false, cachedAt: new Date() };
}

export type PullWithChecksStatus = GitHubPull & { checksStatus: ChecksRollupStatus };

/**
 * Fetches the PR list and enriches each PR with a checksStatus rollup.
 * Check statuses are fetched concurrently (capped at 5 in-flight).
 * The enriched result is cached separately from the plain pulls list.
 */
export async function getPullsWithChecks(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  options?: { forceRefresh?: boolean },
): Promise<{
  pulls: PullWithChecksStatus[];
  fromCache: boolean;
  cachedAt: Date | null;
}> {
  const cacheKey = `pulls-with-checks:${owner}/${repo}`;
  const ttl = getCacheTtl(db);

  if (!options?.forceRefresh) {
    const cached = getCached<PullWithChecksStatus[]>(db, cacheKey);
    if (cached) {
      if (!isFresh(cached.fetchedAt, ttl)) {
        // Background revalidation
        fetchPullsWithChecks(octokit, owner, repo).then((data) => {
          setCached(db, cacheKey, data);
        }).catch((err) => {
          console.warn(`[issuectl] Background revalidation failed for ${cacheKey}:`, err);
        });
      }
      return { pulls: cached.data, fromCache: true, cachedAt: cached.fetchedAt };
    }
  }

  const pulls = await fetchPullsWithChecks(octokit, owner, repo);
  setCached(db, cacheKey, pulls);
  return { pulls, fromCache: false, cachedAt: new Date() };
}

async function fetchPullsWithChecks(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<PullWithChecksStatus[]> {
  const pulls = await listPulls(octokit, owner, repo, "open");

  // Fetch check rollups concurrently with a concurrency cap of 5
  const CONCURRENCY = 5;
  const results: PullWithChecksStatus[] = [];
  for (let i = 0; i < pulls.length; i += CONCURRENCY) {
    const batch = pulls.slice(i, i + CONCURRENCY);
    const enriched = await Promise.all(
      batch.map(async (pull) => {
        let checksStatus: ChecksRollupStatus = null;
        try {
          checksStatus = await getChecksRollupForRef(octokit, owner, repo, pull.headRef);
        } catch (err) {
          console.warn(
            `[issuectl] getChecksRollupForRef failed for ${owner}/${repo} ref=${pull.headRef}:`,
            err instanceof Error ? err.message : err,
          );
        }
        return { ...pull, checksStatus };
      }),
    );
    results.push(...enriched);
  }
  return results;
}

async function fetchPullDetail(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<CachedPullDetail> {
  const [pull, checks, files, reviews] = await Promise.all([
    getPull(octokit, owner, repo, number),
    getPullChecks(octokit, owner, repo, `pull/${number}/head`),
    listPullFiles(octokit, owner, repo, number),
    listReviews(octokit, owner, repo, number),
  ]);

  const issueNumber = extractLinkedIssueNumber(pull.body);
  let linkedIssue: GitHubIssue | null = null;
  if (issueNumber) {
    try {
      linkedIssue = await getIssue(octokit, owner, repo, issueNumber);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status !== 404) {
        console.warn(
          `[issuectl] Failed to fetch linked issue #${issueNumber} for PR #${number}:`,
          err,
        );
      }
    }
  }

  return { pull, checks, files, linkedIssue, reviews };
}

type CachedPullDetail = {
  pull: GitHubPull;
  checks: GitHubCheck[];
  files: GitHubPullFile[];
  linkedIssue: GitHubIssue | null;
  reviews: GitHubPullReview[];
};

export async function getPullDetail(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  options?: { forceRefresh?: boolean },
): Promise<CachedPullDetail & { fromCache: boolean; cachedAt: Date | null }> {
  const cacheKey = `pull-detail:${owner}/${repo}#${number}`;
  const ttl = getCacheTtl(db);

  if (!options?.forceRefresh) {
    const cached = getCached<CachedPullDetail>(db, cacheKey);
    if (cached) {
      if (!isFresh(cached.fetchedAt, ttl)) {
        fetchPullDetail(octokit, owner, repo, number).then((data) => {
          setCached(db, cacheKey, data);
        }).catch((err) => {
          console.warn(`[issuectl] Background revalidation failed for ${cacheKey}:`, err);
        });
      }
      const data = cached.data;
      data.reviews ??= [];
      return { ...data, fromCache: true, cachedAt: cached.fetchedAt };
    }
  }

  const data = await fetchPullDetail(octokit, owner, repo, number);
  setCached(db, cacheKey, data);
  return { ...data, fromCache: false, cachedAt: new Date() };
}
