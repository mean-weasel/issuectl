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
    await markSyncing(op.id);

    try {
      const result = await executor(op);

      if (result.success) {
        await remove(op.id);
        synced++;
      } else {
        await markFailed(op.id, result.error ?? "Unknown error");
        failed++;
      }
    } catch (err) {
      if (
        err instanceof TypeError ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        await markPending(op.id);
        return { synced, failed, stopped: true };
      }
      await markFailed(
        op.id,
        err instanceof Error ? err.message : "Unexpected error",
      );
      failed++;
    }
  }

  return { synced, failed, stopped: false };
}

export async function checkHealth(baseUrl = ""): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
