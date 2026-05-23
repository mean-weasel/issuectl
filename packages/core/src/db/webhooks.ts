import type Database from "better-sqlite3";
import type { WebhookIntentStatus, WebhookTargetType } from "../types.js";

const ACTIVE_INTENT_STATUSES: WebhookIntentStatus[] = [
  "pending",
  "processing",
  "deferred",
];

export type RecordWebhookEventInput = {
  deliveryId: string;
  repoId: number;
  eventType: string;
  action?: string | null;
  senderLogin?: string | null;
  targetType?: WebhookTargetType | null;
  targetNumber?: number | null;
  payloadJson?: string | null;
  receivedAt: number;
  retainedUntil?: number | null;
};

export type RecordWebhookEventResult =
  | { deduped: true; eventId?: undefined }
  | { deduped: false; eventId: number };

export type MergeWebhookIntentInput = {
  repoId: number;
  targetType: WebhookTargetType;
  targetNumber: number;
  signalAt: number;
  scheduledAt: number;
  desiredHeadSha?: string | null;
  eventId?: number | null;
};

export type WebhookEvent = {
  id: number;
  deliveryId: string;
  repoId: number;
  eventType: string;
  action: string | null;
  senderLogin: string | null;
  targetType: WebhookTargetType | null;
  targetNumber: number | null;
  payloadJson: string | null;
  receivedAt: number;
  intentId: number | null;
};

export type WebhookIntent = {
  id: number;
  repoId: number;
  targetType: WebhookTargetType;
  targetNumber: number;
  firstSignalAt: number;
  lastSignalAt: number;
  scheduledAt: number;
  processingStartedAt: number | null;
  leaseExpiresAt: number | null;
  generation: number;
  desiredHeadSha: string | null;
  signalCount: number;
  status: WebhookIntentStatus;
  resolvedAt: number | null;
  deploymentId: number | null;
  failureReason: string | null;
};

type WebhookEventRow = {
  id: number;
  delivery_id: string;
  repo_id: number;
  event_type: string;
  action: string | null;
  sender_login: string | null;
  target_type: WebhookTargetType | null;
  target_number: number | null;
  payload_json: string | null;
  received_at: number;
  intent_id: number | null;
};

type WebhookIntentRow = {
  id: number;
  repo_id: number;
  target_type: WebhookTargetType;
  target_number: number;
  first_signal_at: number;
  last_signal_at: number;
  scheduled_at: number;
  processing_started_at: number | null;
  lease_expires_at: number | null;
  generation: number;
  desired_head_sha: string | null;
  signal_count: number;
  status: WebhookIntentStatus;
  resolved_at: number | null;
  deployment_id: number | null;
  failure_reason: string | null;
};

function isSqliteConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
      error.code === "SQLITE_CONSTRAINT_UNIQUE")
  );
}

function rowToWebhookEvent(row: WebhookEventRow): WebhookEvent {
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    repoId: row.repo_id,
    eventType: row.event_type,
    action: row.action,
    senderLogin: row.sender_login,
    targetType: row.target_type,
    targetNumber: row.target_number,
    payloadJson: row.payload_json,
    receivedAt: row.received_at,
    intentId: row.intent_id,
  };
}

function rowToWebhookIntent(row: WebhookIntentRow): WebhookIntent {
  return {
    id: row.id,
    repoId: row.repo_id,
    targetType: row.target_type,
    targetNumber: row.target_number,
    firstSignalAt: row.first_signal_at,
    lastSignalAt: row.last_signal_at,
    scheduledAt: row.scheduled_at,
    processingStartedAt: row.processing_started_at,
    leaseExpiresAt: row.lease_expires_at,
    generation: row.generation,
    desiredHeadSha: row.desired_head_sha,
    signalCount: row.signal_count,
    status: row.status,
    resolvedAt: row.resolved_at,
    deploymentId: row.deployment_id,
    failureReason: row.failure_reason,
  };
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

export function mergeWebhookIntent(
  db: Database.Database,
  input: MergeWebhookIntentInput,
): number {
  return db.transaction(() => {
    const active = db
      .prepare(
        `SELECT * FROM webhook_intents
         WHERE repo_id = ?
           AND target_type = ?
           AND target_number = ?
           AND status IN (${ACTIVE_INTENT_STATUSES.map(() => "?").join(", ")})
         ORDER BY id ASC
         LIMIT 1`,
      )
      .get(
        input.repoId,
        input.targetType,
        input.targetNumber,
        ...ACTIVE_INTENT_STATUSES,
      ) as WebhookIntentRow | undefined;

    if (active) {
      db.prepare(
        `UPDATE webhook_intents
         SET last_signal_at = ?,
             scheduled_at = ?,
             generation = generation + 1,
             desired_head_sha = COALESCE(?, desired_head_sha),
             signal_count = signal_count + 1
         WHERE id = ?`,
      ).run(
        input.signalAt,
        input.scheduledAt,
        input.desiredHeadSha ?? null,
        active.id,
      );

      if (input.eventId !== undefined && input.eventId !== null) {
        db.prepare("UPDATE webhook_events SET intent_id = ? WHERE id = ?").run(
          active.id,
          input.eventId,
        );
      }

      return active.id;
    }

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
  })();
}

export function claimDueWebhookIntent(
  db: Database.Database,
  now: number,
  leaseMs: number,
): WebhookIntent | undefined {
  return db.transaction(() => {
    const row = db
      .prepare(
        `SELECT * FROM webhook_intents
         WHERE status IN ('pending', 'deferred')
           AND scheduled_at <= ?
         ORDER BY scheduled_at ASC, id ASC
         LIMIT 1`,
      )
      .get(now) as WebhookIntentRow | undefined;

    if (!row) return undefined;

    db.prepare(
      `UPDATE webhook_intents
       SET status = 'processing',
           processing_started_at = ?,
           lease_expires_at = ?
       WHERE id = ?`,
    ).run(now, now + leaseMs, row.id);

    const claimed = db
      .prepare("SELECT * FROM webhook_intents WHERE id = ?")
      .get(row.id) as WebhookIntentRow;
    return rowToWebhookIntent(claimed);
  })();
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
