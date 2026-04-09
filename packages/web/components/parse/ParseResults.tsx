"use client";

import Link from "next/link";
import type { BatchCreateResult } from "@issuectl/core";
import { Button } from "@/components/ui/Button";
import styles from "./ParseResults.module.css";

type Props = {
  results: BatchCreateResult;
  onReset: () => void;
};

export function ParseResults({ results, onReset }: Props) {
  const allSuccess = results.failed === 0;

  return (
    <div className={styles.wrapper}>
      <div className={allSuccess ? styles.summarySuccess : styles.summaryPartial}>
        <span className={allSuccess ? styles.summaryIconSuccess : styles.summaryIconPartial}>
          {allSuccess ? "\u2713" : "!"}
        </span>
        <span className={styles.summaryText}>
          {results.created} issue{results.created !== 1 ? "s" : ""} created
          {results.failed > 0 &&
            `, ${results.failed} failed`}
        </span>
      </div>

      <div className={styles.list}>
        {results.results.map((r) => (
          <div key={r.id} className={styles.resultItem}>
            <span className={r.success ? styles.resultSuccess : styles.resultFailed}>
              {r.success ? "\u2713" : "\u2717"}
            </span>
            <span className={styles.resultRepo}>
              {r.owner}/{r.repo}
            </span>
            <div className={styles.resultSpacer} />
            {r.success && r.issueNumber !== undefined ? (
              <Link
                href={`/${r.owner}/${r.repo}/issues/${r.issueNumber}`}
                className={styles.resultLink}
              >
                #{r.issueNumber}
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
