"use client";

import { useState, useCallback } from "react";
import { useOfflineAware } from "@/hooks/useOfflineAware";
import { useSyncOnReconnect } from "@/hooks/useSyncOnReconnect";
import { remove } from "@/lib/offline-queue";
import { useToast } from "./ToastProvider";
import { QueueDropdown } from "./QueueDropdown";
import { FailureModal } from "./FailureModal";
import styles from "./OfflineIndicator.module.css";

export function OfflineIndicator() {
  const { showToast } = useToast();
  const {
    isOffline,
    queue,
    pendingCount,
    failedCount,
    refreshQueue,
  } = useOfflineAware();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [failureModalOpen, setFailureModalOpen] = useState(false);

  const handleSyncFailed = useCallback(
    (count: number) => {
      showToast(
        `${count} operation${count > 1 ? "s" : ""} failed to sync · Tap to review`,
        "error",
      );
      refreshQueue();
      if (count > 0) setFailureModalOpen(true);
    },
    [showToast, refreshQueue],
  );

  const handleRefreshQueue = useCallback(() => {
    refreshQueue();
  }, [refreshQueue]);

  useSyncOnReconnect({
    onSyncFailed: handleSyncFailed,
    onRefreshQueue: handleRefreshQueue,
  });

  const handleCancel = useCallback(
    async (id: string) => {
      try {
        await remove(id);
        refreshQueue();
        showToast("Queued operation cancelled", "warning");
      } catch (err) {
        console.error("[issuectl] Failed to cancel queued operation:", err);
        showToast("Failed to cancel operation", "error");
      }
    },
    [refreshQueue, showToast],
  );

  const handleRetry = useCallback(
    async (op: { id: string; action: string; params: Record<string, unknown>; nonce: string }) => {
      // The FailureModal's onRetry calls back here. For now, we just
      // remove the failed op and re-enqueue it as pending so the next
      // sync attempt picks it up.
      const { enqueue, remove: removeOp } = await import("@/lib/offline-queue");
      try {
        await removeOp(op.id);
        await enqueue(op.action as "assignDraft" | "addComment" | "toggleLabel", op.params, op.nonce);
        refreshQueue();
        showToast("Operation re-queued for sync", "success");
      } catch (err) {
        console.error("[issuectl] Failed to retry operation:", err);
        showToast("Failed to retry operation", "error");
      }
    },
    [refreshQueue, showToast],
  );

  const handleDiscard = useCallback(
    async (id: string) => {
      try {
        await remove(id);
        refreshQueue();
        showToast("Operation discarded", "warning");
      } catch (err) {
        console.error("[issuectl] Failed to discard operation:", err);
        showToast("Failed to discard operation", "error");
      }
    },
    [refreshQueue, showToast],
  );

  // Nothing to show when online with no queue items
  if (!isOffline && pendingCount === 0 && failedCount === 0) return null;

  const pendingOps = queue.filter((op) => op.status === "pending");
  const failedOps = queue.filter((op) => op.status === "failed");
  const hasQueue = pendingCount > 0;

  return (
    <>
      {isOffline && (
        <div className={styles.wrapper}>
          <div
            className={`${styles.banner} ${hasQueue ? styles.clickable : ""}`}
            role="status"
            aria-live="polite"
            onClick={hasQueue ? () => setDropdownOpen((o) => !o) : undefined}
          >
            <svg
              className={styles.icon}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="6" />
              <line x1="8" y1="5" x2="8" y2="8.5" />
              <line x1="8" y1="11" x2="8.01" y2="11" />
            </svg>
            <span className={styles.textFull}>
              Offline — viewing cached data
              {hasQueue && ` · ${pendingCount} operation${pendingCount > 1 ? "s" : ""} queued`}
            </span>
            <span className={styles.textCompact}>
              Offline{hasQueue && ` �� ${pendingCount} queued`}
            </span>
          </div>
          {dropdownOpen && (
            <QueueDropdown operations={pendingOps} onCancel={handleCancel} />
          )}
        </div>
      )}

      {failureModalOpen && failedOps.length > 0 && (
        <FailureModal
          failures={failedOps}
          onRetry={handleRetry}
          onDiscard={handleDiscard}
          onClose={() => {
            setFailureModalOpen(false);
            refreshQueue();
          }}
        />
      )}
    </>
  );
}
