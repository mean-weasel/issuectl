import type { WorkbenchDeployment, WorkbenchRepo } from "./workbench-types";
import {
  type SessionSortMode,
  type WorkbenchSectionCollapseState,
  type WorkbenchSectionId,
  previewForDeployment,
  sortDeploymentSessions,
} from "./workbench-state";
import styles from "./WorkbenchShell.module.css";

type Props = {
  repo: WorkbenchRepo | null;
  selectedDeploymentId: number | null;
  sortMode: SessionSortMode;
  pendingDeploymentId: number | null;
  rowErrors: Record<number, string>;
  onSortChange: (mode: SessionSortMode) => void;
  onSelectDeployment: (deploymentId: number) => void;
  onReconnect: (deployment: WorkbenchDeployment) => void;
  onEnd: (deployment: WorkbenchDeployment) => void;
  collapsedSections: WorkbenchSectionCollapseState;
  onToggleSection: (section: WorkbenchSectionId) => void;
};

const SORT_MODES: SessionSortMode[] = ["running first", "recent", "kind"];

export function InstancePane({
  repo,
  selectedDeploymentId,
  sortMode,
  pendingDeploymentId,
  rowErrors,
  onSortChange,
  onSelectDeployment,
  onReconnect,
  onEnd,
  collapsedSections,
  onToggleSection,
}: Props) {
  const deployments = repo ? sortDeploymentSessions(repo.deployments, repo.previews, sortMode) : [];
  const issueSessionsCollapsed = collapsedSections.issueSessions;
  const namedShellsCollapsed = collapsedSections.namedShells;

  return (
    <div className={styles.instancePaneContent}>
      <div className={styles.paneHead}>
        <p className={styles.kicker}>Sessions</p>
        <h2>Active instances</h2>
        <label className={styles.sortControl}>
          <span>Sort</span>
          <select value={sortMode} onChange={(event) => onSortChange(event.currentTarget.value as SessionSortMode)}>
            {SORT_MODES.map((mode) => (
              <option key={mode} value={mode}>{mode}</option>
            ))}
          </select>
        </label>
      </div>

      <section className={styles.collapsibleSection} data-section="issue-sessions">
        <button
          type="button"
          className={styles.collapsibleHeader}
          aria-expanded={!issueSessionsCollapsed}
          aria-controls="workbench-issue-sessions"
          aria-label="Toggle sessions section"
          onClick={() => onToggleSection("issueSessions")}
        >
          <span>Issue sessions {deployments.length}</span>
          <span aria-hidden="true">v</span>
        </button>
        <div
          id="workbench-issue-sessions"
          className={`${styles.collapsibleBody} ${styles.sessionList}`}
          aria-label="Issue sessions"
          hidden={issueSessionsCollapsed}
        >
          {!repo && <p className={styles.emptyPaneText}>No session data loaded.</p>}
          {repo && deployments.length === 0 && (
            <p className={styles.emptyPaneText}>No active sessions for this repo.</p>
          )}
          {repo && deployments.map((deployment) => (
            <SessionCard
              key={deployment.id}
              deployment={deployment}
              repo={repo}
              selected={deployment.id === selectedDeploymentId}
              pending={deployment.id === pendingDeploymentId}
              rowError={rowErrors[deployment.id]}
              onSelectDeployment={onSelectDeployment}
              onReconnect={onReconnect}
              onEnd={onEnd}
            />
          ))}
        </div>
      </section>

      <section className={styles.collapsibleSection} data-section="named-shells">
        <button
          type="button"
          className={styles.collapsibleHeader}
          aria-expanded={!namedShellsCollapsed}
          aria-controls="workbench-named-shells"
          aria-label="Toggle named shells section"
          onClick={() => onToggleSection("namedShells")}
        >
          <span>Named shells 0</span>
          <span aria-hidden="true">v</span>
        </button>
        <div
          id="workbench-named-shells"
          className={`${styles.collapsibleBody} ${styles.namedShellPlaceholder}`}
          hidden={namedShellsCollapsed}
        >
          Named shells are not available yet.
        </div>
      </section>
    </div>
  );
}

function SessionCard({
  deployment,
  repo,
  selected,
  pending,
  rowError,
  onSelectDeployment,
  onReconnect,
  onEnd,
}: {
  deployment: WorkbenchDeployment;
  repo: WorkbenchRepo;
  selected: boolean;
  pending: boolean;
  rowError?: string;
  onSelectDeployment: (deploymentId: number) => void;
  onReconnect: (deployment: WorkbenchDeployment) => void;
  onEnd: (deployment: WorkbenchDeployment) => void;
}) {
  const issue = repo.issues.find((item) => item.number === deployment.issueNumber);
  const preview = previewForDeployment(deployment, repo.previews);
  const status = preview?.status ?? "unavailable";
  const previewText = preview?.lines.join(" ") || status;
  const runtimeLabel = deployment.idleSince ? `idle since ${formatTime(deployment.idleSince)}` : "running";

  return (
    <article
      className={styles.sessionCard}
      data-selected={selected ? "true" : undefined}
      data-status={status}
      aria-label={`Session #${deployment.issueNumber}`}
    >
      <button
        type="button"
        className={styles.sessionMain}
        onClick={() => onSelectDeployment(deployment.id)}
      >
        <span className={styles.sessionTopline}>
          <strong>#{deployment.issueNumber}</strong>
          <span>{deployment.agent}</span>
          <span data-status-dot={status}>{status}</span>
        </span>
        <span className={styles.sessionTitle}>{issue?.title ?? "Issue session"}</span>
        <span className={styles.sessionMeta}>
          {deployment.branchName} · {runtimeLabel}
        </span>
        <span className={styles.previewLine}>{previewText}</span>
      </button>

      {rowError && <p className={styles.rowError}>{rowError}</p>}

      <div className={styles.sessionActions}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={pending}
          onClick={() => onReconnect(deployment)}
        >
          Reconnect
        </button>
        <details className={styles.endDetails}>
          <summary>End</summary>
          <div className={styles.confirmBox}>
            <strong>End session?</strong>
            <button type="button" onClick={(event) => closeDetails(event.currentTarget)}>
              Cancel
            </button>
            <button type="button" disabled={pending} onClick={() => onEnd(deployment)}>
              End session
            </button>
          </div>
        </details>
      </div>
    </article>
  );
}

function closeDetails(button: HTMLButtonElement): void {
  button.closest("details")?.removeAttribute("open");
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
