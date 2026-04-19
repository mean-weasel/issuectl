"use client";

import { useState, useEffect, useSyncExternalStore, useCallback } from "react";
import { listAll, type QueuedOperation } from "@/lib/offline-queue";

export type ActionTier = 1 | 2 | 3;

const ACTION_TIERS: Record<string, ActionTier> = {
  createDraft: 1,
  editDraft: 1,
  deleteDraft: 1,
  setPriority: 1,
  removeRepo: 1,
  updateRepo: 1,
  assignDraft: 2,
  addComment: 2,
  toggleLabel: 2,
  closeIssue: 3,
  mergePull: 3,
  updateIssue: 3,
  addRepo: 3,
  refreshDashboard: 3,
};

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function useOfflineAware() {
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getServerSnapshot,
  );
  const [queue, setQueue] = useState<QueuedOperation[]>([]);

  const refreshQueue = useCallback(async () => {
    try {
      const ops = await listAll();
      setQueue(ops);
    } catch (err) {
      console.warn("[issuectl] Failed to read offline queue:", err);
    }
  }, []);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  const isOffline = !isOnline;

  const pendingCount = queue.filter((op) => op.status === "pending").length;
  const failedCount = queue.filter((op) => op.status === "failed").length;
  const syncingCount = queue.filter((op) => op.status === "syncing").length;

  function getTier(action: string): ActionTier {
    return ACTION_TIERS[action] ?? 3;
  }

  function isBlocked(action: string): boolean {
    return isOffline && getTier(action) === 3;
  }

  function canQueue(action: string): boolean {
    return getTier(action) === 2;
  }

  return {
    isOffline,
    isOnline,
    queue,
    pendingCount,
    failedCount,
    syncingCount,
    getTier,
    isBlocked,
    canQueue,
    refreshQueue,
  };
}
