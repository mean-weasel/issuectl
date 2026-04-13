import type { Octokit } from "@octokit/rest";
import type Database from "better-sqlite3";
import type { Repo } from "../types.js";
import type { GitHubLabel } from "../github/types.js";
import { listRepos } from "../db/repos.js";
import { getIssues } from "./issues.js";
import { getPulls } from "./pulls.js";
import { getDeploymentsByRepo } from "../db/deployments.js";
import { reconcileRepoLifecycle } from "../lifecycle/reconcile.js";
import { mapLimit, DEFAULT_REPO_FANOUT } from "./map-limit.js";

function countLabelOccurrences(
  labels: GitHubLabel[][],
): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const labelSet of labels) {
    for (const label of labelSet) {
      counts.set(label.name, (counts.get(label.name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function daysSince(isoDate: string): number {
  return Math.floor(
    (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24),
  );
}

export async function getDashboardData(
  db: Database.Database,
  octokit: Octokit,
  options?: { forceRefresh?: boolean },
): Promise<{
  repos: Array<
    Repo & {
      issueCount: number;
      prCount: number;
      deployedCount: number;
      labels: Array<{ name: string; count: number }>;
      oldestIssueAge: number;
    }
  >;
  totalIssues: number;
  totalPRs: number;
  cachedAt: Date | null;
}> {
  const repos = listRepos(db);
  let oldestCachedAt: Date | null = null;

  // A4: cap per-repo fan-out so loading a dashboard with many tracked
  // repos does not burst past GitHub's secondary rate limit. Each worker
  // still issues issues + pulls in parallel, so steady-state concurrency
  // is roughly DEFAULT_REPO_FANOUT * 2 outbound Octokit requests.
  const enrichedRepos = await mapLimit(
    repos,
    DEFAULT_REPO_FANOUT,
    async (repo) => {
      const [issueResult, pullResult] = await Promise.all([
        getIssues(db, octokit, repo.owner, repo.name, options),
        getPulls(db, octokit, repo.owner, repo.name, options),
      ]);

      if (
        !options?.forceRefresh &&
        (!issueResult.fromCache || !pullResult.fromCache)
      ) {
        reconcileRepoLifecycle(
          db,
          octokit,
          repo.owner,
          repo.name,
          issueResult.issues,
          pullResult.pulls,
        ).catch((err) =>
          console.warn(
            `[issuectl] Repo lifecycle reconciliation failed for ${repo.owner}/${repo.name}:`,
            err,
          ),
        );
      }

      const deployments = getDeploymentsByRepo(db, repo.id);
      const openIssues = issueResult.issues.filter((i) => i.state === "open");

      if (issueResult.cachedAt) {
        if (!oldestCachedAt || issueResult.cachedAt < oldestCachedAt) {
          oldestCachedAt = issueResult.cachedAt;
        }
      }

      return {
        ...repo,
        issueCount: openIssues.length,
        prCount: pullResult.pulls.filter((p) => p.state === "open").length,
        deployedCount: deployments.length,
        labels: countLabelOccurrences(openIssues.map((i) => i.labels)),
        oldestIssueAge: openIssues.length > 0
          ? Math.max(...openIssues.map((i) => daysSince(i.createdAt)))
          : 0,
      };
    },
  );

  const totalIssues = enrichedRepos.reduce((sum, r) => sum + r.issueCount, 0);
  const totalPRs = enrichedRepos.reduce((sum, r) => sum + r.prCount, 0);

  return {
    repos: enrichedRepos,
    totalIssues,
    totalPRs,
    cachedAt: oldestCachedAt,
  };
}
