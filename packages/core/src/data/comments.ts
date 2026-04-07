import type { Octokit } from "@octokit/rest";
import type Database from "better-sqlite3";
import type { GitHubComment } from "../github/types.js";
import {
  getComments as fetchComments,
  addComment as postComment,
} from "../github/issues.js";
import { getCacheTtl, getCached, setCached, isFresh, clearCacheKey } from "../db/cache.js";

export async function getComments(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  options?: { forceRefresh?: boolean },
): Promise<{
  comments: GitHubComment[];
  fromCache: boolean;
  cachedAt: Date | null;
}> {
  const cacheKey = `comments:${owner}/${repo}#${issueNumber}`;
  const ttl = getCacheTtl(db);

  if (!options?.forceRefresh) {
    const cached = getCached<GitHubComment[]>(db, cacheKey);
    if (cached) {
      if (!isFresh(cached.fetchedAt, ttl)) {
        fetchComments(octokit, owner, repo, issueNumber).then((data) => {
          setCached(db, cacheKey, data);
        }).catch((err) => {
          console.warn(`[issuectl] Background revalidation failed for ${cacheKey}:`, err);
        });
      }
      return { comments: cached.data, fromCache: true, cachedAt: cached.fetchedAt };
    }
  }

  const comments = await fetchComments(octokit, owner, repo, issueNumber);
  setCached(db, cacheKey, comments);
  return { comments, fromCache: false, cachedAt: new Date() };
}

export async function addComment(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<GitHubComment> {
  const comment = await postComment(octokit, owner, repo, issueNumber, body);
  clearCacheKey(db, `comments:${owner}/${repo}#${issueNumber}`);
  clearCacheKey(db, `issue-detail:${owner}/${repo}#${issueNumber}`);
  clearCacheKey(db, `pull-detail:${owner}/${repo}#${issueNumber}`);
  return comment;
}
