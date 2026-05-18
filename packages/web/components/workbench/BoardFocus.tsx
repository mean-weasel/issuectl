import { useMemo, useState } from "react";
import type { WorkbenchDeployment, WorkbenchIssueSummary, WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type BoardSortMode = "payload" | "priority";

type Props = {
  repos: WorkbenchRepo[];
  deployments: WorkbenchDeployment[];
  onSelectIssue: (repoId: number, issueNumber: number) => void;
};

const PRIORITY_RANK: Record<WorkbenchIssueSummary["priority"], number> = {
  high: 0,
  normal: 1,
  low: 2,
};

export function BoardFocus({ repos, deployments, onSelectIssue }: Props) {
  const [runningOnly, setRunningOnly] = useState(false);
  const [sortMode, setSortMode] = useState<BoardSortMode>("payload");
  const visibleIssues = useMemo(
    () =>
      repos.reduce(
        (count, repo) => count + boardIssues(repo, deployments, runningOnly, sortMode).length,
        0,
      ),
    [deployments, repos, runningOnly, sortMode],
  );

  return (
    <div className={`${styles.focusInner} ${styles.boardFocus}`}>
      <p className={styles.kicker}>Board</p>
      <h1>Cross-repo board</h1>
      <p className={styles.muted}>
        {visibleIssues} {runningOnly ? "running" : "open"} issues across {repos.length} tracked repositories.
      </p>

      <div aria-label="Board controls" className={styles.boardControls}>
        <button
          type="button"
          className={runningOnly ? styles.primaryButton : styles.secondaryButton}
          aria-pressed={runningOnly}
          onClick={() => setRunningOnly((current) => !current)}
        >
          Show running only
        </button>
        <button
          type="button"
          className={sortMode === "payload" ? styles.primaryButton : styles.secondaryButton}
          aria-pressed={sortMode === "payload"}
          onClick={() => setSortMode("payload")}
        >
          Payload order
        </button>
        <button
          type="button"
          className={sortMode === "priority" ? styles.primaryButton : styles.secondaryButton}
          aria-pressed={sortMode === "priority"}
          onClick={() => setSortMode("priority")}
        >
          Sort by priority
        </button>
      </div>

      <div aria-label="Cross-repo board" className={styles.boardScroll} role="region" tabIndex={0}>
        {repos.map((repo) => {
          const issues = boardIssues(repo, deployments, runningOnly, sortMode);
          return (
            <section
              key={repo.id}
              aria-label={`Board column ${repo.owner}/${repo.name}`}
              className={styles.boardColumn}
            >
              <header>
                <h2>{repo.owner}/{repo.name}</h2>
                <p className={`${styles.muted} ${styles.boardColumnMeta}`}>
                  {issues.length} {runningOnly ? "running" : "open"}
                </p>
              </header>
              {issues.length === 0 ? (
                <p className={styles.muted}>No matching issues.</p>
              ) : (
                issues.map((issue) => (
                  <BoardCard
                    key={issue.number}
                    issue={issue}
                    repo={repo}
                    deployments={deployments}
                    onSelectIssue={onSelectIssue}
                  />
                ))
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({
  issue,
  repo,
  deployments,
  onSelectIssue,
}: {
  issue: WorkbenchIssueSummary;
  repo: WorkbenchRepo;
  deployments: WorkbenchDeployment[];
  onSelectIssue: (repoId: number, issueNumber: number) => void;
}) {
  const isRunning = isRunningIssue(repo, deployments, issue);
  const status = issue.state === "closed" ? "closed" : isRunning ? "running" : "open";

  return (
    <article
      className={styles.issueCard}
      data-status={status}
      data-priority={issue.priority}
      aria-label={`Board issue ${repo.owner}/${repo.name} #${issue.number}`}
    >
      <div className={styles.issueCardHead}>
        <strong>#{issue.number}</strong>
        <span className={styles.issueChip} data-card-chip="status" data-status={status}>{status}</span>
        <span className={styles.issueChip} data-card-chip="priority">{issue.priority}</span>
      </div>
      <h3>{issue.title}</h3>
      <p className={styles.issueCardMeta}>
        updated {formatAge(issue.updatedAt)}{isRunning ? " · active session" : ""}
      </p>
      <div className={styles.issueActions}>
        <button type="button" onClick={() => onSelectIssue(repo.id, issue.number)}>
          Open issue
        </button>
      </div>
    </article>
  );
}

function boardIssues(
  repo: WorkbenchRepo,
  deployments: WorkbenchDeployment[],
  runningOnly: boolean,
  sortMode: BoardSortMode,
): WorkbenchIssueSummary[] {
  const visibleIssues = repo.issues.filter((issue) =>
    issue.state === "open" && (!runningOnly || isRunningIssue(repo, deployments, issue)),
  );
  if (sortMode !== "priority") return visibleIssues;
  return [...visibleIssues].sort((left, right) => {
    const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (priorityDelta !== 0) return priorityDelta;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function isRunningIssue(
  repo: WorkbenchRepo,
  deployments: WorkbenchDeployment[],
  issue: WorkbenchIssueSummary,
): boolean {
  return issue.hasActiveDeployment
    || repo.deployments.some((deployment) => deployment.issueNumber === issue.number)
    || deployments.some((deployment) => deployment.repoId === repo.id && deployment.issueNumber === issue.number);
}

function formatAge(value: string): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "recently";
  const elapsedMs = Date.now() - timestamp;
  const elapsedHours = Math.max(0, Math.floor(elapsedMs / 3_600_000));
  if (elapsedHours < 1) return "just now";
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}
