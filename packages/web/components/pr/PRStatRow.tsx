import type { GitHubPull } from "@issuectl/core";
import styles from "./PRStatRow.module.css";

type Props = {
  pull: GitHubPull;
};

export function PRStatRow({ pull }: Props) {
  return (
    <div className={styles.row}>
      <div className={styles.stat}>
        <span className={styles.plus}>+{pull.additions}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.minus}>-{pull.deletions}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.files}>
          {pull.changedFiles} file{pull.changedFiles !== 1 ? "s" : ""} changed
        </span>
      </div>
      <div className={styles.stat}>
        <span className={styles.branch}>
          base: {pull.baseRef} &larr; {pull.headRef}
        </span>
      </div>
    </div>
  );
}
