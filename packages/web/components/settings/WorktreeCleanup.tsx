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
  // "all" = bulk stale cleanup, worktree path = single delete, null = no confirm
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  if (worktrees.length === 0) {
    return <div className={styles.empty}>No worktrees found</div>;
  }

  const staleCount = worktrees.filter((wt) => wt.stale).length;

  function handleDelete(wt: WorktreeInfo) {
    setError(null);
    setSuccess(null);
    setConfirmTarget(null);
    startTransition(async () => {
      try {
        const result = await cleanupWorktree(wt.path, wt.localPath ?? undefined);
        if (result.success) {
          setSuccess(`Removed worktree "${wt.name}"`);
        } else {
          setError(result.error ?? "Failed to delete worktree");
        }
      } catch {
        setError("Failed to delete worktree");
      }
    });
  }

  function handleCleanAll() {
    setError(null);
    setSuccess(null);
    setConfirmTarget(null);
    startTransition(async () => {
      try {
        const result = await cleanupStaleWorktrees();
        if (result.removed > 0) {
          setSuccess(`Removed ${result.removed} stale worktree${result.removed > 1 ? "s" : ""}`);
        }
        if (!result.success) {
          setError(result.error ?? "Failed to clean stale worktrees");
        }
      } catch {
        setError("Failed to clean stale worktrees");
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
          {confirmTarget === "all" ? (
            <span className={styles.confirmInline}>
              <span className={styles.confirmText}>Remove all stale?</span>
              <Button
                variant="ghost"
                onClick={() => setConfirmTarget(null)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                className={styles.dangerBtn}
                onClick={handleCleanAll}
                disabled={isPending}
              >
                {isPending ? "Cleaning..." : "Remove"}
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              className={styles.cleanAllBtn}
              onClick={() => setConfirmTarget("all")}
              disabled={isPending}
            >
              Clean all stale
            </Button>
          )}
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
          {confirmTarget === wt.path ? (
            <span className={styles.confirmInline}>
              <span className={styles.confirmText}>Delete?</span>
              <Button
                variant="ghost"
                onClick={() => setConfirmTarget(null)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                className={styles.dangerBtn}
                onClick={() => handleDelete(wt)}
                disabled={isPending}
              >
                {isPending ? "Deleting..." : "Delete"}
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              className={styles.dangerBtn}
              onClick={() => setConfirmTarget(wt.path)}
              disabled={isPending}
            >
              Delete
            </Button>
          )}
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
