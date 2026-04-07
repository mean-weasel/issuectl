"use client";

import type { GitHubComment } from "@issuectl/core";
import { timeAgo } from "@/lib/format";
import styles from "./ContextToggles.module.css";

type Props = {
  comments: GitHubComment[];
  referencedFiles: string[];
  selectedComments: number[];
  selectedFiles: string[];
  onToggleComment: (index: number) => void;
  onToggleFile: (path: string) => void;
};

function commentLabel(comment: GitHubComment): string {
  const author = comment.user?.login ?? "unknown";
  const age = timeAgo(comment.createdAt);
  const snippet = comment.body.slice(0, 40).replace(/\n/g, " ");
  return `Comment: ${author} (${age}) — ${snippet}${comment.body.length > 40 ? "…" : ""}`;
}

export function ContextToggles({
  comments,
  referencedFiles,
  selectedComments,
  selectedFiles,
  onToggleComment,
  onToggleFile,
}: Props) {
  return (
    <div className={styles.field}>
      <div className={styles.label}>Context</div>
      <div className={styles.list}>
        <label className={styles.item}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked
            disabled
          />
          <span>Issue body</span>
          <span className={styles.hint}>always included</span>
        </label>

        {comments.map((comment, i) => (
          <label key={comment.id} className={styles.item}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={selectedComments.includes(i)}
              onChange={() => onToggleComment(i)}
            />
            <span>{commentLabel(comment)}</span>
          </label>
        ))}

        {referencedFiles.length > 0 && (
          <div className={styles.divider} />
        )}

        {referencedFiles.map((file) => (
          <label key={file} className={styles.item}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={selectedFiles.includes(file)}
              onChange={() => onToggleFile(file)}
            />
            <span className={styles.filePath}>{file}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
