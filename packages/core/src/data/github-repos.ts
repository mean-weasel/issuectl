import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import type { GitHubAccessibleRepo } from "../github/types.js";
import { listAccessibleRepos } from "../github/repos.js";
import {
  listCachedAccessibleRepos,
  replaceAccessibleRepos,
} from "../db/github-repos.js";

export const ACCESSIBLE_REPOS_TTL_SECONDS = 24 * 60 * 60;

export type AccessibleReposSnapshot = {
  repos: GitHubAccessibleRepo[];
  /**
   * Unix timestamp in **seconds** (NOT milliseconds) of the most recent
   * successful sync, or null if the cache is empty. Consumers that compare
   * against `Date.now()` must divide by 1000.
   */
  syncedAt: number | null;
  isStale: boolean;
};

export function readCachedAccessibleRepos(
  db: Database.Database,
  now: number = Math.floor(Date.now() / 1000),
): AccessibleReposSnapshot {
  const { repos, syncedAt } = listCachedAccessibleRepos(db);
  const isStale =
    syncedAt === null || now - syncedAt > ACCESSIBLE_REPOS_TTL_SECONDS;
  return { repos, syncedAt, isStale };
}

export async function refreshAccessibleRepos(
  db: Database.Database,
  octokit: Octokit,
): Promise<AccessibleReposSnapshot> {
  const fresh = await listAccessibleRepos(octokit);
  const syncedAt = replaceAccessibleRepos(db, fresh);
  return { repos: fresh, syncedAt, isStale: false };
}
