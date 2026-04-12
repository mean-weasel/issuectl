"use client";

import { useState } from "react";
import { mergePullAction } from "@/lib/actions/pulls";
import styles from "./PrDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  pullNumber: number;
  baseRef: string;
};

export function MergeButton({ owner, repoName, pullNumber, baseRef }: Props) {
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
    } else {
      setMergeError(result.error ?? "Merge failed");
    }
  };

  if (merged) {
    return <div className={styles.mergedBanner}>merged successfully</div>;
  }

  return (
    <>
      {confirming ? (
        <div className={styles.confirmRow}>
          <span className={styles.confirmLabel}>
            merge into <b>{baseRef}</b>?
          </span>
          <button className={styles.confirmBtn} onClick={handleConfirm}>
            yes, merge →
          </button>
          <button
            className={styles.cancelBtn}
            onClick={() => setConfirming(false)}
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
      {mergeError && <div className={styles.mergeError}>{mergeError}</div>}
    </>
  );
}
