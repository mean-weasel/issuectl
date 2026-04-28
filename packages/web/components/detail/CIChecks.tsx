import type { GitHubCheck } from "@issuectl/core";
import styles from "./CIChecks.module.css";

type Props = {
  checks: GitHubCheck[];
};

type DotKind = "success" | "failure" | "pending" | "neutral";

function dotKind(check: GitHubCheck): DotKind {
  if (check.status !== "completed") return "pending";
  if (check.conclusion === "success") return "success";
  if (
    check.conclusion === "failure" ||
    check.conclusion === "cancelled" ||
    check.conclusion === "timed_out" ||
    check.conclusion === "action_required"
  ) {
    return "failure";
  }
  return "neutral";
}

function detailText(check: GitHubCheck): string {
  if (check.status !== "completed") return check.status.replace("_", " ");
  return check.conclusion ?? "";
}

export function CIChecks({ checks }: Props) {
  if (checks.length === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.empty}>
          <em>no CI checks reported</em>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.wrapper}>
      {checks.map((check, i) => (
        <div key={`${check.name}-${i}`} className={styles.check}>
          <div className={`${styles.dot} ${styles[dotKind(check)]}`} />
          <div className={styles.name}>{check.name}</div>
          <div className={styles.detail}>{detailText(check)}</div>
        </div>
      ))}
    </div>
  );
}
