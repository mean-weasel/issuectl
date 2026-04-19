"use client";

import { useTransition, useState } from "react";
import { cleanupWorktree, cleanupStaleWorktrees } from "@/lib/actions/worktrees";
import type { WorktreeInfo } from "@/lib/actions/worktrees";
import { Button } from "@/components/paper";
import styles from "./WorktreeCleanup.module.css";

type Props = {
  worktrees: WorktreeInfo[];
};

const COLLAPSED_LIMIT = 5;

export function WorktreeCleanup({ worktrees }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  if (worktrees.length === 0) {
    return <div className={styles.empty}>No worktrees found</div>;
  }

  const staleCount = worktrees.filter((wt) => wt.stale).length;

  function handleDelete(wt: WorktreeInfo) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await cleanupWorktree(wt.path, wt.localPath ?? undefined);
      if (!result.success) {
        setError(result.error ?? "Failed to delete worktree");
      }
    });
  }

  function handleCleanAll() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await cleanupStaleWorktrees();
      if (result.removed > 0) {
        setSuccess(`Removed ${result.removed} stale worktree${result.removed > 1 ? "s" : ""}`);
      }
      if (!result.success) {
        setError(result.error ?? "Failed to clean stale worktrees");
      }
    });
  }

  const visibleWorktrees = expanded ? worktrees : worktrees.slice(0, COLLAPSED_LIMIT);
  const hasMore = worktrees.length > COLLAPSED_LIMIT;

  return (
    <>
      {staleCount > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.staleCount}>
            {staleCount} stale worktree{staleCount > 1 ? "s" : ""}
          </span>
          <Button
            variant="ghost"
            className={styles.cleanAllBtn}
            onClick={handleCleanAll}
            disabled={isPending}
          >
            {isPending ? "Cleaning..." : "Clean all stale"}
          </Button>
        </div>
      )}
      {visibleWorktrees.map((wt) => (
        <div key={wt.path} className={wt.stale ? styles.rowStale : styles.row}>
          <span className={styles.name}>{wt.name}</span>
          <span className={wt.stale ? styles.badgeStale : styles.badgeActive}>
            {wt.stale ? "stale" : "active"}
          </span>
          {wt.issueNumber && (
            <span className={styles.issue}>#{wt.issueNumber}</span>
          )}
          <Button
            variant="ghost"
            className={styles.deleteBtn}
            onClick={() => handleDelete(wt)}
            disabled={isPending}
          >
            Delete
          </Button>
        </div>
      ))}
      {hasMore && !expanded && (
        <button
          type="button"
          className={styles.showAllBtn}
          onClick={() => setExpanded(true)}
        >
          show all {worktrees.length} worktrees
        </button>
      )}
      {error && <div className={styles.error} role="alert">{error}</div>}
      {success && <div className={styles.success} role="status">{success}</div>}
    </>
  );
}
