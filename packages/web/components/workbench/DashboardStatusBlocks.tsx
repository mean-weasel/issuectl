import type { WorkbenchIssueSummary, WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type DashboardEmptyStateProps = {
  buttonLabel: string;
  canReset: boolean;
  description: string;
  onReset: () => void;
  title: string;
};

export type RepoDashboardSummaryCounts = {
  highPriorityCount: number;
  runningCount: number;
  visibleCount: number;
};

export function DashboardEmptyState({
  buttonLabel,
  canReset,
  description,
  onReset,
  title,
}: DashboardEmptyStateProps) {
  return (
    <div className={styles.dashboardEmptyState} role="status">
      <strong>{title}</strong>
      <span>{description}</span>
      {canReset && (
        <button type="button" className={styles.secondaryButton} onClick={onReset}>
          {buttonLabel}
        </button>
      )}
    </div>
  );
}

export function RepoIssueHealth({ repo, showCache = true }: { repo: WorkbenchRepo; showCache?: boolean }) {
  if (!repo.issueError && !(showCache && repo.issuesFromCache)) return null;

  return (
    <div className={styles.repoIssueHealth} role={repo.issueError ? "alert" : "status"}>
      {repo.issueError && <span>Issue fetch failed: {repo.issueError}</span>}
      {showCache && repo.issuesFromCache && (
        <span>Showing cached issues{repo.issuesCachedAt ? ` from ${formatAge(repo.issuesCachedAt)}` : ""}</span>
      )}
    </div>
  );
}

export function RepoDashboardSummary({
  highPriorityCount,
  hideZeroCounts = false,
  repo,
  runningCount,
  visibleCount,
}: RepoDashboardSummaryCounts & { hideZeroCounts?: boolean; repo: WorkbenchRepo }) {
  return (
    <div className={styles.repoIssueSummary} aria-label={`Dashboard summary for ${repo.owner}/${repo.name}`}>
      <span className={styles.repoIssueSummaryChip}>{visibleCount} visible</span>
      {(!hideZeroCounts || runningCount > 0) && (
        <span className={styles.repoIssueSummaryChip}>{runningCount} running</span>
      )}
      {(!hideZeroCounts || highPriorityCount > 0) && (
        <span className={styles.repoIssueSummaryChip}>{highPriorityCount} high priority</span>
      )}
      {repo.issuesFromCache && (
        <span className={styles.repoIssueSummaryChip} data-tone="cache">cached</span>
      )}
      {repo.issueError && (
        <span className={styles.repoIssueSummaryChip} data-tone="error">fetch failed</span>
      )}
    </div>
  );
}

export function dashboardIssueSummaryCounts(
  issues: WorkbenchIssueSummary[],
  isRunning: (issue: WorkbenchIssueSummary) => boolean,
): RepoDashboardSummaryCounts {
  return issues.reduce<RepoDashboardSummaryCounts>(
    (summary, issue) => ({
      highPriorityCount: summary.highPriorityCount + (issue.priority === "high" ? 1 : 0),
      runningCount: summary.runningCount + (isRunning(issue) ? 1 : 0),
      visibleCount: summary.visibleCount + 1,
    }),
    { highPriorityCount: 0, runningCount: 0, visibleCount: 0 },
  );
}

function formatAge(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "recently";
  const elapsedMs = Date.now() - timestamp;
  const elapsedHours = Math.max(0, Math.floor(elapsedMs / 3_600_000));
  if (elapsedHours < 1) return "just now";
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}
