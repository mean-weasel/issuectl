import type { GitHubIssue, GitHubPull } from "@issuectl/core";
import { formatDate } from "@/lib/format";
import styles from "./IssueDetails.module.css";

type Props = {
  issue: GitHubIssue;
  owner: string;
  repo: string;
  linkedPRs: GitHubPull[];
};

export function IssueDetails({ issue, owner, repo, linkedPRs }: Props) {
  return (
    <div className={styles.card}>
      <span className={styles.title}>Details</span>
      <div className={styles.rows}>
        <div className={styles.row}>
          <span className={styles.label}>Repo</span>
          <span className={styles.value}>
            {owner}/{repo}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Opened</span>
          <span className={styles.value}>{formatDate(issue.createdAt)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Author</span>
          <span className={styles.value}>
            {issue.user?.login ?? "unknown"}
          </span>
        </div>
        {linkedPRs.length > 0 && (
          <div className={styles.row}>
            <span className={styles.label}>Linked PR</span>
            <span className={styles.prLink}>
              {linkedPRs.map((pr) => `#${pr.number}`).join(", ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
