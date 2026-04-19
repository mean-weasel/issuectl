import { enqueue, type QueueableAction } from "./offline-queue";
import { newIdempotencyKey } from "./idempotency-key";

export type TryOrQueueResult =
  | { outcome: "succeeded"; data: Record<string, unknown> }
  | { outcome: "queued" }
  | { outcome: "error"; error: string };

type ActionResult = { success: boolean; error?: string };

const NETWORK_KEYWORDS = [
  "network error",
  "unreachable",
  "econnrefused",
  "etimedout",
  "enotfound",
  "econnreset",
  "timeout",
] as const;

function defaultIsNetworkError(error: string): boolean {
  const lower = error.toLowerCase();
  return NETWORK_KEYWORDS.some((kw) => lower.includes(kw));
}

type Options = {
  nonce?: string;
  isNetworkError?: (error: string) => boolean;
};

async function safeEnqueue(
  action: QueueableAction,
  params: Record<string, unknown>,
  nonce: string,
): Promise<TryOrQueueResult> {
  try {
    await enqueue(action, params, nonce);
    return { outcome: "queued" };
  } catch (enqueueErr) {
    console.error("[issuectl] Failed to enqueue operation for offline sync:", enqueueErr);
    return { outcome: "error", error: "Could not save operation for offline sync. Try again when you have a connection." };
  }
}

export async function tryOrQueue(
  action: QueueableAction,
  params: Record<string, unknown>,
  serverActionFn: () => Promise<ActionResult>,
  options?: Options,
): Promise<TryOrQueueResult> {
  const nonce = options?.nonce ?? newIdempotencyKey();
  const isNetErr = options?.isNetworkError ?? defaultIsNetworkError;

  // Pre-flight: if browser says we're offline, queue immediately.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return safeEnqueue(action, params, nonce);
  }

  try {
    const result = await serverActionFn();

    if (result.success) {
      return { outcome: "succeeded", data: result as Record<string, unknown> };
    }

    // Server responded but the operation failed.
    const errorMsg = result.error ?? "Unknown error";
    if (isNetErr(errorMsg)) {
      return safeEnqueue(action, params, nonce);
    }

    return { outcome: "error", error: errorMsg };
  } catch (err) {
    // Fetch-level failure — server/tunnel unreachable.
    if (err instanceof TypeError || (err instanceof DOMException && err.name === "AbortError")) {
      return safeEnqueue(action, params, nonce);
    }
    // Unexpected error — don't queue, surface it.
    throw err;
  }
}
