import type { GitHubPullFile } from "@issuectl/core";
import styles from "./FilesChanged.module.css";

type Props = {
  files: GitHubPullFile[];
};

function statusIndicator(status: GitHubPullFile["status"]): { symbol: string; className: string } {
  switch (status) {
    case "added":
      return { symbol: "+", className: styles.added };
    case "removed":
      return { symbol: "-", className: styles.removed };
    default:
      return { symbol: "~", className: styles.modified };
  }
}

export function FilesChanged({ files }: Props) {
  if (files.length === 0) return null;

  return (
    <div className={styles.card}>
      <span className={styles.title}>Files Changed ({files.length})</span>
      <div className={styles.list}>
        {files.map((file) => {
          const { symbol, className } = statusIndicator(file.status);
          return (
            <span key={file.filename} className={styles.file}>
              <span className={className}>{symbol}</span> {file.filename}
            </span>
          );
        })}
      </div>
    </div>
  );
}
