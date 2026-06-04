import { useMemo } from "react";
import {
  dashboardIssueViewSummaries,
  filterDashboardIssues,
  isDashboardIssueRunning,
  repoMatchesDashboardView,
  type DashboardIssueView,
} from "./dashboard-issue-views";
import {
  type BoardSortMode,
} from "./dashboard-url-state";
import { useBoardDashboardUrlState } from "./dashboard-url-state-hooks";
import type { WorkbenchDeployment, WorkbenchIssueSummary, WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type Props = {
  repos: WorkbenchRepo[];
  deployments: WorkbenchDeployment[];
  onSelectIssue: (repoId: number, issueNumber: number) => void;
  onJumpToSession: (deploymentId: number) => void;
  onRefresh: () => void;
  refreshPending: boolean;
  refreshError: string | null;
};

const PRIORITY_RANK: Record<WorkbenchIssueSummary["priority"], number> = {
  high: 0,
  normal: 1,
  low: 2,
};

export function BoardFocus({
  repos,
  deployments,
  onSelectIssue,
  onJumpToSession,
  onRefresh,
  refreshPending,
  refreshError,
}: Props) {
  const [urlState, setUrlState] = useBoardDashboardUrlState();
  const { query, runningOnly, sort: sortMode, view: issueView } = urlState;
  const failedRepos = repos.filter((repo) => repo.issueError).length;
  const cachedRepos = repos.filter((repo) => repo.issuesFromCache).length;
  const viewSummaries = useMemo(() => dashboardIssueViewSummaries(repos, deployments), [deployments, repos]);
  const visibleRepos = useMemo(
    () => repos.filter((repo) => repoMatchesDashboardView(repo, issueView, deployments)),
    [deployments, issueView, repos],
  );
  const visibleIssues = useMemo(
    () =>
      visibleRepos.reduce(
        (count, repo) => count + boardIssues(repo, deployments, runningOnly, sortMode, query, issueView).length,
        0,
      ),
    [deployments, issueView, query, runningOnly, sortMode, visibleRepos],
  );
  const currentView = viewSummaries.find((view) => view.id === issueView);

  return (
    <div className={`${styles.focusInner} ${styles.boardFocus}`}>
      <p className={styles.kicker}>Board</p>
      <h1>Cross-repo board</h1>
      <p className={styles.muted}>
        {visibleIssues} {runningOnly ? "running" : "open"} issues in {currentView?.label.toLowerCase() ?? "all"} view across {repos.length} tracked repositories.
      </p>

      <div aria-label="Board controls" className={styles.boardControls}>
        <input
          aria-label="Search board issues"
          className={styles.workbenchSearchInput}
          type="search"
          value={query}
          placeholder="Search issue, repo, label, author, or number"
          onChange={(event) => setUrlState({ query: event.target.value })}
        />
        <button
          type="button"
          className={runningOnly ? styles.primaryButton : styles.secondaryButton}
          aria-pressed={runningOnly}
          onClick={() => setUrlState({ runningOnly: !runningOnly })}
        >
          Show running only
        </button>
        <button
          type="button"
          className={sortMode === "payload" ? styles.primaryButton : styles.secondaryButton}
          aria-pressed={sortMode === "payload"}
          onClick={() => setUrlState({ sort: "payload" })}
        >
          Payload order
        </button>
        <button
          type="button"
          className={sortMode === "priority" ? styles.primaryButton : styles.secondaryButton}
          aria-pressed={sortMode === "priority"}
          onClick={() => setUrlState({ sort: "priority" })}
        >
          Sort by priority
        </button>
        <div className={styles.compactButtonGroup} role="group" aria-label="Board operational views">
          {viewSummaries.map((item) => (
            <button
              key={item.id}
              type="button"
              className={issueView === item.id ? styles.primaryButton : styles.secondaryButton}
              aria-pressed={issueView === item.id}
              onClick={() => setUrlState({ view: item.id })}
            >
              {item.label} {item.count}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onRefresh}
          disabled={refreshPending}
        >
          {refreshPending ? "Refreshing" : "Refresh"}
        </button>
      </div>
      {(failedRepos > 0 || cachedRepos > 0 || refreshError) && (
        <div className={styles.globalIssueStatus} role={refreshError ? "alert" : "status"}>
          {failedRepos > 0 && <span>{failedRepos} repo issue fetch failed</span>}
          {cachedRepos > 0 && <span>{cachedRepos} repo issue lists from cache</span>}
          {refreshError && <span>Refresh failed: {refreshError}</span>}
        </div>
      )}

      <div aria-label="Cross-repo board" className={styles.boardScroll} role="region" tabIndex={0}>
        {visibleRepos.map((repo) => {
          const issues = boardIssues(repo, deployments, runningOnly, sortMode, query, issueView);
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
              <RepoIssueHealth repo={repo} />
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
                    onJumpToSession={onJumpToSession}
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
  onJumpToSession,
}: {
  issue: WorkbenchIssueSummary;
  repo: WorkbenchRepo;
  deployments: WorkbenchDeployment[];
  onSelectIssue: (repoId: number, issueNumber: number) => void;
  onJumpToSession: (deploymentId: number) => void;
}) {
  const deployment = deploymentForBoardIssue(repo, deployments, issue);
  const isRunning = Boolean(deployment) || issue.hasActiveDeployment;
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
        {deployment ? (
          <button type="button" onClick={() => onJumpToSession(deployment.id)}>
            Jump to session
          </button>
        ) : (
          <button type="button" onClick={() => onSelectIssue(repo.id, issue.number)}>
            Prepare launch
          </button>
        )}
      </div>
    </article>
  );
}

function boardIssues(
  repo: WorkbenchRepo,
  deployments: WorkbenchDeployment[],
  runningOnly: boolean,
  sortMode: BoardSortMode,
  query: string,
  issueView: DashboardIssueView,
): WorkbenchIssueSummary[] {
  const visibleIssues = filterDashboardIssues(repo, issueView, deployments).filter((issue) =>
    issue.state === "open"
    && matchesBoardIssue(repo, issue, query)
    && (!runningOnly || isRunningIssue(repo, deployments, issue)),
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
  return isDashboardIssueRunning(repo, issue, deployments);
}

function deploymentForBoardIssue(
  repo: WorkbenchRepo,
  deployments: WorkbenchDeployment[],
  issue: WorkbenchIssueSummary,
): WorkbenchDeployment | null {
  return repo.deployments.find((deployment) => deployment.issueNumber === issue.number)
    ?? deployments.find((deployment) => deployment.repoId === repo.id && deployment.issueNumber === issue.number)
    ?? null;
}

function RepoIssueHealth({ repo }: { repo: WorkbenchRepo }) {
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

function matchesBoardIssue(
  repo: WorkbenchRepo,
  issue: WorkbenchIssueSummary,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const fullRepo = `${repo.owner}/${repo.name}`;
  const haystack = [
    repo.owner,
    repo.name,
    fullRepo,
    `${repo.name}#${issue.number}`,
    `${fullRepo}#${issue.number}`,
    `#${issue.number}`,
    String(issue.number),
    issue.title,
    issue.priority,
    issue.authorLogin ?? "",
    ...issue.labels,
  ].join(" ").toLowerCase();

  return query.split(/\s+/).every((term) => haystack.includes(term));
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
