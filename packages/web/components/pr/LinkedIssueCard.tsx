import Link from "next/link";
import type { GitHubIssue } from "@issuectl/core";
import styles from "./LinkedIssueCard.module.css";

type Props = {
  issue: GitHubIssue;
  owner: string;
  repo: string;
};

export function LinkedIssueCard({ issue, owner, repo }: Props) {
  return (
    <div className={styles.card}>
      <span className={styles.title}>Linked Issue</span>
      <Link
        href={`/${owner}/${repo}/issues/${issue.number}`}
        className={styles.link}
      >
        <span
          className={`${styles.dot} ${issue.state === "open" ? styles.dotOpen : styles.dotClosed}`}
        />
        <span className={styles.number}>#{issue.number}</span>
        <span className={styles.issueTitle}>{issue.title}</span>
      </Link>
    </div>
  );
}
