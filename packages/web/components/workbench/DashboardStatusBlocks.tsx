import type { WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type DashboardEmptyStateProps = {
  buttonLabel: string;
  canReset: boolean;
  description: string;
  onReset: () => void;
  title: string;
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

export function RepoIssueHealth({ repo }: { repo: WorkbenchRepo }) {
  if (!repo.issueError && !repo.issuesFromCache) return null;

  return (
    <div className={styles.repoIssueHealth} role={repo.issueError ? "alert" : "status"}>
      {repo.issueError && <span>Issue fetch failed: {repo.issueError}</span>}
      {repo.issuesFromCache && (
        <span>Showing cached issues{repo.issuesCachedAt ? ` from ${formatAge(repo.issuesCachedAt)}` : ""}</span>
      )}
    </div>
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
