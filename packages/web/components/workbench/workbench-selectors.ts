import type {
  WorkbenchDeployment,
  WorkbenchIssueSummary,
  WorkbenchPayload,
  WorkbenchPreview,
  WorkbenchRepo,
} from "./workbench-types";
import type { IssueQueueFilter, SessionSortMode, WorkbenchSelectionState } from "./workbench-state";

const PREVIEW_STATUS_RANK: Record<WorkbenchPreview["status"], number> = {
  active: 0,
  error: 1,
  unavailable: 2,
  idle: 3,
};

export function selectedRepo(
  payload: WorkbenchPayload | null,
  state: WorkbenchSelectionState,
): WorkbenchRepo | null {
  if (!payload || state.selectedRepoId === null) return null;
  return payload.repos.find((repo) => repo.id === state.selectedRepoId) ?? null;
}

export function selectedDeployment(
  payload: WorkbenchPayload | null,
  state: WorkbenchSelectionState,
): WorkbenchDeployment | null {
  if (!payload || state.selectedDeploymentId === null) return null;
  return payload.deployments.find((deployment) => deployment.id === state.selectedDeploymentId) ?? null;
}

export function sortDeploymentSessions(
  deployments: WorkbenchDeployment[],
  previews: Record<string, WorkbenchPreview>,
  sortMode: SessionSortMode,
): WorkbenchDeployment[] {
  return [...deployments].sort((left, right) => {
    if (sortMode === "recent") {
      return compareTimestampDesc(left.launchedAt, right.launchedAt) || compareDeploymentTie(left, right);
    }

    if (sortMode === "kind") {
      return compareDeploymentTie(left, right);
    }

    return (
      previewRank(left, previews) - previewRank(right, previews)
      || compareTimestampDesc(left.launchedAt, right.launchedAt)
      || compareDeploymentTie(left, right)
    );
  });
}

export function previewForDeployment(
  deployment: WorkbenchDeployment,
  previews: Record<string, WorkbenchPreview>,
): WorkbenchPreview | null {
  if (deployment.ttydPort === null) return null;
  return previews[String(deployment.ttydPort)] ?? null;
}

export function issueQueueCounts(repo: WorkbenchRepo): Record<IssueQueueFilter, number> {
  return {
    open: repo.issues.filter((issue) => issue.state === "open").length,
    running: repo.issues.filter((issue) => issue.state === "open" && issue.hasActiveDeployment).length,
    closed: repo.issues.filter((issue) => issue.state === "closed").length,
  };
}

export function filterIssueQueue(
  issues: WorkbenchIssueSummary[],
  filter: IssueQueueFilter,
): WorkbenchIssueSummary[] {
  return issues.filter((issue) => {
    if (filter === "closed") return issue.state === "closed";
    if (filter === "running") return issue.state === "open" && issue.hasActiveDeployment;
    return issue.state === "open";
  });
}

export function deploymentForIssue(
  repo: WorkbenchRepo,
  issueNumber: number,
): WorkbenchDeployment | null {
  return repo.deployments.find((deployment) => deployment.issueNumber === issueNumber) ?? null;
}

export function repoRailBadgeCount(repo: WorkbenchRepo): number {
  return repo.deployments.length;
}

export function compactRepoInitials(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (!cleaned) return "?";
  if (cleaned.length <= 3 && !cleaned.includes(" ")) {
    return cleaned.toUpperCase();
  }

  const chunks = cleaned.match(/issue|bug|drop|ctl|api|web|app|server|client|[a-zA-Z0-9]+/gi)
    ?? [cleaned];
  if (chunks.length > 1) {
    return chunks.slice(0, 2).map((chunk) => chunk[0]).join("").toUpperCase();
  }

  return cleaned.slice(0, 2).toUpperCase();
}

function previewRank(
  deployment: WorkbenchDeployment,
  previews: Record<string, WorkbenchPreview>,
): number {
  const preview = previewForDeployment(deployment, previews);
  return preview ? PREVIEW_STATUS_RANK[preview.status] : PREVIEW_STATUS_RANK.unavailable;
}

function compareTimestampDesc(left: string, right: string): number {
  return Date.parse(right) - Date.parse(left);
}

function compareDeploymentTie(left: WorkbenchDeployment, right: WorkbenchDeployment): number {
  return left.issueNumber - right.issueNumber || left.id - right.id;
}
