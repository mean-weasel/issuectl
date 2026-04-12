import type Database from "better-sqlite3";

/**
 * Idempotency sentinel for server actions (R1 from the resilience audit).
 *
 * Problem: mutating server actions (create issue, add comment, launch, assign
 * draft) have no built-in dedup. A slow request + user retry + React replay
 * can produce duplicate GitHub issues, duplicate comments, or duplicate
 * deployments. There is no natural idempotency key on the GitHub side for
 * most of these operations.
 *
 * Solution: the client generates a UUID per intended submission. The server
 * claims the (nonce, action_type) pair via `INSERT OR IGNORE` before running
 * the action, stores the serialized result on completion, and on any future
 * call with the same nonce either replays the stored result (completed) or
 * refuses (pending / failed). This turns every mutating action into an
 * at-most-once operation from the client's perspective — retries are safe.
 *
 * Scoping:
 * - The same nonce can be used by different action types (draftId reused
 *   across "create" and "assign" is fine).
 * - Nonces older than 1 hour are pruned on each call; pruning is bounded by
 *   a primary-key lookup so it can't dominate hot-path latency.
 * - Failed actions are deleted, not marked — the user can retry with a
 *   fresh nonce without being blocked by stale sentinels.
 */

/** Idempotency window — anything older is garbage-collected on next write. */
const NONCE_TTL_MS = 60 * 60 * 1000;

/**
 * Validate a nonce string. Accepts anything that looks like a random token:
 * 8-64 chars of URL-safe characters. We don't enforce a specific UUID format
 * so CLI callers can pass their own scheme, but we do bound the length to
 * prevent unbounded-string inserts from an untrusted client.
 */
export function isValidNonce(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 64 &&
    /^[A-Za-z0-9._-]+$/.test(value)
  );
}

type SentinelRow = {
  status: string;
  result_json: string | null;
};

export class DuplicateInFlightError extends Error {
  readonly actionType: string;
  readonly nonce: string;
  constructor(actionType: string, nonce: string) {
    super(`Action "${actionType}" is already in flight for this request`);
    this.name = "DuplicateInFlightError";
    this.actionType = actionType;
    this.nonce = nonce;
  }
}

/**
 * Run `fn`, gated by an idempotency sentinel. On first call with a given
 * (actionType, nonce) pair, runs the function, stores the result, and
 * returns it. On a repeat call with the same pair:
 *   - If the previous call completed successfully, returns the stored result
 *     without re-running `fn` (the replay case).
 *   - If the previous call is still in flight, throws `DuplicateInFlightError`
 *     — the caller is expected to surface this as a "request already in
 *     progress" message rather than re-invoking.
 *   - If the previous call failed, deletes the sentinel and re-runs `fn`
 *     (failures should not wedge the nonce forever).
 *
 * The result is serialized via `JSON.stringify`, so callers must only use
 * this with JSON-serializable return values.
 */
export async function withIdempotency<T>(
  db: Database.Database,
  actionType: string,
  nonce: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isValidNonce(nonce)) {
    throw new Error(`Invalid idempotency nonce: ${JSON.stringify(nonce)}`);
  }

  pruneExpiredNonces(db);

  // Atomic claim: INSERT OR IGNORE either succeeds (we own the action) or
  // does nothing (a row already exists with this key). No race window.
  const claim = db
    .prepare(
      `INSERT OR IGNORE INTO action_nonces (nonce, action_type, status, created_at)
       VALUES (?, ?, 'pending', ?)`,
    )
    .run(nonce, actionType, Date.now());

  if (claim.changes === 0) {
    // Existing row — check its state.
    const existing = db
      .prepare(
        `SELECT status, result_json FROM action_nonces WHERE nonce = ? AND action_type = ?`,
      )
      .get(nonce, actionType) as SentinelRow | undefined;

    if (!existing) {
      // Row disappeared between INSERT OR IGNORE and SELECT — another
      // caller deleted a failed row. Fall through to a fresh claim.
      return withIdempotency(db, actionType, nonce, fn);
    }

    if (existing.status === "completed" && existing.result_json !== null) {
      return JSON.parse(existing.result_json) as T;
    }

    if (existing.status === "pending") {
      throw new DuplicateInFlightError(actionType, nonce);
    }

    // status === 'failed' — remove the sentinel so the retry gets a fresh
    // run. We recurse once; a second-pass failure will hit this branch
    // again only if another concurrent caller re-wrote it, which is fine.
    db.prepare(
      `DELETE FROM action_nonces WHERE nonce = ? AND action_type = ?`,
    ).run(nonce, actionType);
    return withIdempotency(db, actionType, nonce, fn);
  }

  try {
    const result = await fn();
    db.prepare(
      `UPDATE action_nonces SET status = 'completed', result_json = ?
       WHERE nonce = ? AND action_type = ?`,
    ).run(JSON.stringify(result ?? null), nonce, actionType);
    return result;
  } catch (err) {
    db.prepare(
      `UPDATE action_nonces SET status = 'failed'
       WHERE nonce = ? AND action_type = ?`,
    ).run(nonce, actionType);
    throw err;
  }
}

/**
 * Delete nonce rows older than the TTL. Cheap — the index on created_at
 * makes this a bounded range scan. Called on every write so the table
 * never grows unbounded, without needing a background cleanup job.
 */
export function pruneExpiredNonces(db: Database.Database): number {
  const cutoff = Date.now() - NONCE_TTL_MS;
  const info = db
    .prepare(`DELETE FROM action_nonces WHERE created_at < ?`)
    .run(cutoff);
  return info.changes;
}
