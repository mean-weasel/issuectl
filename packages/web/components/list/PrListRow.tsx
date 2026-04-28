import Link from "next/link";
import type { PullWithChecksStatus } from "@issuectl/core";
import { Chip } from "@/components/paper";
import styles from "./PrListRow.module.css";

type Props = {
  owner: string;
  repoName: string;
  pull: PullWithChecksStatus;
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

function getStatusDot(pull: PullWithChecksStatus): StatusDotVariant {
  if (pull.merged) return "merged";
  if (pull.state === "closed") return "none";
  // Open PR — map checksStatus rollup to a dot color
  if (pull.checksStatus === "success") return "pass";
  if (pull.checksStatus === "failure") return "fail";
  if (pull.checksStatus === "pending") return "pending";
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
