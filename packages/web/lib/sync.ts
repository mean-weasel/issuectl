import {
  listPending,
  markSyncing,
  markFailed,
  markPending,
  remove,
  type QueuedOperation,
} from "./offline-queue";

type ActionResult = { success: boolean; error?: string };

type ReplayResult = {
  synced: number;
  failed: number;
  stopped: boolean;
};

/**
 * Replay all pending operations sequentially.
 *
 * Operations replay in order because they may depend on sequence (e.g.,
 * assign draft creates an issue, then a queued comment targets it).
 * Network errors halt the loop and revert the current op to pending.
 * Non-network errors (validation, 404) mark the op as failed and continue,
 * since retrying won't help.
 */
export async function replayQueue(
  executor: (op: QueuedOperation) => Promise<ActionResult>,
): Promise<ReplayResult> {
  const pending = await listPending();
  if (pending.length === 0) {
    return { synced: 0, failed: 0, stopped: false };
  }

  let synced = 0;
  let failed = 0;

  for (const op of pending) {
    try {
      await markSyncing(op.id);
    } catch (err) {
      console.warn("[issuectl] Failed to mark operation as syncing:", op.id, err);
      failed++;
      continue;
    }

    try {
      const result = await executor(op);

      if (result.success) {
        try {
          await remove(op.id);
        } catch (err) {
          console.warn("[issuectl] Sync succeeded but failed to remove from queue:", op.id, err);
        }
        synced++;
      } else {
        try {
          await markFailed(op.id, result.error ?? "Unknown error");
        } catch (err) {
          console.warn("[issuectl] Failed to mark operation as failed:", op.id, err);
        }
        failed++;
      }
    } catch (err) {
      // Network-level failure — stop processing, revert to pending.
      if (
        err instanceof TypeError ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        try {
          await markPending(op.id);
        } catch (revertErr) {
          console.warn("[issuectl] Failed to revert operation to pending:", op.id, revertErr);
        }
        return { synced, failed, stopped: true };
      }
      // Unexpected error — mark failed, continue.
      try {
        await markFailed(
          op.id,
          err instanceof Error ? err.message : "Unexpected error",
        );
      } catch (markErr) {
        console.warn("[issuectl] Failed to mark operation as failed:", op.id, markErr);
      }
      failed++;
    }
  }

  return { synced, failed, stopped: false };
}

/**
 * Check if the server is reachable via the health endpoint.
 */
export async function checkHealth(baseUrl = ""): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      cache: "no-store",
    });
    return res.ok;
  } catch (err) {
    console.warn("[issuectl] Health check failed:", err);
    return false;
  }
}
