import Link from "next/link";
import type { Deployment } from "@issuectl/core";
import { LaunchActiveBanner } from "@/components/launch/LaunchActiveBanner";
import { deploymentLaunchAgent, launchAgentLabel } from "@/components/launch/agent";
import { formatDate, formatDuration } from "@/lib/format";
import { CompletedSessionTerminalButton } from "./CompletedSessionTerminalButton";
import styles from "./IssueDetail.module.css";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  deployments: Deployment[];
};

export function LaunchCard({ owner, repo, issueNumber, issueTitle, deployments }: Props) {
  const liveDeployment = deployments.find((d) => d.endedAt === null);
  if (liveDeployment) {
    return (
      <LaunchActiveBanner
        deploymentId={liveDeployment.id}
        branchName={liveDeployment.branchName}
        endedAt={liveDeployment.endedAt}
        owner={owner}
        repo={repo}
        issueNumber={issueNumber}
        issueTitle={issueTitle}
        ttydPort={liveDeployment.ttydPort}
        agent={deploymentLaunchAgent(liveDeployment)}
      />
    );
  }

  const completedDeployment = latestCompletedDeployment(deployments);
  if (!completedDeployment) return null;

  return (
    <section className={styles.completedSession} aria-label="Completed agent session">
      <div className={styles.completedSessionHeader}>
        <div>
          <p className={styles.completedSessionEyebrow}>
            {launchAgentLabel(deploymentLaunchAgent(completedDeployment))} worked this issue
          </p>
          <h2>Completed session #{completedDeployment.id}</h2>
        </div>
        <span className={styles.completedSessionStatus}>
          {completionStatus(completedDeployment)}
        </span>
      </div>

      <dl className={styles.completedSessionMeta}>
        <div>
          <dt>Branch</dt>
          <dd>{completedDeployment.branchName}</dd>
        </div>
        <div>
          <dt>Ended</dt>
          <dd>{completedDeployment.endedAt ? formatDate(completedDeployment.endedAt) : "not recorded"}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>
            {completedDeployment.endedAt
              ? formatDuration(completedDeployment.launchedAt, completedDeployment.endedAt)
              : "not recorded"}
          </dd>
        </div>
        <div>
          <dt>Workspace</dt>
          <dd>{completedDeployment.workspacePath}</dd>
        </div>
      </dl>

      {completionSummary(completedDeployment) && (
        <p className={styles.completedSessionSummary}>
          {completionSummary(completedDeployment)}
        </p>
      )}

      <div className={styles.completedSessionActions}>
        <CompletedSessionTerminalButton
          deploymentId={completedDeployment.id}
          owner={owner}
          repo={repo}
          issueNumber={issueNumber}
        />
        <Link
          className={styles.completedSessionSecondaryLink}
          href={sessionHistoryHref(owner, repo, issueNumber)}
        >
          Session history
        </Link>
        {completedDeployment.linkedPrNumber !== null && (
          <Link
            className={styles.completedSessionSecondaryLink}
            href={`/pulls/${owner}/${repo}/${completedDeployment.linkedPrNumber}`}
          >
            PR #{completedDeployment.linkedPrNumber}
          </Link>
        )}
      </div>
    </section>
  );
}

function latestCompletedDeployment(deployments: Deployment[]): Deployment | null {
  return deployments
    .filter((deployment) => deployment.endedAt !== null)
    .sort((left, right) =>
      Date.parse(right.endedAt ?? right.launchedAt) - Date.parse(left.endedAt ?? left.launchedAt)
        || right.id - left.id,
    )[0] ?? null;
}

function completionStatus(deployment: Deployment): string {
  const result = completionResult(deployment);
  return labelize(stringValue(result.status) ?? deployment.terminalReason ?? "completed");
}

function completionSummary(deployment: Deployment): string | null {
  const result = completionResult(deployment);
  return stringValue(result.summary)
    ?? stringValue(result.reason)
    ?? stringValue(result.error)
    ?? null;
}

function completionResult(deployment: Deployment): Record<string, unknown> {
  if (!deployment.completionResultJson) return {};
  try {
    const parsed = JSON.parse(deployment.completionResultJson) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function labelize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sessionHistoryHref(owner: string, repo: string, issueNumber: number): string {
  const params = new URLSearchParams({
    tab: "sessions",
    repo: `${owner}/${repo}`,
    state: "ended",
    q: `Issue #${issueNumber}`,
  });
  return `/sessions?${params.toString()}`;
}
