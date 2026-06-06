import { useMemo } from "react";
import { RepoPullsSummary, repoKey, useBoardPulls } from "./BoardPulls";
import { DashboardEmptyState, RepoIssueHealth, dashboardIssueSummaryCounts } from "./DashboardStatusBlocks";
import { sortDashboardRepoRows } from "./dashboard-repo-ordering";
import { DashboardRepoGroupingControls, DashboardRepoHeader, useDashboardRepoCollapse } from "./dashboard-repo-collapse";
import { DASHBOARD_PRESETS, boardPresetIdForState, boardPresetState, type DashboardPresetId } from "./dashboard-presets";
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
type BoardViewOption = "all" | "custom" | DashboardPresetId;

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
  const visibleIssues = visibleRows.reduce((count, row) => count + row.issues.length, 0);
  const allOpenIssues = repos.reduce((count, repo) => count + repo.issues.filter((issue) => issue.state === "open").length, 0);
  const currentView = viewSummaries.find((view) => view.id === issueView);
  const activePresetId = boardPresetIdForState(urlState);
  const boardViewValue: BoardViewOption = activePresetId ?? (issueView === "all" && !runningOnly ? "all" : "custom");
  const defaultPreset = DASHBOARD_PRESETS.find((preset) => preset.id === defaultControls.defaultPresetId);
  const hasDashboardFilters = query.trim() !== "" || runningOnly !== DEFAULT_BOARD_URL_STATE.runningOnly || sortMode !== DEFAULT_BOARD_URL_STATE.sort || issueView !== DEFAULT_BOARD_URL_STATE.view;
  const repoCollapse = useDashboardRepoCollapse("board", repos);
  const visibleRepos = useMemo(() => visibleRows.map(({ repo }) => repo), [visibleRows]);
  const repoPulls = useBoardPulls(visibleRepos);

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
        <select
          aria-label="Board view"
          className={styles.boardSelect}
          value={boardViewValue}
          onChange={(event) => {
            const value = event.target.value as BoardViewOption;
            if (value === "custom") return;
            setUrlState(value === "all" ? DEFAULT_BOARD_URL_STATE : boardPresetState(value));
          }}
        >
          <option value="all">All open {allOpenIssues}</option>
          {DASHBOARD_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
          {boardViewValue === "custom" && <option value="custom">Custom view</option>}
        </select>
        <details className={styles.boardOptions}>
          <summary>Board options</summary>
          <div className={styles.boardOptionsPanel}>
            <select
              aria-label="Sort board issues"
              className={styles.boardSelect}
              value={sortMode}
              onChange={(event) => setUrlState({ sort: event.target.value as BoardSortMode })}
            >
              <option value="payload">Payload order</option>
              <option value="priority">Priority order</option>
            </select>
            <DashboardRepoGroupingControls ariaLabel="Board repo grouping" collapse={repoCollapse} repos={visibleRows.map(({ repo }) => repo)} />
            <button type="button" className={styles.secondaryButton} onClick={onRefresh} disabled={refreshPending}>
              {refreshPending ? "Refreshing" : "Refresh"}
            </button>
            {activePresetId && (
              <button type="button" className={styles.secondaryButton} onClick={() => defaultControls.setDefaultPresetId(activePresetId)}>
                Set default view
              </button>
            )}
            {defaultPreset && (
              <button type="button" className={styles.secondaryButton} onClick={defaultControls.clearDefaultPresetId}>
                Clear default: {defaultPreset.label}
              </button>
            )}
          </div>
        </details>
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
          const collapsed = repoCollapse.isCollapsed(repo);
          const counts = dashboardIssueSummaryCounts(issues, (issue) => isRunningIssue(repo, deployments, issue));
          return (
            <section
              key={repo.id}
              aria-label={`Board column ${repo.owner}/${repo.name}`}
              className={styles.boardColumn}
            >
              <DashboardRepoHeader collapsed={collapsed} onToggle={() => repoCollapse.toggleRepo(repo)} repo={repo}>
                <div className={styles.boardColumnMeta} aria-label={`Board summary for ${repo.owner}/${repo.name}`}>
                  <span>{issues.length} {runningOnly ? "running" : "issues"}</span>
                  {counts.runningCount > 0 && <span>{counts.runningCount} running</span>}
                  {counts.highPriorityCount > 0 && <span>{counts.highPriorityCount} high</span>}
                  {repo.issuesFromCache && <span>cached</span>}
                  {repo.issueError && <span title={repo.issueError}>error</span>}
                  <RepoPullsSummary repo={repo} state={repoPulls[repoKey(repo)]} />
                </div>
              </DashboardRepoHeader>
              <RepoIssueHealth repo={repo} showCache={false} />
              {!collapsed && (
                <>
                  {issues.length === 0 ? <p className={styles.muted}>No matching issues.</p> : (
                    issues.map((issue) => (
                      <BoardCard
                        key={issue.number}
                        issue={issue} repo={repo} deployments={deployments}
                        onSelectIssue={onSelectIssue} onJumpToSession={onJumpToSession}
                      />
                    ))
                  )}
                </>
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
      className={`${styles.issueCard} ${styles.boardIssueCard}`}
      data-status={status}
      data-priority={issue.priority}
      aria-label={`Board issue ${repo.owner}/${repo.name} #${issue.number}`}
    >
      <div className={styles.issueCardHead}>
        <strong>#{issue.number}</strong>
        {status !== "open" && <span className={styles.issueChip} data-card-chip="status" data-status={status}>{status}</span>}
        {issue.priority === "high" && <span className={styles.issueChip} data-card-chip="priority">{issue.priority}</span>}
      </div>
      <h3>{issue.title}</h3>
      <p className={styles.issueCardMeta}>
        updated {formatAge(issue.updatedAt)}{isRunning ? " · active session" : ""}
      </p>
      <div className={styles.issueActions}>
        {deployment ? (
          <button type="button" aria-label="Jump to session" onClick={() => onJumpToSession(deployment.id)}>
            Jump
          </button>
        ) : (
          <button type="button" aria-label="Prepare launch" onClick={() => onSelectIssue(repo.id, issue.number)}>
            Prepare
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
  const elapsedHours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  if (elapsedHours < 1) return "just now";
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}
