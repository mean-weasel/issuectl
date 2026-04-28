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
    if (
      check.conclusion === "failure" ||
      check.conclusion === "cancelled" ||
      check.conclusion === "timed_out" ||
      check.conclusion === "action_required"
    ) {
      return "failing";
    }
  }
  return hasPending ? "pending" : "passing";
}

function failingCheckCount(checks: GitHubCheck[]): number {
  return checks.filter(
    (c) =>
      c.conclusion === "failure" ||
      c.conclusion === "cancelled" ||
      c.conclusion === "timed_out" ||
      c.conclusion === "action_required",
  ).length;
}

export function MergeButton({ owner, repoName, pullNumber, baseRef, draft, checks }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [merged, setMerged] = useState(false);
  const [strategy, setStrategy] = useState<"merge" | "squash" | "rebase">("merge");

  const handleConfirm = async () => {
    setConfirming(false);
    setMerging(true);
    setMergeError(null);
    try {
      const result = await mergePullAction(owner, repoName, pullNumber, strategy);
      if (result.success) {
        setMerged(true);
        router.refresh();
      } else {
        setMergeError(result.error ?? "Merge failed");
      }
    } catch (err) {
      console.error("[issuectl] Merge pull request failed:", err);
      setMergeError("Something went wrong while merging. Please try again.");
    } finally {
      setMerging(false);
    }
  };

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
  const failCount = ciStatus === "failing" ? failingCheckCount(checks) : 0;

  return (
    <>
      {/* Warn when checks are failing or pending */}
      {ciStatus === "failing" && (
        <div className={styles.mergeError} role="status">
          {failCount} CI {failCount === 1 ? "check" : "checks"} failing
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
          <select
            className={styles.strategySelect}
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as "merge" | "squash" | "rebase")}
            disabled={merging}
          >
            <option value="merge">Merge commit</option>
            <option value="squash">Squash and merge</option>
            <option value="rebase">Rebase and merge</option>
          </select>
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
