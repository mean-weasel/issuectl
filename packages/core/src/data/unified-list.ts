import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import type {
  Draft,
  Repo,
  IssuePriority,
  Deployment,
  Priority,
  UnifiedList,
  UnifiedListItem,
} from "../types.js";
import type { GitHubIssue } from "../github/types.js";
import { listDrafts } from "../db/drafts.js";
import { listRepos } from "../db/repos.js";
import { getDeploymentsByRepo } from "../db/deployments.js";
import { listPrioritiesForRepo } from "../db/priority.js";
import { getIssues } from "./issues.js";

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
  return bUpdatedAt - aUpdatedAt;
}

export function groupIntoSections(
  input: GroupIntoSectionsInput,
): UnifiedList {
  // Unassigned: all drafts, sorted by priority DESC then updatedAt DESC
  const unassigned: UnifiedListItem[] = input.drafts
    .slice()
    .sort((a, b) =>
      compareByPriorityThenUpdatedAt(
        a.priority,
        a.updatedAt,
        b.priority,
        b.updatedAt,
      ),
    )
    .map((draft) => ({ kind: "draft" as const, draft }));

  const in_focus: UnifiedListItem[] = [];
  const in_flight: UnifiedListItem[] = [];
  const shipped: UnifiedListItem[] = [];

  for (const { repo, issues, deployments, priorities } of input.perRepo) {
    // Build a set of issue numbers with an active deployment (ended_at IS NULL)
    const activeLaunchSet = new Set(
      deployments
        .filter((d) => d.endedAt === null)
        .map((d) => d.issueNumber),
    );

    // Build a priority map for this repo
    const priorityMap = new Map<number, Priority>(
      priorities.map((p) => [p.issueNumber, p.priority]),
    );

    for (const issue of issues) {
      const priority = priorityMap.get(issue.number) ?? "normal";
      let section: "in_focus" | "in_flight" | "shipped";

      if (issue.state === "closed") {
        section = "shipped";
      } else if (activeLaunchSet.has(issue.number)) {
        section = "in_flight";
      } else {
        section = "in_focus";
      }

      const item: UnifiedListItem = {
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

  // Sort each issue section by priority DESC then updatedAt DESC
  const sortIssues = (items: UnifiedListItem[]): UnifiedListItem[] =>
    items.slice().sort((a, b) => {
      if (a.kind !== "issue" || b.kind !== "issue") return 0;
      const aUpdated = new Date(a.issue.updatedAt).getTime();
      const bUpdated = new Date(b.issue.updatedAt).getTime();
      return compareByPriorityThenUpdatedAt(
        a.priority,
        aUpdated,
        b.priority,
        bUpdated,
      );
    });

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
): Promise<UnifiedList> {
  const drafts = listDrafts(db);
  const repos = listRepos(db);

  // Fetch issues for each tracked repo in parallel. Uses the existing
  // SWR cache in data/issues.ts, so cold-cache calls hit GitHub and
  // warm-cache calls return cached data with a subsequent background
  // refresh — we don't block on that refresh here.
  const perRepo: PerRepoData[] = await Promise.all(
    repos.map(async (repo) => {
      const { issues } = await getIssues(db, octokit, repo.owner, repo.name);
      const deployments = getDeploymentsByRepo(db, repo.id);
      const priorities = listPrioritiesForRepo(db, repo.id);
      return { repo, issues, deployments, priorities };
    }),
  );

  return groupIntoSections({ drafts, perRepo });
}
