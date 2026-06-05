"use client";

import { useMemo } from "react";
import { DashboardPresetStrip } from "./DashboardPresetStrip";
import { DashboardEmptyState, RepoDashboardSummary, RepoIssueHealth, dashboardIssueSummaryCounts } from "./DashboardStatusBlocks";
import { sortDashboardRepoRows } from "./dashboard-repo-ordering";
import { globalIssuePresetIdForState, globalIssuePresetState } from "./dashboard-presets";
import {
  dashboardIssueViewSummaries,
  filterDashboardIssues,
  repoMatchesDashboardView,
} from "./dashboard-issue-views";
import { DEFAULT_GLOBAL_ISSUE_URL_STATE, type GlobalIssueSortMode, type GlobalIssueStatusFilter } from "./dashboard-url-state";
import { useGlobalIssueDashboardUrlState } from "./dashboard-url-state-hooks";
import { deploymentForIssue } from "./workbench-selectors";
import type { WorkbenchDeployment, WorkbenchIssueSummary, WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type Props = {
  repos: WorkbenchRepo[];
  onSelectIssue: (repoId: number, issueNumber: number) => void;
  onJumpToSession: (deploymentId: number) => void;
  onRefresh: () => void;
  refreshPending: boolean;
  refreshError: string | null;
};

const STATUS_FILTERS: Array<{ id: GlobalIssueStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "running", label: "Running" },
  { id: "closed", label: "Closed" },
];

const SORT_MODES: Array<{ id: GlobalIssueSortMode; label: string }> = [
  { id: "updated", label: "Updated" },
  { id: "priority", label: "Priority" },
];

const PRIORITY_RANK: Record<WorkbenchIssueSummary["priority"], number> = {
  high: 0,
  normal: 1,
  low: 2,
};

export function GlobalIssuesFocus({
  repos,
  onSelectIssue,
  onJumpToSession,
  onRefresh,
  refreshPending,
  refreshError,
}: Props) {
  const [urlState, setUrlState] = useGlobalIssueDashboardUrlState();
  const { query, status: statusFilter, sort: sortMode, view: issueView } = urlState;
  const totalIssues = repos.reduce((count, repo) => count + repo.issues.length, 0);
  const failedRepos = repos.filter((repo) => repo.issueError).length;
  const cachedRepos = repos.filter((repo) => repo.issuesFromCache).length;
  const viewSummaries = useMemo(() => dashboardIssueViewSummaries(repos), [repos]);
  const repoRows = useMemo(
    () => sortDashboardRepoRows(
      repos.filter((repo) => repoMatchesDashboardView(repo, issueView)).map((repo) => ({
        repo,
        issues: sortIssues(
          filterDashboardIssues(repo, issueView).filter((issue) =>
            matchesIssue(repo, issue, query) && matchesStatus(repo, issue, statusFilter),
          ),
          sortMode,
        ),
      })),
      issueView,
      ({ repo, issues }) => dashboardIssueSummaryCounts(issues, (issue) =>
        issueStatus(issue, deploymentForIssue(repo, issue.number)) === "running"),
    ),
    [issueView, query, repos, sortMode, statusFilter],
  );
  const visibleIssues = repoRows.reduce((count, row) => count + row.issues.length, 0);
  const currentView = viewSummaries.find((view) => view.id === issueView);
  const activePresetId = globalIssuePresetIdForState(urlState);
  const hasDashboardFilters = query.trim() !== "" || statusFilter !== DEFAULT_GLOBAL_ISSUE_URL_STATE.status || sortMode !== DEFAULT_GLOBAL_ISSUE_URL_STATE.sort || issueView !== DEFAULT_GLOBAL_ISSUE_URL_STATE.view;

  return (
    <div className={styles.focusInner}>
      <p className={styles.kicker}>Issues</p>
      <h1>Global issues</h1>
      <p className={styles.muted}>
        {totalIssues === 0
          ? "No matching issues."
          : `${visibleIssues} shown in ${currentView?.label.toLowerCase() ?? "all"} view across ${repos.length} tracked repositories.`}
      </p>
      <DashboardPresetStrip
        activePresetId={activePresetId}
        ariaLabel="Global triage presets"
        onApply={(id) => setUrlState(globalIssuePresetState(id))}
      />
      <div aria-label="Global issue controls" className={styles.globalIssueControls}>
        <input
          aria-label="Search global issues"
          className={styles.workbenchSearchInput}
          type="search"
          value={query}
          placeholder="Search issue, repo, label, author, or number"
          onChange={(event) => setUrlState({ query: event.target.value })}
        />
        <div className={styles.compactButtonGroup} role="group" aria-label="Global issue status">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={statusFilter === item.id ? styles.primaryButton : styles.secondaryButton}
              aria-pressed={statusFilter === item.id}
              onClick={() => setUrlState({ status: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={styles.compactButtonGroup} role="group" aria-label="Global issue sort">
          {SORT_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={sortMode === item.id ? styles.primaryButton : styles.secondaryButton}
              aria-pressed={sortMode === item.id}
              onClick={() => setUrlState({ sort: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={styles.compactButtonGroup} role="group" aria-label="Operational issue views">
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
          description="Clear the dashboard filters to return to the full cross-repo issue list."
          onReset={() => setUrlState(DEFAULT_GLOBAL_ISSUE_URL_STATE)}
          title="No dashboard issues match these filters."
        />
      )}
      <div aria-label="Global issues">
        {repoRows.map(({ repo, issues }) => (
          <section key={repo.id} aria-label={`Issues for ${repo.owner}/${repo.name}`}>
            <h2>{repo.owner}/{repo.name}</h2>
            <RepoDashboardSummary
              repo={repo}
              {...dashboardIssueSummaryCounts(
                issues,
                (issue) => issueStatus(issue, deploymentForIssue(repo, issue.number)) === "running",
              )}
            />
            <RepoIssueHealth repo={repo} />
            {issues.length === 0 ? (
              <p className={styles.muted}>No matching issues.</p>
            ) : (
              <div className={styles.issueList}>
                {issues.map((issue) => (
                  <GlobalIssueRow
                    key={issue.number}
                    issue={issue}
                    repo={repo}
                    onSelectIssue={onSelectIssue}
                    onJumpToSession={onJumpToSession}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function GlobalIssueRow({
  issue,
  repo,
  onSelectIssue,
  onJumpToSession,
}: {
  issue: WorkbenchIssueSummary;
  repo: WorkbenchRepo;
  onSelectIssue: (repoId: number, issueNumber: number) => void;
  onJumpToSession: (deploymentId: number) => void;
}) {
  const deployment = deploymentForIssue(repo, issue.number);
  const status = issueStatus(issue, deployment);
  const openIssue = () => onSelectIssue(repo.id, issue.number);

  return (
    <article
      className={styles.issueCard}
      data-status={status}
      aria-label={`${repo.owner}/${repo.name} issue #${issue.number}`}
    >
      <div className={styles.issueCardHead}>
        <strong>#{issue.number}</strong>
        <span className={styles.issueChip} data-card-chip="status" data-status={status}>{status}</span>
        <span className={styles.issueChip} data-card-chip="priority">{issue.priority}</span>
      </div>
      <h3>{issue.title}</h3>
      <p className={styles.issueCardMeta}>
        {repo.owner}/{repo.name} · updated {formatAge(issue.updatedAt)}
        {issue.authorLogin ? ` · ${issue.authorLogin}` : ""}
      </p>
      <div className={styles.issueActions}>
        {deployment ? (
          <button type="button" onClick={() => onJumpToSession(deployment.id)}>
            Jump to session
          </button>
        ) : (
          <button type="button" onClick={openIssue}>
            {issue.state === "closed" ? "Open issue" : "Prepare launch"}
          </button>
        )}
      </div>
    </article>
  );
}

function sortIssues(
  issues: WorkbenchIssueSummary[],
  sortMode: GlobalIssueSortMode,
): WorkbenchIssueSummary[] {
  return [...issues].sort((left, right) => {
    if (sortMode === "priority") {
      const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
      if (priorityDelta !== 0) return priorityDelta;
    }
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || right.number - left.number;
  });
}

function matchesStatus(
  repo: WorkbenchRepo,
  issue: WorkbenchIssueSummary,
  statusFilter: GlobalIssueStatusFilter,
): boolean {
  if (statusFilter === "all") return true;
  return issueStatus(issue, deploymentForIssue(repo, issue.number)) === statusFilter;
}

function issueStatus(
  issue: WorkbenchIssueSummary,
  deployment: WorkbenchDeployment | null,
): Exclude<GlobalIssueStatusFilter, "all"> {
  if (issue.state === "closed") return "closed";
  return deployment || issue.hasActiveDeployment ? "running" : "open";
}

function matchesIssue(
  repo: WorkbenchRepo,
  issue: WorkbenchIssueSummary,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const fullRepo = `${repo.owner}/${repo.name}`;
  const issueNumber = String(issue.number);
  const haystack = [
    repo.owner,
    repo.name,
    fullRepo,
    `${repo.name}#${issue.number}`,
    `${fullRepo}#${issue.number}`,
    `#${issue.number}`,
    issueNumber,
    issue.title,
    issue.state,
    issue.priority,
    issue.authorLogin ?? "",
    ...issue.labels,
  ].join(" ").toLowerCase();

  return query.split(/\s+/).every((term) => haystack.includes(term));
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
