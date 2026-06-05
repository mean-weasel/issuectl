import type { DashboardIssueView } from "./dashboard-issue-views";
import type { RepoDashboardSummaryCounts } from "./DashboardStatusBlocks";
import type { WorkbenchRepo } from "./workbench-types";

export type DashboardRepoOrderInput = {
  repo: WorkbenchRepo;
  summary: RepoDashboardSummaryCounts;
};

export function sortDashboardRepoRows<T extends { repo: WorkbenchRepo }>(
  rows: T[],
  view: DashboardIssueView,
  summaryForRow: (row: T) => RepoDashboardSummaryCounts,
): T[] {
  return [...rows].sort((left, right) =>
    compareDashboardRepoOrder(
      { repo: left.repo, summary: summaryForRow(left) },
      { repo: right.repo, summary: summaryForRow(right) },
      view,
    ),
  );
}

export function compareDashboardRepoOrder(
  left: DashboardRepoOrderInput,
  right: DashboardRepoOrderInput,
  view: DashboardIssueView,
): number {
  for (const delta of dashboardRepoSortDeltas(left, right, view)) {
    if (delta !== 0) return delta;
  }
  return repoName(left.repo).localeCompare(repoName(right.repo));
}

function dashboardRepoSortDeltas(
  left: DashboardRepoOrderInput,
  right: DashboardRepoOrderInput,
  view: DashboardIssueView,
): number[] {
  if (view === "errors") return [booleanDelta(left.repo.issueError, right.repo.issueError)];
  if (view === "cached") return [booleanDelta(left.repo.issuesFromCache, right.repo.issuesFromCache)];
  if (view === "running") return [countDelta(left.summary.runningCount, right.summary.runningCount)];
  return [
    countDelta(left.summary.highPriorityCount, right.summary.highPriorityCount),
    countDelta(left.summary.runningCount, right.summary.runningCount),
    countDelta(left.summary.visibleCount, right.summary.visibleCount),
  ];
}

function booleanDelta(left: unknown, right: unknown): number {
  return Number(Boolean(right)) - Number(Boolean(left));
}

function countDelta(left: number, right: number): number {
  return right - left;
}

function repoName(repo: WorkbenchRepo): string {
  return `${repo.owner}/${repo.name}`;
}
