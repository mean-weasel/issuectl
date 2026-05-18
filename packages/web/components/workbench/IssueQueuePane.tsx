import type { WorkbenchIssueSummary, WorkbenchRepo } from "./workbench-types";
import {
  type IssueQueueFilter,
  deploymentForIssue,
  filterIssueQueue,
  issueQueueCounts,
} from "./workbench-state";
import styles from "./WorkbenchShell.module.css";

type Props = {
  repo: WorkbenchRepo | null;
  filter: IssueQueueFilter;
  selectedIssueNumber: number | null;
  onFilterChange: (filter: IssueQueueFilter) => void;
  onSelectIssue: (issueNumber: number) => void;
  onJumpToSession: (deploymentId: number) => void;
  onCollapseDrawer: () => void;
};

const FILTERS: Array<{ id: IssueQueueFilter; label: string }> = [
  { id: "open", label: "Open work" },
  { id: "running", label: "Running" },
  { id: "closed", label: "Closed" },
];

export function IssueQueuePane({
  repo,
  filter,
  selectedIssueNumber,
  onFilterChange,
  onSelectIssue,
  onJumpToSession,
  onCollapseDrawer,
}: Props) {
  const counts = repo ? issueQueueCounts(repo) : { open: 0, running: 0, closed: 0 };
  const issues = repo ? filterIssueQueue(repo.issues, filter) : [];

  return (
    <div className={styles.issuePaneContent}>
      <div className={styles.paneHead}>
        <div className={styles.paneTitleRow}>
          <div>
            <p className={styles.kicker}>Queue</p>
            <h2>Issues</h2>
          </div>
          <button
            type="button"
            className={styles.paneCollapseButton}
            aria-label="Collapse issues drawer"
            title="Collapse issues drawer"
            onClick={onCollapseDrawer}
          >
            <span aria-hidden="true">&gt;</span>
          </button>
        </div>
        <p className={styles.queueSummary}>open work {counts.open}</p>
        <div className={styles.issueFilters} role="tablist" aria-label="Issue filters">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              data-active={filter === item.id ? "true" : undefined}
              onClick={() => onFilterChange(item.id)}
            >
              {item.label} {counts[item.id]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.issueList} aria-label="Repo issue queue">
        {!repo && <p className={styles.emptyPaneText}>No issue data loaded.</p>}
        {repo && issues.length === 0 && <p className={styles.emptyPaneText}>No issues in this filter.</p>}
        {repo && issues.map((issue) => (
          <IssueRow
            key={issue.number}
            issue={issue}
            repo={repo}
            selected={issue.number === selectedIssueNumber}
            onSelectIssue={onSelectIssue}
            onJumpToSession={onJumpToSession}
          />
        ))}
      </div>
    </div>
  );
}

function IssueRow({
  issue,
  repo,
  selected,
  onSelectIssue,
  onJumpToSession,
}: {
  issue: WorkbenchIssueSummary;
  repo: WorkbenchRepo;
  selected: boolean;
  onSelectIssue: (issueNumber: number) => void;
  onJumpToSession: (deploymentId: number) => void;
}) {
  const deployment = deploymentForIssue(repo, issue.number);
  const status = issue.state === "closed" ? "closed" : deployment ? "running" : "open";
  const openDetails = () => onSelectIssue(issue.number);

  return (
    <article
      className={styles.issueCard}
      data-selected={selected ? "true" : undefined}
      data-status={status}
      aria-label={`Issue #${issue.number}`}
      onClick={openDetails}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetails();
        }
      }}
      tabIndex={0}
    >
      <div className={styles.issueCardHead}>
        <strong>#{issue.number}</strong>
        <span className={styles.issueChip} data-card-chip="status" data-status={status}>{status}</span>
        <span className={styles.issueChip} data-card-chip="priority">{issue.priority}</span>
      </div>
      <h3>{issue.title}</h3>
      <p className={styles.issueCardMeta}>updated {formatAge(issue.updatedAt)}</p>
      <div className={styles.issueActions}>
        {deployment ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onJumpToSession(deployment.id);
            }}
          >
            Jump to session
          </button>
        ) : (
          <button
            type="button"
            disabled={issue.state === "closed"}
            onClick={(event) => {
              event.stopPropagation();
              onSelectIssue(issue.number);
            }}
          >
            Prepare launch
          </button>
        )}
      </div>
    </article>
  );
}

function formatAge(value: string): string {
  const updated = Date.parse(value);
  if (Number.isNaN(updated)) return value;
  const hours = Math.max(1, Math.round((Date.now() - updated) / 3_600_000));
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
