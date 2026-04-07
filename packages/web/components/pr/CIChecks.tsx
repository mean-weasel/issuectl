import type { GitHubCheck } from "@issuectl/core";
import { formatDuration } from "@/lib/format";
import styles from "./CIChecks.module.css";

type Props = {
  checks: GitHubCheck[];
};

function dotClass(check: GitHubCheck): string {
  if (check.status !== "completed") return styles.dotPending;
  if (check.conclusion === "success") return styles.dotPass;
  return styles.dotFail;
}

export function CIChecks({ checks }: Props) {
  if (checks.length === 0) return null;

  return (
    <div className={styles.card}>
      <span className={styles.title}>CI Checks</span>
      <div className={styles.list}>
        {checks.map((check, index) => (
          <div key={`${check.name}-${index}`} className={styles.check}>
            <span className={`${styles.dot} ${dotClass(check)}`} />
            <span className={styles.name}>{check.name}</span>
            {check.startedAt && check.completedAt && (
              <span className={styles.time}>
                {formatDuration(check.startedAt, check.completedAt)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
