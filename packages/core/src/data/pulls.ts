import type { Octokit } from "@octokit/rest";
import type Database from "better-sqlite3";
import type { GitHubPull, GitHubCheck, GitHubIssue, GitHubPullFile, GitHubPullReview } from "../github/types.js";
import { listPulls, getPull, getPullChecks, listPullFiles, listReviews } from "../github/pulls.js";
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
