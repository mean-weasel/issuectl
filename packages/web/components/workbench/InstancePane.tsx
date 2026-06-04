import type { WorkbenchDeployment, WorkbenchRepo } from "./workbench-types";
import { previewForDeployment, sortDeploymentSessions } from "./workbench-selectors";
import {
  type SessionSortMode,
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
  onCollapseDrawer: () => void;
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
  onCollapseDrawer,
}: Props) {
  const deployments = repo ? sortDeploymentSessions(repo.deployments, repo.previews, sortMode) : [];
  const activeCount = deployments.length;

  return (
    <div className={styles.instancePaneContent}>
      <div className={styles.paneHead}>
        <div className={styles.paneTitleRow}>
          <div>
            <p className={styles.kicker}>Sessions</p>
            <h2>Running sessions</h2>
            <p className={styles.paneSubtitle}>
              {repo ? `${activeCount} active ${activeCount === 1 ? "instance" : "instances"}` : "No repo selected"}
            </p>
          </div>
          <button
            type="button"
            className={styles.paneCollapseButton}
            aria-label="Collapse running sessions"
            title="Collapse running sessions"
            onClick={onCollapseDrawer}
          >
            <span aria-hidden="true">&lt;</span>
          </button>
        </div>
        <label className={styles.sortControl}>
          <span>Sort</span>
          <select value={sortMode} onChange={(event) => onSortChange(event.currentTarget.value as SessionSortMode)}>
            {SORT_MODES.map((mode) => (
              <option key={mode} value={mode}>{mode}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.sessionList} aria-label="Issue-backed sessions">
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

      <div className={styles.namedShellPlaceholder} aria-label="Named shells">
        <div>
          <strong>Named shells</strong>
          <span>Not available yet.</span>
        </div>
      </div>
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
  const session = deployment as WorkbenchDeployment & {
    targetType?: "issue" | "pr";
    targetNumber?: number;
    triggeredBy?: "manual" | "webhook" | "comment_command";
    terminalReason?: string | null;
  };
  const targetNumber = session.targetNumber ?? session.issueNumber;
  const targetLabel = session.targetType === "pr" ? `PR #${targetNumber}` : `#${targetNumber}`;
  const issue = session.targetType === "pr" ? undefined : repo.issues.find((item) => item.number === targetNumber);
  const preview = previewForDeployment(deployment, repo.previews);
  const status = preview?.status ?? (deployment.terminalBackend === "pty_bridge" ? "active" : "unavailable");
  const previewText = preview?.lines.join(" ")
    || (deployment.terminalBackend === "pty_bridge" ? "PTY bridge connected" : status);
  const runtimeLabel = deployment.idleSince ? `idle since ${formatTime(deployment.idleSince)}` : "running";
  const trigger = session.triggeredBy ?? "manual";
  const triggerLabel = trigger === "comment_command" ? "comment" : trigger;
  const terminalReason = session.terminalReason ? session.terminalReason.replaceAll("_", " ") : null;

  return (
    <article
      className={styles.sessionCard}
      data-selected={selected ? "true" : undefined}
      data-status={status}
      aria-label={`Session ${targetLabel}`}
    >
      <button
        type="button"
        className={styles.sessionMain}
        onClick={() => onSelectDeployment(deployment.id)}
      >
        <span className={styles.sessionTopline}>
          <strong>{targetLabel}</strong>
          <span className={styles.sessionAgent}>{deployment.agent}</span>
          <span className={styles.sessionTrigger}>{triggerLabel}</span>
          {terminalReason && <span className={styles.sessionReason}>{terminalReason}</span>}
          <span className={styles.sessionStatus} data-status-dot={status}>{status}</span>
        </span>
        <span className={styles.sessionTitle}>{issue?.title ?? `${targetLabel} session`}</span>
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
            <p>
              Stops deployment {deployment.id} for {repo.owner}/{repo.name} {targetLabel}; the GitHub issue stays open.
            </p>
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
