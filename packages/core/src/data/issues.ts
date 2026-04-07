import type { Octokit } from "@octokit/rest";
import type Database from "better-sqlite3";
import type { GitHubIssue, GitHubComment, GitHubPull } from "../github/types.js";
import type { Deployment } from "../types.js";
import { listIssues, getIssue, getComments as fetchComments } from "../github/issues.js";
import { findLinkedPRs } from "../github/pulls.js";
import { getCacheTtl, getCached, setCached, isFresh } from "../db/cache.js";
import { getDeploymentsForIssue } from "../db/deployments.js";
import { getRepo } from "../db/repos.js";
import { reconcileIssueLifecycle } from "../lifecycle/reconcile.js";

const FILE_PATH_PATTERN = /`([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,10})`/g;
const GITHUB_BLOB_PATTERN =
  /https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\/([^\s)]+)/g;

function extractReferencedFiles(body: string | null): string[] {
  if (!body) return [];
  const files = new Set<string>();

  for (const match of body.matchAll(FILE_PATH_PATTERN)) {
    files.add(match[1]);
  }
  for (const match of body.matchAll(GITHUB_BLOB_PATTERN)) {
    files.add(decodeURIComponent(match[1]));
  }

  return [...files];
}

export async function getIssues(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  options?: { forceRefresh?: boolean },
): Promise<{
  issues: GitHubIssue[];
  fromCache: boolean;
  cachedAt: Date | null;
}> {
  const cacheKey = `issues:${owner}/${repo}`;
  const ttl = getCacheTtl(db);

  if (!options?.forceRefresh) {
    const cached = getCached<GitHubIssue[]>(db, cacheKey);
    if (cached) {
      if (!isFresh(cached.fetchedAt, ttl)) {
        listIssues(octokit, owner, repo, "all").then((data) => {
          setCached(db, cacheKey, data);
        }).catch((err) => {
          console.warn(`[issuectl] Background revalidation failed for ${cacheKey}:`, err);
        });
      }
      return { issues: cached.data, fromCache: true, cachedAt: cached.fetchedAt };
    }
  }

  const issues = await listIssues(octokit, owner, repo, "all");
  setCached(db, cacheKey, issues);
  return { issues, fromCache: false, cachedAt: new Date() };
}

export async function getIssueDetail(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  options?: { forceRefresh?: boolean },
): Promise<{
  issue: GitHubIssue;
  comments: GitHubComment[];
  deployments: Deployment[];
  linkedPRs: GitHubPull[];
  referencedFiles: string[];
  fromCache: boolean;
}> {
  const cacheKey = `issue-detail:${owner}/${repo}#${number}`;
  const ttl = getCacheTtl(db);
  const repoRecord = getRepo(db, owner, repo);

  type CachedDetail = {
    issue: GitHubIssue;
    comments: GitHubComment[];
    linkedPRs: GitHubPull[];
  };

  const deployments = repoRecord
    ? getDeploymentsForIssue(db, repoRecord.id, number)
    : [];

  if (!options?.forceRefresh) {
    const cached = getCached<CachedDetail>(db, cacheKey);
    if (cached) {
      if (!isFresh(cached.fetchedAt, ttl)) {
        Promise.all([
          getIssue(octokit, owner, repo, number),
          fetchComments(octokit, owner, repo, number),
          findLinkedPRs(octokit, owner, repo, number),
        ]).then(async ([issue, comments, linkedPRs]) => {
          setCached(db, cacheKey, { issue, comments, linkedPRs });
          try {
            await reconcileIssueLifecycle(db, octokit, owner, repo, issue, linkedPRs);
          } catch (err) {
            console.warn(`[issuectl] Lifecycle reconciliation failed for #${number}:`, err);
          }
        }).catch((err) => {
          console.warn(`[issuectl] Background revalidation failed for ${cacheKey}:`, err);
        });
      }

      return {
        ...cached.data,
        deployments,
        referencedFiles: extractReferencedFiles(cached.data.issue.body),
        fromCache: true,
      };
    }
  }

  const [issue, comments, linkedPRs] = await Promise.all([
    getIssue(octokit, owner, repo, number),
    fetchComments(octokit, owner, repo, number),
    findLinkedPRs(octokit, owner, repo, number),
  ]);

  setCached(db, cacheKey, { issue, comments, linkedPRs });

  if (!options?.forceRefresh) {
    reconcileIssueLifecycle(db, octokit, owner, repo, issue, linkedPRs).catch(
      (err) => console.warn(`[issuectl] Lifecycle reconciliation failed for #${number}:`, err),
    );
  }

  return {
    issue,
    comments,
    deployments,
    linkedPRs,
    referencedFiles: extractReferencedFiles(issue.body),
    fromCache: false,
  };
}
