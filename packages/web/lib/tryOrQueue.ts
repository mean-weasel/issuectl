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

export async function tryOrQueue(
  action: QueueableAction,
  params: Record<string, unknown>,
  serverActionFn: () => Promise<ActionResult>,
  options?: Options,
): Promise<TryOrQueueResult> {
  const nonce = options?.nonce ?? newIdempotencyKey();
  const isNetErr = options?.isNetworkError ?? defaultIsNetworkError;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await enqueue(action, params, nonce);
    return { outcome: "queued" };
  }

  try {
    const result = await serverActionFn();

    if (result.success) {
      return { outcome: "succeeded", data: result as Record<string, unknown> };
    }

    const errorMsg = result.error ?? "Unknown error";
    if (isNetErr(errorMsg)) {
      await enqueue(action, params, nonce);
      return { outcome: "queued" };
    }

    return { outcome: "error", error: errorMsg };
  } catch (err) {
    if (err instanceof TypeError || (err instanceof DOMException && err.name === "AbortError")) {
      await enqueue(action, params, nonce);
      return { outcome: "queued" };
    }
    throw err;
  }
}
