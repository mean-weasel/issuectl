"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GitHubCheck } from "@issuectl/core";
import { mergePullAction } from "@/lib/actions/pulls";
import styles from "./PrDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  pullNumber: number;
  baseRef: string;
  draft: boolean;
  checks: GitHubCheck[];
};

function getCheckStatus(checks: GitHubCheck[]): "passing" | "failing" | "pending" | "none" {
  if (checks.length === 0) return "none";
  let hasPending = false;
  for (const check of checks) {
    if (check.status !== "completed") {
      hasPending = true;
      continue;
    }
    if (check.conclusion === "failure" || check.conclusion === "timed_out") {
      return "failing";
    }
  }
  return hasPending ? "pending" : "passing";
}

function failingCheckCount(checks: GitHubCheck[]): number {
  return checks.filter(
    (c) => c.conclusion === "failure" || c.conclusion === "timed_out",
  ).length;
}

export function MergeButton({ owner, repoName, pullNumber, baseRef, draft, checks }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [merged, setMerged] = useState(false);

  const handleConfirm = async () => {
    setConfirming(false);
    setMerging(true);
    setMergeError(null);
    const result = await mergePullAction(owner, repoName, pullNumber);
    setMerging(false);
    if (result.success) {
      setMerged(true);
      router.refresh();
    } else {
      setMergeError(result.error ?? "Merge failed");
    }
  };

  /* Bug 1: Draft PRs cannot be merged */
  if (draft) {
    return (
      <button className={styles.mergeBtn} disabled>
        convert from draft to merge
      </button>
    );
  }

  if (merged) {
    return (
      <div
        className={styles.mergedBanner}
        role="status"
        aria-live="polite"
      >
        merged successfully
      </div>
    );
  }

  const ciStatus = getCheckStatus(checks);

  return (
    <>
      {/* Bug 2: CI gate — warn when checks are failing or pending */}
      {ciStatus === "failing" && (
        <div className={styles.mergeError} role="status">
          {failingCheckCount(checks)} CI {failingCheckCount(checks) === 1 ? "check" : "checks"} failing
        </div>
      )}
      {ciStatus === "pending" && (
        <div className={styles.confirmLabel} role="status">
          CI checks running…
        </div>
      )}
      {confirming ? (
        <div className={styles.confirmRow}>
          <span className={styles.confirmLabel}>
            merge into <b>{baseRef}</b>?
          </span>
          {/* Bug 3: disable confirm button while merge is in flight */}
          <button className={styles.confirmBtn} onClick={handleConfirm} disabled={merging}>
            {merging ? "merging…" : "yes, merge →"}
          </button>
          <button
            className={styles.cancelBtn}
            onClick={() => setConfirming(false)}
            disabled={merging}
          >
            cancel
          </button>
        </div>
      ) : (
        <button
          className={styles.mergeBtn}
          onClick={() => {
            setMergeError(null);
            setConfirming(true);
          }}
          disabled={merging}
        >
          {merging ? "merging…" : "merge pull request →"}
        </button>
      )}
      {mergeError && (
        <div className={styles.mergeError} role="alert">
          {mergeError}
        </div>
      )}
    </>
  );
}
