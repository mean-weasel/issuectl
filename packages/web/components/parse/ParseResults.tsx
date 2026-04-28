"use client";

import Link from "next/link";
import type { BatchCreateResult } from "@issuectl/core";
import { Button } from "@/components/paper";
import styles from "./ParseResults.module.css";

type Props = {
  results: BatchCreateResult;
  onReset: () => void;
};

function summaryText(results: BatchCreateResult): string {
  const parts: string[] = [];
  if (results.created > 0) {
    parts.push(`${results.created} issue${results.created !== 1 ? "s" : ""} created`);
  }
  if (results.drafted > 0) {
    parts.push(`${results.drafted} draft${results.drafted !== 1 ? "s" : ""} saved`);
  }
  if (results.failed > 0) {
    parts.push(`${results.failed} failed`);
  }
  return parts.length > 0 ? parts.join(", ") : "No issues processed";
}

export function ParseResults({ results, onReset }: Props) {
  const allSuccess = results.failed === 0;

  return (
    <div className={styles.wrapper}>
      <div className={allSuccess ? styles.summarySuccess : styles.summaryPartial}>
        <span className={allSuccess ? styles.summaryIconSuccess : styles.summaryIconPartial}>
          {allSuccess ? "\u2713" : "!"}
        </span>
        <span className={styles.summaryText}>
          {summaryText(results)}
        </span>
      </div>

      <div className={styles.list}>
        {results.results.map((r) => (
          <div key={r.id} className={styles.resultItem}>
            <span className={r.success ? styles.resultSuccess : styles.resultFailed}>
              {r.success ? "\u2713" : "\u2717"}
            </span>
            <span className={styles.resultRepo}>
              {r.draftId ? "draft" : `${r.owner}/${r.repo}`}
            </span>
            <div className={styles.resultSpacer} />
            {r.success && r.issueNumber !== undefined ? (
              <a
                href={`https://github.com/${r.owner}/${r.repo}/issues/${r.issueNumber}`}
                className={styles.resultLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                #{r.issueNumber}
              </a>
            ) : r.success && r.draftId ? (
              <Link
                href={`/drafts/${r.draftId}`}
                className={styles.resultLink}
              >
                view draft
              </Link>
            ) : (
              <span className={styles.resultError}>
                {r.error ?? "Failed"}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <Button variant="primary" onClick={onReset}>
          Create More
        </Button>
      </div>
    </div>
  );
}
