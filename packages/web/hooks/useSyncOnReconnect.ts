"use client";

import { useEffect, useRef, useCallback } from "react";
import { checkHealth, replayQueue } from "@/lib/sync";
import { listPending, type QueuedOperation } from "@/lib/offline-queue";
import { assignDraftAction } from "@/lib/actions/drafts";
import { addComment } from "@/lib/actions/comments";
import { toggleLabel } from "@/lib/actions/issues";
import { refreshAction } from "@/lib/actions/refresh";

type ActionResult = { success: boolean; error?: string };

async function executeOperation(op: QueuedOperation): Promise<ActionResult> {
  const p = op.params;
  switch (op.action) {
    case "assignDraft":
      return assignDraftAction(
        p.draftId as string,
        p.repoId as number,
        op.nonce,
      );
    case "addComment":
      return addComment(
        p.owner as string,
        p.repo as string,
        p.issueNumber as number,
        p.body as string,
        op.nonce,
      );
    case "toggleLabel":
      return toggleLabel({
        owner: p.owner as string,
        repo: p.repo as string,
        number: p.issueNumber as number,
        label: p.label as string,
        action: p.action as "add" | "remove",
      });
    default:
      return { success: false, error: `Unknown action: ${op.action}` };
  }
}

type SyncCallbacks = {
  onSyncSuccess?: (op: QueuedOperation) => void;
  onSyncFailed?: (failedCount: number) => void;
  onRefreshQueue?: () => void;
};

export function useSyncOnReconnect(callbacks?: SyncCallbacks) {
  const syncingRef = useRef(false);

  const handleOnline = useCallback(async () => {
    if (syncingRef.current) return;

    const pending = await listPending();
    if (pending.length === 0) {
      try {
        await refreshAction();
      } catch {
        // Server might not be reachable yet.
      }
      return;
    }

    const healthy = await checkHealth();
    if (!healthy) return;

    syncingRef.current = true;
    try {
      const result = await replayQueue(executeOperation);
      callbacks?.onRefreshQueue?.();

      if (result.synced > 0) {
        try {
          await refreshAction();
        } catch {
          // Non-critical
        }
      }

      if (result.failed > 0) {
        callbacks?.onSyncFailed?.(result.failed);
      }
    } finally {
      syncingRef.current = false;
    }
  }, [callbacks]);

  useEffect(() => {
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [handleOnline]);
}
