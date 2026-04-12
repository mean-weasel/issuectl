/**
 * Generate a short random token for action idempotency. The server-side
 * `withIdempotency` helper accepts 8–64-char URL-safe strings; `randomUUID`
 * returns 36 chars matching that constraint.
 *
 * Falls back to a timestamp-derived token on platforms without the Web
 * Crypto API (none in practice — Next.js runs on Node 20+ where
 * `crypto.randomUUID` is always available — but the fallback avoids
 * runtime crashes during SSR warm-up or tests).
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2, 14);
  return `${Date.now().toString(36)}-${rand}`;
}
