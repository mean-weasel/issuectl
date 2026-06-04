import type { WorkbenchDeployment, WorkbenchIssueSummary, WorkbenchRepo } from "./workbench-types";

export type DashboardIssueView = "all" | "attention" | "running" | "cached" | "errors";

export const DASHBOARD_ISSUE_VIEWS: Array<{ id: DashboardIssueView; label: string }> = [
  { id: "all", label: "All" },
  { id: "attention", label: "Attention" },
  { id: "running", label: "Running" },
  { id: "cached", label: "Cached" },
  { id: "errors", label: "Errors" },
];

export function dashboardIssueViewSummaries(
  repos: WorkbenchRepo[],
  deployments: WorkbenchDeployment[] = [],
): Array<{ id: DashboardIssueView; label: string; count: number }> {
  return DASHBOARD_ISSUE_VIEWS.map((view) => ({
    ...view,
    count: countDashboardIssueView(repos, view.id, deployments),
  }));
}

export function filterDashboardIssues(
  repo: WorkbenchRepo,
  view: DashboardIssueView,
  deployments: WorkbenchDeployment[] = [],
): WorkbenchIssueSummary[] {
  return repo.issues.filter((issue) => issueMatchesDashboardView(repo, issue, view, deployments));
}

export function repoMatchesDashboardView(
  repo: WorkbenchRepo,
  view: DashboardIssueView,
  deployments: WorkbenchDeployment[] = [],
): boolean {
  if (view === "all") return true;
  if (view === "errors") return Boolean(repo.issueError);
  if (view === "cached") return repo.issuesFromCache;
  if (view === "attention") {
    return Boolean(repo.issueError) || filterDashboardIssues(repo, view, deployments).length > 0;
  }
  return filterDashboardIssues(repo, view, deployments).length > 0;
}

export function issueMatchesDashboardView(
  repo: WorkbenchRepo,
  issue: WorkbenchIssueSummary,
  view: DashboardIssueView,
  deployments: WorkbenchDeployment[] = [],
): boolean {
  if (view === "all") return true;
  if (view === "running") return isDashboardIssueRunning(repo, issue, deployments);
  if (view === "cached") return repo.issuesFromCache;
  if (view === "errors") return false;
  return issue.priority === "high" || repo.issuesFromCache;
}

export function isDashboardIssueRunning(
  repo: WorkbenchRepo,
  issue: WorkbenchIssueSummary,
  deployments: WorkbenchDeployment[] = [],
): boolean {
  return issue.hasActiveDeployment || Boolean(deploymentForDashboardIssue(repo, issue, deployments));
}

function countDashboardIssueView(
  repos: WorkbenchRepo[],
  view: DashboardIssueView,
  deployments: WorkbenchDeployment[],
): number {
  if (view === "errors") return repos.filter((repo) => repo.issueError).length;
  return repos.reduce((count, repo) => {
    const repoSignal = view === "attention" && repo.issueError ? 1 : 0;
    return count + repoSignal + filterDashboardIssues(repo, view, deployments).length;
  }, 0);
}

function deploymentForDashboardIssue(
  repo: WorkbenchRepo,
  issue: WorkbenchIssueSummary,
  deployments: WorkbenchDeployment[],
): WorkbenchDeployment | null {
  return repo.deployments.find((deployment) => deploymentTargetsIssue(deployment, issue.number))
    ?? deployments.find((deployment) => deployment.repoId === repo.id && deploymentTargetsIssue(deployment, issue.number))
    ?? null;
}

function deploymentTargetsIssue(deployment: WorkbenchDeployment, issueNumber: number): boolean {
  if ((deployment.targetType ?? "issue") !== "issue") return false;
  return (deployment.targetNumber ?? deployment.issueNumber) === issueNumber;
}
