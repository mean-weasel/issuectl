import Link from "next/link";
import type { GitHubPull } from "@issuectl/core";
import { Chip } from "@/components/paper";
import styles from "./PrListRow.module.css";

type Props = {
  owner: string;
  repoName: string;
  pull: GitHubPull;
};

function formatAge(updatedAt: string): string {
  const diffDays = Math.floor(
    (Date.now() - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "1d";
  return `${diffDays}d`;
}

type StatusDotVariant = "pass" | "fail" | "pending" | "merged" | "none";

function getStatusDot(pull: GitHubPull): StatusDotVariant {
  if (pull.merged) return "merged";
  if (pull.state === "closed") return "none";
  return "none";
}

export function PrListRow({ owner, repoName, pull }: Props) {
  const dot = getStatusDot(pull);
  const href = `/pulls/${owner}/${repoName}/${pull.number}`;

  return (
    <div className={styles.item}>
      <Link href={href} className={styles.rowLink}>
        <span className={`${styles.dot} ${styles[dot]}`} aria-hidden />
        <div className={styles.title}>{pull.title}</div>
        <div className={styles.meta}>
          <Chip>{repoName}</Chip>
          <span className={styles.num}>#{pull.number}</span>
          <span className={styles.sep}>·</span>
          <span className={styles.branch}>{pull.headRef}</span>
          <span className={styles.sep}>·</span>
          <span className={styles.additions}>+{pull.additions}</span>
          <span className={styles.deletions}>-{pull.deletions}</span>
          <span className={styles.sep}>·</span>
          <span>{pull.merged ? "merged" : pull.state}</span>
          <span className={styles.sep}>·</span>
          <span>{formatAge(pull.updatedAt)}</span>
        </div>
      </Link>
    </div>
  );
}
