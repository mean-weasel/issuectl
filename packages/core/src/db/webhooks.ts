/* eslint-disable max-lines */
import type Database from "better-sqlite3";
import {
  ACTIVE_INTENT_STATUSES,
  rowToWebhookEvent,
  rowToWebhookLogEntry,
  rowToWebhookIntent,
  type MergeWebhookIntentInput,
  type ListWebhookIntentsInput,
  type ListWebhookEventsInput,
  type RecordWebhookEventInput,
  type RecordWebhookEventResult,
  type WebhookEvent,
  type WebhookEventRow,
  type WebhookIntent,
  type WebhookLogEntry,
  type WebhookLogEntryRow,
  type WebhookIntentRow,
} from "./webhook-records.js";

export type {
  MergeWebhookIntentInput,
  ListWebhookIntentsInput,
  ListWebhookEventsInput,
  RecordWebhookEventInput,
  RecordWebhookEventResult,
  WebhookEvent,
  WebhookIntent,
  WebhookLogEntry,
  WebhookLogResult,
} from "./webhook-records.js";

const MERGE_TRANSACTION_ATTEMPTS = 3;

function isSqliteConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
      error.code === "SQLITE_CONSTRAINT_UNIQUE")
  );
}

function isSqliteBusySnapshot(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "SQLITE_BUSY" || error.code === "SQLITE_BUSY_SNAPSHOT")
  );
}

function activeStatusPlaceholders(): string {
  return ACTIVE_INTENT_STATUSES.map(() => "?").join(", ");
}

function findActiveWebhookIntent(
  db: Database.Database,
  input: Pick<MergeWebhookIntentInput, "repoId" | "targetType" | "targetNumber">,
): WebhookIntentRow | undefined {
  return db
    .prepare(
      `SELECT * FROM webhook_intents
       WHERE repo_id = ?
         AND target_type = ?
         AND target_number = ?
         AND status IN (${activeStatusPlaceholders()})
       ORDER BY id ASC
       LIMIT 1`,
    )
    .get(input.repoId, input.targetType, input.targetNumber, ...ACTIVE_INTENT_STATUSES) as
    | WebhookIntentRow
    | undefined;
}

function updateActiveWebhookIntent(
  db: Database.Database,
  active: WebhookIntentRow,
  input: MergeWebhookIntentInput,
): boolean {
  const scheduledAt = boundedScheduledAt(input, active.first_signal_at);
  const result = db
    .prepare(
      `UPDATE webhook_intents
       SET last_signal_at = ?,
           scheduled_at = ?,
           generation = generation + 1,
           desired_head_sha = COALESCE(?, desired_head_sha),
           requested_agent = COALESCE(?, requested_agent),
           review_mode = COALESCE(?, review_mode),
           signal_count = signal_count + 1
       WHERE id = ?
         AND status IN (${activeStatusPlaceholders()})`,
    )
    .run(
      input.signalAt, scheduledAt, input.desiredHeadSha ?? null,
      input.requestedAgent ?? null, input.reviewMode ?? null, active.id,
      ...ACTIVE_INTENT_STATUSES,
    );

  if (result.changes !== 1) return false;

  if (input.eventId !== undefined && input.eventId !== null) {
    db.prepare("UPDATE webhook_events SET intent_id = ? WHERE id = ?").run(active.id, input.eventId);
  }

  return true;
}

function boundedScheduledAt(input: MergeWebhookIntentInput, firstSignalAt: number): number {
  if (input.maxDebounceMs === undefined || input.maxDebounceMs === null) {
    return input.scheduledAt;
  }
  const maxDebounceMs = Math.max(0, Math.floor(input.maxDebounceMs));
  return Math.min(input.scheduledAt, firstSignalAt + maxDebounceMs);
}

export function recordWebhookEvent(
  db: Database.Database,
  input: RecordWebhookEventInput,
): RecordWebhookEventResult {
  const insert = db.transaction(() => {
    db.prepare(
      "INSERT INTO webhook_deliveries (delivery_id, repo_id, event_type, received_at, retained_until) VALUES (?, ?, ?, ?, ?)",
    ).run(input.deliveryId, input.repoId, input.eventType, input.receivedAt, input.retainedUntil ?? null);

    const result = db
      .prepare(
        "INSERT INTO webhook_events (delivery_id, repo_id, event_type, action, sender_login, target_type, target_number, payload_json, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(input.deliveryId, input.repoId, input.eventType, input.action ?? null, input.senderLogin ?? null, input.targetType ?? null, input.targetNumber ?? null, input.payloadJson ?? null, input.receivedAt);

    return Number(result.lastInsertRowid);
  });

  try {
    return { deduped: false, eventId: insert() };
  } catch (error) {
    if (isSqliteConstraint(error)) {
      return { deduped: true };
    }
    throw error;
  }
}

export function getWebhookEventByDelivery(
  db: Database.Database,
  input: { deliveryId: string; repoId: number },
): WebhookEvent | undefined {
  const row = db
    .prepare(
      `SELECT * FROM webhook_events
       WHERE delivery_id = ?
         AND repo_id = ?
       LIMIT 1`,
    )
    .get(input.deliveryId, input.repoId) as WebhookEventRow | undefined;
  return row ? rowToWebhookEvent(row) : undefined;
}

export function mergeWebhookIntent(
  db: Database.Database,
  input: MergeWebhookIntentInput,
): number {
  let lastBusyError: unknown;
  for (let attempt = 0; attempt < MERGE_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return mergeWebhookIntentOnce(db, input);
    } catch (error) {
      if (!isSqliteBusySnapshot(error)) throw error;
      lastBusyError = error;
    }
  }

  throw lastBusyError;
}

function mergeWebhookIntentOnce(
  db: Database.Database,
  input: MergeWebhookIntentInput,
): number {
  return db.transaction(() => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
	      const active = findActiveWebhookIntent(db, input);
	      if (active) {
	        if (updateActiveWebhookIntent(db, active, input)) return active.id;
	        continue;
	      }

      try {
        const result = db
          .prepare(
            `INSERT INTO webhook_intents
              (repo_id, target_type, target_number, first_signal_at, last_signal_at,
               scheduled_at, desired_head_sha, requested_agent, review_mode, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
	          )
	          .run(
	            input.repoId, input.targetType, input.targetNumber,
	            input.signalAt, input.signalAt, boundedScheduledAt(input, input.signalAt),
	            input.desiredHeadSha ?? null, input.requestedAgent ?? null, input.reviewMode ?? null,
	          );
        const intentId = Number(result.lastInsertRowid);

        if (input.eventId !== undefined && input.eventId !== null) {
          db.prepare("UPDATE webhook_events SET intent_id = ? WHERE id = ?").run(intentId, input.eventId);
        }

        return intentId;
      } catch (error) {
        if (isSqliteConstraint(error)) continue;
        throw error;
      }
    }

    const active = findActiveWebhookIntent(db, input);
    if (active && updateActiveWebhookIntent(db, active, input)) {
      return active.id;
    }
    throw new Error("Failed to merge webhook intent after retrying races");
  })();
}

export function hasActiveWebhookIntent(
  db: Database.Database,
  input: Pick<MergeWebhookIntentInput, "repoId" | "targetType" | "targetNumber">,
): boolean {
  return findActiveWebhookIntent(db, input) !== undefined;
}

export function countActiveWebhookIntents(db: Database.Database): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS count
     FROM webhook_intents
     WHERE status IN (${activeStatusPlaceholders()})`,
  ).get(...ACTIVE_INTENT_STATUSES) as { count: number };
  return row.count;
}

export function listWebhookIntents(
  db: Database.Database,
  input: number | ListWebhookIntentsInput = 50,
): WebhookIntent[] {
  const options = typeof input === "number" ? { limit: input } : input;
  const normalizedLimit = Number.isFinite(options.limit)
    ? Math.floor(options.limit ?? 50)
    : 50;
  const boundedLimit = Math.max(1, normalizedLimit);
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.repoId !== undefined) {
    where.push("repo_id = ?");
    params.push(options.repoId);
  }
  if (options.targetType !== undefined) {
    where.push("target_type = ?");
    params.push(options.targetType);
  }
  if (options.targetNumber !== undefined) {
    where.push("target_number = ?");
    params.push(options.targetNumber);
  }
  if (options.status === "active") {
    where.push(`status IN (${activeStatusPlaceholders()})`);
    params.push(...ACTIVE_INTENT_STATUSES);
  } else if (options.status === "terminal") {
    where.push(`status NOT IN (${activeStatusPlaceholders()})`);
    params.push(...ACTIVE_INTENT_STATUSES);
  } else if (options.status !== undefined) {
    where.push("status = ?");
    params.push(options.status);
  }

  params.push(boundedLimit);
  const rows = db
    .prepare(
      `SELECT * FROM webhook_intents
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY scheduled_at ASC, id ASC
       LIMIT ?`,
    )
    .all(...params) as WebhookIntentRow[];
  return rows.map(rowToWebhookIntent);
}

export function fireWebhookIntent(
  db: Database.Database,
  id: number,
  now: number,
): WebhookIntent | undefined {
  const row = db
    .prepare(
      `UPDATE webhook_intents
       SET status = 'pending',
           scheduled_at = ?,
           processing_started_at = NULL,
           lease_expires_at = NULL,
           failure_reason = NULL
       WHERE id = ?
         AND status IN ('pending', 'deferred')
       RETURNING *`,
    )
    .get(now, id) as WebhookIntentRow | undefined;
  return row ? rowToWebhookIntent(row) : undefined;
}

export function dropWebhookIntent(
  db: Database.Database,
  id: number,
  now: number,
  reason = "operator_dropped",
): WebhookIntent | undefined {
  const row = db
    .prepare(
      `UPDATE webhook_intents
       SET status = 'expired',
           resolved_at = ?,
           processing_started_at = NULL,
           lease_expires_at = NULL,
           failure_reason = ?
       WHERE id = ?
         AND status IN (${activeStatusPlaceholders()})
       RETURNING *`,
    )
    .get(now, reason, id, ...ACTIVE_INTENT_STATUSES) as WebhookIntentRow | undefined;
  return row ? rowToWebhookIntent(row) : undefined;
}

export function claimDueWebhookIntent(
  db: Database.Database,
  now: number,
  leaseMs: number,
): WebhookIntent | undefined {
  const row = db
    .prepare(
      `UPDATE webhook_intents
       SET status = 'processing',
           processing_started_at = ?,
           lease_expires_at = ?
       WHERE id = (
         SELECT id FROM webhook_intents
         WHERE status IN ('pending', 'deferred')
           AND scheduled_at <= ?
         ORDER BY scheduled_at ASC, id ASC
         LIMIT 1
       )
         AND status IN ('pending', 'deferred')
         AND scheduled_at <= ?
       RETURNING *`,
    )
    .get(now, now + leaseMs, now, now) as WebhookIntentRow | undefined;
  return row ? rowToWebhookIntent(row) : undefined;
}

export function recoverExpiredWebhookIntentLeases(
  db: Database.Database,
  now: number,
): number {
  return recoverExpiredWebhookIntentLeaseRecords(db, now).length;
}

export function recoverExpiredWebhookIntentLeaseRecords(
  db: Database.Database,
  now: number,
): WebhookIntent[] {
  const rows = db
    .prepare(
      `UPDATE webhook_intents
       SET status = 'pending',
           processing_started_at = NULL,
           lease_expires_at = NULL
       WHERE status = 'processing'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at <= ?
       RETURNING *`,
    )
    .all(now) as WebhookIntentRow[];
  return rows.map(rowToWebhookIntent);
}

export function expireOldWebhookIntents(
  db: Database.Database,
  now: number,
  maxAgeMs: number,
): number {
  return expireOldWebhookIntentRecords(db, now, maxAgeMs).length;
}

export function expireOldWebhookIntentRecords(
  db: Database.Database,
  now: number,
  maxAgeMs: number,
): WebhookIntent[] {
  const cutoff = now - maxAgeMs;
  const rows = db
    .prepare(
      `UPDATE webhook_intents
       SET status = 'expired',
           resolved_at = ?,
           processing_started_at = NULL,
           lease_expires_at = NULL
       WHERE status IN (${ACTIVE_INTENT_STATUSES.map(() => "?").join(", ")})
         AND first_signal_at <= ?
       RETURNING *`,
    )
    .all(now, ...ACTIVE_INTENT_STATUSES, cutoff) as WebhookIntentRow[];
  return rows.map(rowToWebhookIntent);
}

export function pruneExpiredWebhookPayloads(
  db: Database.Database,
  now: number,
): number {
  const result = db
    .prepare(
      `UPDATE webhook_events
       SET payload_json = NULL
       WHERE payload_json IS NOT NULL
         AND delivery_id IN (
           SELECT delivery_id FROM webhook_deliveries
           WHERE retained_until IS NOT NULL
             AND retained_until <= ?
         )`,
    )
    .run(now);
  return result.changes;
}

export function listWebhookEvents(
  db: Database.Database,
  input: number | ListWebhookEventsInput = 50,
): WebhookEvent[] {
  const options = typeof input === "number" ? { limit: input } : input;
  const normalizedLimit = Number.isFinite(options.limit)
    ? Math.floor(options.limit ?? 50)
    : 50;
  const boundedLimit = Math.max(1, normalizedLimit);
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.repoId !== undefined) {
    where.push("repo_id = ?");
    params.push(options.repoId);
  }
  if (options.targetType !== undefined) {
    where.push("target_type = ?");
    params.push(options.targetType);
  }
  if (options.targetNumber !== undefined) {
    where.push("target_number = ?");
    params.push(options.targetNumber);
  }

  params.push(boundedLimit);
  const rows = db
    .prepare(
      `SELECT * FROM webhook_events
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY received_at DESC, id DESC
       LIMIT ?`,
    )
    .all(...params) as WebhookEventRow[];
  return rows.map(rowToWebhookEvent);
}

export function listWebhookLogEntries(
  db: Database.Database,
  input: number | ListWebhookEventsInput = 50,
): WebhookLogEntry[] {
  const options = typeof input === "number" ? { limit: input } : input;
  const normalizedLimit = Number.isFinite(options.limit)
    ? Math.floor(options.limit ?? 50)
    : 50;
  const boundedLimit = Math.max(1, normalizedLimit);
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.repoId !== undefined) {
    where.push("e.repo_id = ?");
    params.push(options.repoId);
  }
  if (options.targetType !== undefined) {
    where.push("e.target_type = ?");
    params.push(options.targetType);
  }
  if (options.targetNumber !== undefined) {
    where.push("e.target_number = ?");
    params.push(options.targetNumber);
  }

  params.push(boundedLimit);
  const rows = db
    .prepare(
      `SELECT
         e.*,
         i.id AS intent_id_joined,
         i.repo_id AS intent_repo_id,
         i.target_type AS intent_target_type,
         i.target_number AS intent_target_number,
         i.first_signal_at,
         i.last_signal_at,
         i.scheduled_at,
         i.processing_started_at,
         i.lease_expires_at,
         i.generation,
         i.desired_head_sha,
         i.requested_agent,
         i.review_mode,
         i.signal_count,
         i.status AS intent_status,
         i.resolved_at,
         i.deployment_id,
         i.failure_reason
       FROM webhook_events e
       LEFT JOIN webhook_intents i ON i.id = e.intent_id
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY e.received_at DESC, e.id DESC
       LIMIT ?`,
    )
    .all(...params) as WebhookLogEntryRow[];
  return rows.map(rowToWebhookLogEntry);
}
