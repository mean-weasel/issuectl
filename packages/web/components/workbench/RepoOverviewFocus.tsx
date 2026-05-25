import { previewForDeployment } from "./workbench-selectors";
import type { WorkbenchDeployment, WorkbenchHealth, WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type Props = {
  repo: WorkbenchRepo;
  health: WorkbenchHealth;
  onRefresh: () => void;
  refreshPending: boolean;
  refreshError: string | null;
  recoveryNotice?: string | null;
  onSelectDeployment: (deploymentId: number) => void;
  onSelectIssue: (issueNumber: number) => void;
  onOpenRepoSetup: () => void;
};

export function RepoOverviewFocus({
  repo,
  health,
  onRefresh,
  refreshPending,
  refreshError,
  recoveryNotice = null,
  onSelectDeployment,
  onSelectIssue,
  onOpenRepoSetup,
}: Props) {
  return (
    <div className={styles.focusInner}>
      <p className={styles.kicker}>Workbench</p>
      <h1>{repo.owner}/{repo.name}</h1>
      <p className={styles.muted}>Select a session or issue to open its focused workspace.</p>

      {recoveryNotice && (
        <div className={styles.notice} role="alert">
          <strong>Deep link unavailable</strong>
          <p>{recoveryNotice}</p>
        </div>
      )}

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
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onRefresh}
          disabled={refreshPending}
          aria-label={refreshPending ? "Refreshing workbench data" : "Refresh workbench data"}
        >
          {refreshPending ? "Refreshing" : "Refresh"}
        </button>
        <button type="button" className={styles.secondaryButton} disabled>
          New shell unavailable
        </button>
      </div>

      {refreshPending && (
        <p className={styles.refreshStatus} role="status">
          Refreshing workbench data...
        </p>
      )}

      {refreshError && (
        <div className={styles.notice} role="alert">
          <strong>Refresh failed</strong>
          <p>{refreshError}</p>
        </div>
      )}

      {repo.deployments.length > 0 && (
        <section className={styles.overviewSessionShortcuts} aria-label="Compact active sessions">
          <h2>Active sessions</h2>
          <div className={styles.overviewShortcutList}>
            {repo.deployments.map((deployment) => (
              <OverviewSessionCard
                key={deployment.id}
                deployment={deployment}
                repo={repo}
                onSelectDeployment={onSelectDeployment}
              />
            ))}
          </div>
        </section>
      )}

      {repo.recentCompletions.length > 0 && (
        <section className={styles.overviewSessionShortcuts} aria-label="Recent session completions">
          <h2>Recent completions</h2>
          <div className={styles.overviewShortcutList}>
            {repo.recentCompletions.map((deployment) => {
              const targetLabel = deployment.targetType === "pr" ? `PR #${deployment.targetNumber}` : `#${deployment.targetNumber}`;
              const result = parseCompletionResult(deployment.completionResultJson);
              return (
                <article key={deployment.id} className={styles.overviewShortcutCard} aria-label={`Completed session ${targetLabel}`}>
                  <div>
                    <strong>{targetLabel}</strong>
                    <span>{deployment.terminalReason?.replaceAll("_", " ") ?? "ended"}</span>
                    <span>{deployment.triggeredBy}</span>
                  </div>
                  <h3>{result.summary || `${targetLabel} session`}</h3>
                  <p>{deployment.branchName} - {formatDateTime(deployment.endedAt)}</p>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {repo.prReviews.length > 0 && (
        <section className={styles.overviewIssueShortcuts} aria-label="PR review history">
          <h2>PR review history</h2>
          <div className={styles.overviewShortcutList}>
            {repo.prReviews.map((review) => (
              <article key={review.id} className={styles.overviewShortcutCard} aria-label={`PR review #${review.prNumber}`}>
                <div>
                  <strong>PR #{review.prNumber}</strong>
                  <span>{review.status}</span>
                  <span>{review.triggeredBy === "comment_command" ? "comment" : review.triggeredBy}</span>
                </div>
                <h3>{shortSha(review.reviewedFromSha ?? review.reviewBaseSha)} to {shortSha(review.reviewedToSha)}</h3>
                <p>{review.headRepoFullName}:{review.headRef}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {repo.webhookEvents.length > 0 && (
        <section className={styles.overviewIssueShortcuts} aria-label="Recent webhook events">
          <h2>Webhook events</h2>
          <div className={styles.overviewShortcutList}>
            {repo.webhookEvents.map((event) => {
              const target = event.targetType && event.targetNumber
                ? `${event.targetType === "pr" ? "PR" : "issue"} #${event.targetNumber}`
                : "repo";
              return (
                <article key={event.id} className={styles.overviewShortcutCard} aria-label={`Webhook event ${event.deliveryId}`}>
                  <div>
                    <strong>{event.eventType}</strong>
                    <span>{event.action ?? "received"}</span>
                    <span>{target}</span>
                  </div>
                  <h3>{event.senderLogin ?? "GitHub"}</h3>
                  <p>{formatUnixMs(event.receivedAt)}</p>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {repo.issues.length > 0 && (
        <section className={styles.overviewIssueShortcuts} aria-label="Compact repo issues">
          <h2>Repo issues</h2>
          <div className={styles.overviewShortcutList}>
            {repo.issues.map((issue) => {
              const status = issue.state === "closed" ? "closed" : issue.hasActiveDeployment ? "running" : "open";
              return (
                <article key={issue.number} className={styles.overviewShortcutCard} aria-label={`Issue #${issue.number}`}>
                  <div>
                    <strong>#{issue.number}</strong>
                    <span>{status}</span>
                    <span>{issue.priority}</span>
                  </div>
                  <h3>{issue.title}</h3>
                  <button type="button" onClick={() => onSelectIssue(issue.number)}>
                    Open issue
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function OverviewSessionCard({
  deployment,
  repo,
  onSelectDeployment,
}: {
  deployment: WorkbenchDeployment;
  repo: WorkbenchRepo;
  onSelectDeployment: (deploymentId: number) => void;
}) {
  const issue = deployment.targetType === "issue"
    ? repo.issues.find((item) => item.number === deployment.targetNumber)
    : undefined;
  const preview = previewForDeployment(deployment, repo.previews);
  const status = preview?.status ?? "running";
  const runtimeLabel = deployment.idleSince ? "idle" : "running";
  const targetLabel = deployment.targetType === "pr" ? `PR #${deployment.targetNumber}` : `#${deployment.targetNumber}`;
  return (
    <article className={styles.overviewShortcutCard} aria-label={`Session ${targetLabel}`}>
      <div>
        <strong>{targetLabel}</strong>
        <span>{deployment.agent}</span>
        <span>{status}</span>
      </div>
      <h3>{issue?.title ?? `${targetLabel} session`}</h3>
      <p>{deployment.branchName} - {runtimeLabel}</p>
      <button type="button" onClick={() => onSelectDeployment(deployment.id)}>
        Open terminal
      </button>
    </article>
  );
}

function parseCompletionResult(value: string | null): { summary?: string } {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const summary = (parsed as { summary?: unknown }).summary;
    return typeof summary === "string" ? { summary } : {};
  } catch {
    return {};
  }
}

function shortSha(value: string): string {
  return value.slice(0, 7);
}

function formatUnixMs(value: number): string {
  return new Date(value).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function formatDateTime(value: string | null): string {
  if (!value) return "ended";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}
