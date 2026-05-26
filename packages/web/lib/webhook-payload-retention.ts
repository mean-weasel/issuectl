import type Database from "better-sqlite3";
import {
  pruneOldWebhookEvents,
  pruneExpiredWebhookPayloads as pruneExpiredWebhookPayloadRows,
} from "@issuectl/core";

const DEFAULT_WEBHOOK_EVENT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type WebhookRetentionResult = {
  prunedPayloads: number;
  prunedEvents: number;
};

export function pruneExpiredWebhookPayloads(
  db: Database.Database,
  now: number,
): number {
  return pruneExpiredWebhookPayloadRows(db, now);
}

export function pruneExpiredWebhookData(
  db: Database.Database,
  now: number,
): WebhookRetentionResult {
  return {
    prunedPayloads: pruneExpiredWebhookPayloadRows(db, now),
    prunedEvents: pruneOldWebhookEvents(db, now, getWebhookEventRetentionMs(db)),
  };
}

function getWebhookEventRetentionMs(db: Database.Database): number {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("webhook_event_retention_days") as { value: string } | undefined;
  const parsed = Number(row?.value ?? String(DEFAULT_WEBHOOK_EVENT_RETENTION_DAYS));
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_WEBHOOK_EVENT_RETENTION_DAYS * DAY_MS;
  return parsed * DAY_MS;
}
