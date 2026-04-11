import type { GitHubPullFile } from "@issuectl/core";
import styles from "./FilesChanged.module.css";

type Props = {
  files: GitHubPullFile[];
};

export function FilesChanged({ files }: Props) {
  if (files.length === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.empty}>
          <em>no files changed</em>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.wrapper}>
      {files.map((file) => (
        <div
          key={file.filename}
          className={`${styles.line} ${
            file.status === "removed" ? styles.removed : ""
          }`}
        >
          <span className={styles.add}>+{file.additions}</span>
          <span className={styles.del}>-{file.deletions}</span>
          <span className={styles.filename}>{file.filename}</span>
        </div>
      ))}
    </div>
  );
}
