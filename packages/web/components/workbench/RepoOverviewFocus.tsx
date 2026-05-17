import type { WorkbenchHealth, WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type Props = {
  repo: WorkbenchRepo;
  health: WorkbenchHealth;
  onRefresh: () => void;
  onOpenRepoSetup: () => void;
};

export function RepoOverviewFocus({
  repo,
  health,
  onRefresh,
  onOpenRepoSetup,
}: Props) {
  return (
    <div className={styles.focusInner}>
      <p className={styles.kicker}>Workbench</p>
      <h1>{repo.owner}/{repo.name}</h1>
      <p className={styles.muted}>Select a session or issue to open its focused workspace.</p>

      <div className={styles.overviewGrid} aria-label="Repo health summary">
        <div>
          <span className={styles.summaryValue}>{repo.deployments.length}</span>
          <span className={styles.summaryLabel}>active sessions</span>
        </div>
        <div>
          <span className={styles.summaryValue}>{repo.issues.length}</span>
          <span className={styles.summaryLabel}>issues loaded</span>
        </div>
        <div>
          <span className={styles.summaryValue}>{health.ok ? "ok" : "error"}</span>
          <span className={styles.summaryLabel}>workbench health</span>
        </div>
      </div>

      {!repo.localPath && (
        <div className={styles.notice}>
          <strong>Set up local path</strong>
          <p>This repo needs a local path before worktree and terminal workflows are available.</p>
          <button type="button" className={styles.secondaryButton} onClick={onOpenRepoSetup}>
            Open repo setup
          </button>
        </div>
      )}

      {repo.issueError && (
        <div className={styles.notice} role="alert">
          <strong>Issues failed to load</strong>
          <p>{repo.owner}/{repo.name}: {repo.issueError}</p>
        </div>
      )}

      <div className={styles.overviewActions}>
        <button type="button" className={styles.primaryButton} onClick={onRefresh}>
          Refresh
        </button>
        <button type="button" className={styles.secondaryButton} disabled>
          New shell unavailable
        </button>
      </div>
    </div>
  );
}
