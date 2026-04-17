import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import type {
  Draft,
  Repo,
  IssuePriority,
  Deployment,
  Priority,
  SortMode,
  UnifiedList,
  DraftListItem,
  IssueListItem,
} from "../types.js";
import type { GitHubIssue } from "../github/types.js";
import { listDrafts } from "../db/drafts.js";
import { listRepos } from "../db/repos.js";
import { getDeploymentsByRepo } from "../db/deployments.js";
import { listPrioritiesForRepo } from "../db/priority.js";
import { getIssues } from "./issues.js";
import { mapLimit, DEFAULT_REPO_FANOUT } from "./map-limit.js";

export type PerRepoData = {
  repo: Repo;
  issues: GitHubIssue[];
  deployments: Deployment[];
  priorities: IssuePriority[];
};

export type GroupIntoSectionsInput = {
  drafts: Draft[];
  perRepo: PerRepoData[];
};

// Higher rank sorts earlier via compareByPriorityThenUpdatedAt — e.g.,
// all "high" items come before any "normal" item, regardless of timestamp.
const PRIORITY_RANK: Record<Priority, number> = {
  high: 2,
  normal: 1,
  low: 0,
};

function compareByPriorityThenUpdatedAt(
  aPriority: Priority,
  aUpdatedAt: number,
  bPriority: Priority,
  bUpdatedAt: number,
): number {
  const rankDiff = PRIORITY_RANK[bPriority] - PRIORITY_RANK[aPriority];
  if (rankDiff !== 0) return rankDiff;
  // Guard against NaN from malformed timestamps (e.g., an unparseable ISO
  // string from GitHub). Fall back to 0 so the sort stays deterministic.
  const aSafe = Number.isFinite(aUpdatedAt) ? aUpdatedAt : 0;
  const bSafe = Number.isFinite(bUpdatedAt) ? bUpdatedAt : 0;
  return bSafe - aSafe;
}

export function groupIntoSections(
  input: GroupIntoSectionsInput,
  sortMode: SortMode = "updated",
): UnifiedList {
  const sortDrafts = (drafts: Draft[]): Draft[] => {
    const copy = drafts.slice();
    switch (sortMode) {
      case "priority":
        return copy.sort((a, b) =>
          compareByPriorityThenUpdatedAt(a.priority, a.updatedAt, b.priority, b.updatedAt),
        );
      case "created":
      case "updated": {
        const field = sortMode === "created" ? "createdAt" : "updatedAt";
        return copy.sort((a, b) => {
          const aSafe = Number.isFinite(a[field]) ? a[field] : 0;
          const bSafe = Number.isFinite(b[field]) ? b[field] : 0;
          return bSafe - aSafe;
        });
      }
    }
  };

  const unassigned: DraftListItem[] = sortDrafts(input.drafts)
    .map((draft) => ({ kind: "draft" as const, draft }));

  const in_focus: IssueListItem[] = [];
  const in_flight: IssueListItem[] = [];
  const shipped: IssueListItem[] = [];

  for (const { repo, issues, deployments, priorities } of input.perRepo) {
    // A deployment row with ended_at IS NULL means there's a live
    // worktree / Claude session still open for that issue.
    const activeLaunchSet = new Set(
      deployments
        .filter((d) => d.endedAt === null)
        .map((d) => d.issueNumber),
    );

    const priorityMap = new Map<number, Priority>(
      priorities.map((p) => [p.issueNumber, p.priority]),
    );

    for (const issue of issues) {
      const priority = priorityMap.get(issue.number) ?? "normal";

      // Closed wins over an active deployment (a stale deployment shouldn't
      // keep a closed issue out of shipped). See the dedicated test.
      let section: "in_focus" | "in_flight" | "shipped";
      if (issue.state === "closed") {
        section = "shipped";
      } else if (activeLaunchSet.has(issue.number)) {
        section = "in_flight";
      } else {
        section = "in_focus";
      }

      const item: IssueListItem = {
        kind: "issue",
        repo,
        issue,
        priority,
        section,
      };

      if (section === "in_focus") in_focus.push(item);
      else if (section === "in_flight") in_flight.push(item);
      else shipped.push(item);
    }
  }

  const sortIssues = (items: IssueListItem[]): IssueListItem[] => {
    const copy = items.slice();
    switch (sortMode) {
      case "priority":
        return copy.sort((a, b) => {
          const aUpdated = new Date(a.issue.updatedAt).getTime();
          const bUpdated = new Date(b.issue.updatedAt).getTime();
          return compareByPriorityThenUpdatedAt(a.priority, aUpdated, b.priority, bUpdated);
        });
      case "created":
      case "updated": {
        const field = sortMode === "created" ? "createdAt" : "updatedAt";
        return copy.sort((a, b) => {
          const aTime = new Date(a.issue[field]).getTime();
          const bTime = new Date(b.issue[field]).getTime();
          const aSafe = Number.isFinite(aTime) ? aTime : 0;
          const bSafe = Number.isFinite(bTime) ? bTime : 0;
          return bSafe - aSafe;
        });
      }
    }
  };

  return {
    unassigned,
    in_focus: sortIssues(in_focus),
    in_flight: sortIssues(in_flight),
    shipped: sortIssues(shipped),
  };
}

export async function getUnifiedList(
  db: Database.Database,
  octokit: Octokit,
  sortMode: SortMode = "updated",
): Promise<UnifiedList> {
  const drafts = listDrafts(db);
  const repos = listRepos(db);

  // Per-repo failures are caught and logged so one bad repo doesn't
  // kill the whole feed — we render the remaining repos' data and
  // drafts. Phase 4/5 can surface a "couldn't load N repos" banner if
  // the degraded experience becomes noticeable.
  const results = await mapLimit(
    repos,
    DEFAULT_REPO_FANOUT,
    async (repo): Promise<PerRepoData | null> => {
      try {
        const { issues } = await getIssues(db, octokit, repo.owner, repo.name);
        const deployments = getDeploymentsByRepo(db, repo.id);
        const priorities = listPrioritiesForRepo(db, repo.id);
        return { repo, issues, deployments, priorities };
      } catch (err) {
        console.error(
          `[issuectl] getUnifiedList: failed to fetch data for ${repo.owner}/${repo.name}`,
          err,
        );
        return null;
      }
    },
  );

  const perRepo: PerRepoData[] = results.filter(
    (r): r is PerRepoData => r !== null,
  );

  return groupIntoSections({ drafts, perRepo }, sortMode);
}
