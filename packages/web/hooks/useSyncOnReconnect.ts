"use client";

import { useEffect, useRef } from "react";
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
  onSyncFailed?: (failedCount: number) => void;
  onRefreshQueue?: () => void;
};

export function useSyncOnReconnect(callbacks?: SyncCallbacks) {
  const syncingRef = useRef(false);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    async function handleOnline() {
      if (syncingRef.current) return;

      let pending: QueuedOperation[];
      try {
        pending = await listPending();
      } catch (err) {
        console.error("[issuectl] Failed to read offline queue on reconnect:", err);
        return;
      }

      if (pending.length === 0) {
        try {
          await refreshAction();
        } catch (err) {
          // Optimistic refresh — server may not be fully reachable despite the online event.
          console.warn("[issuectl] Post-reconnect refresh failed:", err);
        }
        return;
      }

      const healthy = await checkHealth();
      if (!healthy) return;

      syncingRef.current = true;
      try {
        const result = await replayQueue(executeOperation);
        callbacksRef.current?.onRefreshQueue?.();

        if (result.synced > 0) {
          try {
            await refreshAction();
          } catch (err) {
            // Sync succeeded but revalidation failed — cached data will be stale until next refresh.
            console.warn("[issuectl] Post-sync refresh failed:", err);
          }
        }

        if (result.failed > 0) {
          callbacksRef.current?.onSyncFailed?.(result.failed);
        }
      } catch (err) {
        console.error("[issuectl] Queue replay failed:", err);
        callbacksRef.current?.onSyncFailed?.(0);
        callbacksRef.current?.onRefreshQueue?.();
      } finally {
        syncingRef.current = false;
      }
    }

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);
}
