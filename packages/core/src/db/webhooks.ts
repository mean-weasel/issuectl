import type Database from "better-sqlite3";
import {
  ACTIVE_INTENT_STATUSES,
  rowToWebhookEvent,
  rowToWebhookIntent,
  type MergeWebhookIntentInput,
  type RecordWebhookEventInput,
  type RecordWebhookEventResult,
  type WebhookEvent,
  type WebhookEventRow,
  type WebhookIntent,
  type WebhookIntentRow,
} from "./webhook-records.js";

export type {
  MergeWebhookIntentInput,
  RecordWebhookEventInput,
  RecordWebhookEventResult,
  WebhookEvent,
  WebhookIntent,
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
  input: Pick<
    MergeWebhookIntentInput,
    "repoId" | "targetType" | "targetNumber"
  >,
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
    .get(
      input.repoId,
      input.targetType,
      input.targetNumber,
      ...ACTIVE_INTENT_STATUSES,
    ) as WebhookIntentRow | undefined;
}

function updateActiveWebhookIntent(
  db: Database.Database,
  intentId: number,
  input: MergeWebhookIntentInput,
): boolean {
  const result = db
    .prepare(
      `UPDATE webhook_intents
       SET last_signal_at = ?,
           scheduled_at = ?,
           generation = generation + 1,
           desired_head_sha = COALESCE(?, desired_head_sha),
           signal_count = signal_count + 1
       WHERE id = ?
         AND status IN (${activeStatusPlaceholders()})`,
    )
    .run(
      input.signalAt,
      input.scheduledAt,
      input.desiredHeadSha ?? null,
      intentId,
      ...ACTIVE_INTENT_STATUSES,
    );

  if (result.changes !== 1) return false;

  if (input.eventId !== undefined && input.eventId !== null) {
    db.prepare("UPDATE webhook_events SET intent_id = ? WHERE id = ?").run(
      intentId,
      input.eventId,
    );
  }

  return true;
}

export function recordWebhookEvent(
  db: Database.Database,
  input: RecordWebhookEventInput,
): RecordWebhookEventResult {
  const insert = db.transaction(() => {
    db.prepare(
      "INSERT INTO webhook_deliveries (delivery_id, repo_id, event_type, received_at, retained_until) VALUES (?, ?, ?, ?, ?)",
    ).run(
      input.deliveryId,
      input.repoId,
      input.eventType,
      input.receivedAt,
      input.retainedUntil ?? null,
    );

    const result = db
      .prepare(
        "INSERT INTO webhook_events (delivery_id, repo_id, event_type, action, sender_login, target_type, target_number, payload_json, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.deliveryId,
        input.repoId,
        input.eventType,
        input.action ?? null,
        input.senderLogin ?? null,
        input.targetType ?? null,
        input.targetNumber ?? null,
        input.payloadJson ?? null,
        input.receivedAt,
      );

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
        if (updateActiveWebhookIntent(db, active.id, input)) return active.id;
        continue;
      }

      try {
        const result = db
          .prepare(
            `INSERT INTO webhook_intents
              (repo_id, target_type, target_number, first_signal_at, last_signal_at, scheduled_at, desired_head_sha, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
          )
          .run(
            input.repoId,
            input.targetType,
            input.targetNumber,
            input.signalAt,
            input.signalAt,
            input.scheduledAt,
            input.desiredHeadSha ?? null,
          );
        const intentId = Number(result.lastInsertRowid);

        if (input.eventId !== undefined && input.eventId !== null) {
          db.prepare("UPDATE webhook_events SET intent_id = ? WHERE id = ?").run(
            intentId,
            input.eventId,
          );
        }

        return intentId;
      } catch (error) {
        if (isSqliteConstraint(error)) continue;
        throw error;
      }
    }

    const active = findActiveWebhookIntent(db, input);
    if (active && updateActiveWebhookIntent(db, active.id, input)) {
      return active.id;
    }
    throw new Error("Failed to merge webhook intent after retrying races");
  })();
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
  const result = db
    .prepare(
      `UPDATE webhook_intents
       SET status = 'pending',
           processing_started_at = NULL,
           lease_expires_at = NULL
       WHERE status = 'processing'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at <= ?`,
    )
    .run(now);
  return result.changes;
}

export function expireOldWebhookIntents(
  db: Database.Database,
  now: number,
  maxAgeMs: number,
): number {
  const cutoff = now - maxAgeMs;
  const result = db
    .prepare(
      `UPDATE webhook_intents
       SET status = 'expired',
           resolved_at = ?,
           processing_started_at = NULL,
           lease_expires_at = NULL
       WHERE status IN (${ACTIVE_INTENT_STATUSES.map(() => "?").join(", ")})
         AND first_signal_at <= ?`,
    )
    .run(now, ...ACTIVE_INTENT_STATUSES, cutoff);
  return result.changes;
}

export function listWebhookEvents(
  db: Database.Database,
  limit = 50,
): WebhookEvent[] {
  const normalizedLimit = Number.isFinite(limit) ? Math.floor(limit) : 50;
  const boundedLimit = Math.max(1, normalizedLimit);
  const rows = db
    .prepare(
      `SELECT * FROM webhook_events
       ORDER BY received_at DESC, id DESC
       LIMIT ?`,
    )
    .all(boundedLimit) as WebhookEventRow[];
  return rows.map(rowToWebhookEvent);
}
