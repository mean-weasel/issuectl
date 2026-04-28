"use client";

import { useState } from "react";
import type { GitHubPullFile } from "@issuectl/core";
import styles from "./FilesChanged.module.css";

type Props = {
  files: GitHubPullFile[];
};

function renderDiffLine(line: string, index: number) {
  let className = styles.diffLine;
  if (line.startsWith("@@")) {
    className = `${styles.diffLine} ${styles.diffHunk}`;
  } else if (line.startsWith("+")) {
    className = `${styles.diffLine} ${styles.diffAdd}`;
  } else if (line.startsWith("-")) {
    className = `${styles.diffLine} ${styles.diffDel}`;
  }
  return (
    <div key={index} className={className}>
      {line}
    </div>
  );
}

export function FilesChanged({ files }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (filename: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

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
      {files.map((file) => {
        const isExpanded = expanded.has(file.filename);
        const hasPatch = Boolean(file.patch);
        return (
          <div key={file.filename}>
            <div
              className={`${styles.line} ${
                file.status === "removed" ? styles.removed : ""
              } ${hasPatch ? styles.expandBtn : ""}`}
              onClick={hasPatch ? () => toggle(file.filename) : undefined}
              role={hasPatch ? "button" : undefined}
              tabIndex={hasPatch ? 0 : undefined}
              onKeyDown={
                hasPatch
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(file.filename);
                      }
                    }
                  : undefined
              }
            >
              {hasPatch && (
                <span
                  className={`${styles.chevron} ${
                    isExpanded ? styles.chevronOpen : ""
                  }`}
                  aria-hidden="true"
                >
                  &#9656;
                </span>
              )}
              <span className={styles.add}>+{file.additions}</span>
              <span className={styles.del}>-{file.deletions}</span>
              <span className={styles.filename}>{file.filename}</span>
            </div>
            {isExpanded && file.patch && (
              <pre className={styles.diffBlock}>
                {file.patch.split("\n").map(renderDiffLine)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
