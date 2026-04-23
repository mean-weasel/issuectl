"use client";

import { useState, useTransition } from "react";
import { resetWorktreeAction } from "@/lib/actions/worktrees";
import styles from "./DirtyWorktreeBanner.module.css";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
  worktreePath: string;
  onDiscard: () => void;
  onResume: () => void;
};

export function DirtyWorktreeBanner({
  owner,
  repo,
  issueNumber,
  worktreePath,
  onDiscard,
  onResume,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDiscard() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await resetWorktreeAction(owner, repo, issueNumber);
        if (result.success) {
          onDiscard();
        } else {
          setError(result.error ?? `Failed to clean worktree — try manually removing ${worktreePath}`);
        }
      } catch (err) {
        console.error("[issuectl] Worktree reset request failed:", err);
        setError(`Failed to reach server — try manually removing ${worktreePath}`);
      }
    });
  }

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden="true">&#9888;</span>
        <div>
          <div className={styles.title}>Previous session left uncommitted changes</div>
          <div className={styles.subtitle}>How would you like to proceed?</div>
        </div>
      </div>
      <div className={styles.actions}>
        <button
          className={styles.discardBtn}
          onClick={handleDiscard}
          disabled={isPending}
        >
          {isPending ? "Cleaning up…" : "Discard & Start Fresh"}
        </button>
        <button
          className={styles.resumeBtn}
          onClick={onResume}
          disabled={isPending}
        >
          Resume with Changes
        </button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
