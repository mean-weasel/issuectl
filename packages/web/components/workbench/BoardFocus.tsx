import { useMemo } from "react";
import { DashboardPresetStrip } from "./DashboardPresetStrip";
import { DashboardEmptyState, RepoDashboardSummary, RepoIssueHealth, dashboardIssueSummaryCounts } from "./DashboardStatusBlocks";
import { sortDashboardRepoRows } from "./dashboard-repo-ordering";
import { boardPresetIdForState, boardPresetState } from "./dashboard-presets";
import {
  dashboardIssueViewSummaries,
  filterDashboardIssues,
  isDashboardIssueRunning,
  repoMatchesDashboardView,
  type DashboardIssueView,
} from "./dashboard-issue-views";
import { DEFAULT_BOARD_URL_STATE, type BoardSortMode } from "./dashboard-url-state";
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
  const [urlState, setUrlState, defaultControls] = useBoardDashboardUrlState();
  const { query, runningOnly, sort: sortMode, view: issueView } = urlState;
  const failedRepos = repos.filter((repo) => repo.issueError).length;
  const cachedRepos = repos.filter((repo) => repo.issuesFromCache).length;
  const viewSummaries = useMemo(() => dashboardIssueViewSummaries(repos, deployments), [deployments, repos]);
  const visibleRows = useMemo(
    () => sortDashboardRepoRows(
      repos.filter((repo) => repoMatchesDashboardView(repo, issueView, deployments)).map((repo) => ({
        repo,
        issues: boardIssues(repo, deployments, runningOnly, sortMode, query, issueView),
      })),
      issueView,
      ({ repo, issues }) => dashboardIssueSummaryCounts(issues, (issue) => isRunningIssue(repo, deployments, issue)),
    ),
    [deployments, issueView, query, repos, runningOnly, sortMode],
  );
  const visibleIssues = useMemo(
    () => visibleRows.reduce((count, row) => count + row.issues.length, 0),
    [visibleRows],
  );
  const currentView = viewSummaries.find((view) => view.id === issueView);
  const activePresetId = boardPresetIdForState(urlState);
  const hasDashboardFilters = query.trim() !== "" || runningOnly !== DEFAULT_BOARD_URL_STATE.runningOnly || sortMode !== DEFAULT_BOARD_URL_STATE.sort || issueView !== DEFAULT_BOARD_URL_STATE.view;

  return (
    <div className={`${styles.focusInner} ${styles.boardFocus}`}>
      <p className={styles.kicker}>Board</p>
      <h1>Cross-repo board</h1>
      <p className={styles.muted}>
        {visibleIssues} {runningOnly ? "running" : "open"} issues in {currentView?.label.toLowerCase() ?? "all"} view across {repos.length} tracked repositories.
      </p>
      <DashboardPresetStrip
        activePresetId={activePresetId}
        ariaLabel="Board triage presets" onApply={(id) => setUrlState(boardPresetState(id))}
        defaultPresetId={defaultControls.defaultPresetId} onSetDefault={defaultControls.setDefaultPresetId}
      />
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
      {visibleIssues === 0 && (
        <DashboardEmptyState
          buttonLabel="Clear dashboard filters"
          canReset={hasDashboardFilters}
          description="Clear the dashboard filters to return to the full cross-repo board."
          onReset={defaultControls.resetDashboardFilters}
          title="No board issues match these filters."
        />
      )}

      <div aria-label="Cross-repo board" className={styles.boardScroll} role="region" tabIndex={0}>
        {visibleRows.map(({ repo, issues }) => {
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
              <RepoDashboardSummary
                repo={repo}
                {...dashboardIssueSummaryCounts(issues, (issue) => isRunningIssue(repo, deployments, issue))}
              />
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
