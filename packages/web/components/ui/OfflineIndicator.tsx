"use client";

import { useState, useCallback } from "react";
import { useOfflineAware } from "@/hooks/useOfflineAware";
import { useSyncOnReconnect } from "@/hooks/useSyncOnReconnect";
import { remove } from "@/lib/offline-queue";
import { useToast } from "./ToastProvider";
import { QueueDropdown } from "./QueueDropdown";
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

  const handleSyncFailed = useCallback(
    (count: number) => {
      showToast(
        `${count} operation${count > 1 ? "s" : ""} failed to sync`,
        "error",
      );
      refreshQueue();
    },
    [showToast, refreshQueue],
  );

  const handleSyncSuccess = useCallback(() => {
    refreshQueue();
  }, [refreshQueue]);

  useSyncOnReconnect({
    onSyncFailed: handleSyncFailed,
    onRefreshQueue: handleSyncSuccess,
  });

  const handleCancel = useCallback(
    async (id: string) => {
      await remove(id);
      refreshQueue();
      showToast("Queued operation cancelled", "warning");
    },
    [refreshQueue, showToast],
  );

  if (!isOffline && pendingCount === 0 && failedCount === 0) return null;

  if (!isOffline) return null;

  const pendingOps = queue.filter((op) => op.status === "pending");
  const hasQueue = pendingCount > 0;

  function handleBannerClick() {
    if (hasQueue) setDropdownOpen((o) => !o);
  }

  return (
    <div className={styles.wrapper}>
      <div
        className={`${styles.banner} ${hasQueue ? styles.clickable : ""}`}
        role="status"
        aria-live="polite"
        onClick={handleBannerClick}
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
          Offline{hasQueue && ` · ${pendingCount} queued`}
        </span>
      </div>
      {dropdownOpen && (
        <QueueDropdown operations={pendingOps} onCancel={handleCancel} />
      )}
    </div>
  );
}
