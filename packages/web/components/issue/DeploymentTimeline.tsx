import type { Deployment, GitHubPull } from "@issuectl/core";
import { formatDate } from "@/lib/format";
import styles from "./DeploymentTimeline.module.css";

type Props = {
  deployments: Deployment[];
  linkedPRs: GitHubPull[];
};

type TimelineEntry = {
  label: string;
  ref: string;
  date: string;
  type: "launched" | "pr";
};

function buildEntries(
  deployments: Deployment[],
  linkedPRs: GitHubPull[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const pr of linkedPRs) {
    entries.push({
      label: `PR #${pr.number} opened`,
      ref: pr.headRef,
      date: pr.createdAt,
      type: "pr",
    });
  }

  for (const dep of deployments) {
    entries.push({
      label: "Launched to Claude Code",
      ref: dep.branchName,
      date: dep.launchedAt,
      type: "launched",
    });
  }

  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return entries;
}

export function DeploymentTimeline({ deployments, linkedPRs }: Props) {
  const entries = buildEntries(deployments, linkedPRs);

  if (entries.length === 0) {
    return (
      <div className={styles.card}>
        <span className={styles.title}>Deployment History</span>
        <span className={styles.empty}>No deployments yet</span>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <span className={styles.title}>Deployment History</span>
      <div className={styles.timeline}>
        {entries.map((entry, i) => (
          <div key={i} className={styles.entry}>
            <span
              className={`${styles.dot} ${entry.type === "pr" ? styles.dotPr : styles.dotLaunched}`}
            />
            <div className={styles.content}>
              <span className={styles.label}>{entry.label}</span>
              <span className={styles.ref}>{entry.ref}</span>
              <span className={styles.date}>{formatDate(entry.date)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
