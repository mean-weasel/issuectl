import type Database from "better-sqlite3";
import {
  pruneOldWebhookEvents,
  pruneExpiredWebhookPayloads as pruneExpiredWebhookPayloadRows,
} from "@issuectl/core";

const WEBHOOK_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

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
    prunedEvents: pruneOldWebhookEvents(db, now, WEBHOOK_EVENT_RETENTION_MS),
  };
}
