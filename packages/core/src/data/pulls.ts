import type { Octokit } from "@octokit/rest";
import type Database from "better-sqlite3";
import type { GitHubPull, GitHubCheck, GitHubIssue } from "../github/types.js";
import { listPulls, getPull, getPullChecks } from "../github/pulls.js";
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
  const cacheKey = `pulls:${owner}/${repo}`;
  const ttl = getCacheTtl(db);

  if (!options?.forceRefresh) {
    const cached = getCached<GitHubPull[]>(db, cacheKey);
    if (cached) {
      if (!isFresh(cached.fetchedAt, ttl)) {
        listPulls(octokit, owner, repo, "all").then((data) => {
          setCached(db, cacheKey, data);
        }).catch((err) => {
          console.warn(`[issuectl] Background revalidation failed for ${cacheKey}:`, err);
        });
      }
      return { pulls: cached.data, fromCache: true, cachedAt: cached.fetchedAt };
    }
  }

  const pulls = await listPulls(octokit, owner, repo, "all");
  setCached(db, cacheKey, pulls);
  return { pulls, fromCache: false, cachedAt: new Date() };
}

export async function getPullDetail(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<{
  pull: GitHubPull;
  checks: GitHubCheck[];
  linkedIssue: GitHubIssue | null;
}> {
  const [pull, checks] = await Promise.all([
    getPull(octokit, owner, repo, number),
    getPullChecks(octokit, owner, repo, `pull/${number}/head`),
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

  return { pull, checks, linkedIssue };
}
