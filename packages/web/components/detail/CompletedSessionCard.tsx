import Link from "next/link";
import type { Deployment } from "@issuectl/core";
import { deploymentLaunchAgent, launchAgentLabel } from "@/components/launch/agent";
import { formatDate, formatDuration } from "@/lib/format";
import { CompletedSessionTerminalButton } from "./CompletedSessionTerminalButton";
import styles from "./IssueDetail.module.css";

type TargetType = "issue" | "pr";

type Props = {
  owner: string;
  repo: string;
  targetType: TargetType;
  targetNumber: number;
  deployment: Deployment;
};

export function CompletedSessionCard({
  owner,
  repo,
  targetType,
  targetNumber,
  deployment,
}: Props) {
  return (
    <section className={styles.completedSession} aria-label="Completed agent session">
      <div className={styles.completedSessionHeader}>
        <div>
          <p className={styles.completedSessionEyebrow}>
            {launchAgentLabel(deploymentLaunchAgent(deployment))} {targetActionLabel(targetType)}
          </p>
          <h2>Completed session #{deployment.id}</h2>
        </div>
        <span className={styles.completedSessionStatus}>
          {completionStatus(deployment)}
        </span>
      </div>

      <dl className={styles.completedSessionMeta}>
        <div>
          <dt>Branch</dt>
          <dd>{deployment.branchName}</dd>
        </div>
        <div>
          <dt>Ended</dt>
          <dd>{deployment.endedAt ? formatDate(deployment.endedAt) : "not recorded"}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>
            {deployment.endedAt
              ? formatDuration(deployment.launchedAt, deployment.endedAt)
              : "not recorded"}
          </dd>
        </div>
        <div>
          <dt>Workspace</dt>
          <dd>{deployment.workspacePath}</dd>
        </div>
      </dl>

      {completionSummary(deployment) && (
        <p className={styles.completedSessionSummary}>
          {completionSummary(deployment)}
        </p>
      )}

      <div className={styles.completedSessionActions}>
        <CompletedSessionTerminalButton
          deploymentId={deployment.id}
          owner={owner}
          repo={repo}
          issueNumber={targetNumber}
          targetType={targetType}
          targetNumber={targetNumber}
        />
        <Link
          className={styles.completedSessionSecondaryLink}
          href={sessionHistoryHref(owner, repo, targetType, targetNumber)}
        >
          Session history
        </Link>
        {targetType === "issue" && deployment.linkedPrNumber !== null && (
          <Link
            className={styles.completedSessionSecondaryLink}
            href={`/pulls/${owner}/${repo}/${deployment.linkedPrNumber}`}
          >
            PR #{deployment.linkedPrNumber}
          </Link>
        )}
      </div>
    </section>
  );
}

export function latestCompletedDeployment(deployments: Deployment[]): Deployment | null {
  return deployments
    .filter((deployment) => deployment.endedAt !== null)
    .sort((left, right) =>
      Date.parse(right.endedAt ?? right.launchedAt) - Date.parse(left.endedAt ?? left.launchedAt)
        || right.id - left.id,
    )[0] ?? null;
}

function targetActionLabel(targetType: TargetType): string {
  return targetType === "pr" ? "reviewed this PR" : "worked this issue";
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

function sessionHistoryHref(
  owner: string,
  repo: string,
  targetType: TargetType,
  targetNumber: number,
): string {
  const params = new URLSearchParams({
    tab: "sessions",
    repo: `${owner}/${repo}`,
    state: "ended",
    q: `${targetType === "pr" ? "PR" : "Issue"} #${targetNumber}`,
  });
  return `/sessions?${params.toString()}`;
}
