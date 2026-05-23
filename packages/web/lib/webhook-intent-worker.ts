import type Database from "better-sqlite3";
import {
  claimDueWebhookIntent,
  expireOldWebhookIntents,
  getSetting,
  recoverExpiredWebhookIntentLeases,
} from "@issuectl/core";

export type WebhookIntentWorkerResult = {
  claimed: number;
  recovered: number;
  expired: number;
};

const DEFAULT_MAX_WEBHOOK_INTENT_AGE_MINUTES = 60;

function parseMaxWebhookIntentAgeMinutes(value: string | undefined): number {
  const parsed = Number(value ?? String(DEFAULT_MAX_WEBHOOK_INTENT_AGE_MINUTES));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_MAX_WEBHOOK_INTENT_AGE_MINUTES;
  }
  return parsed;
}

export function runWebhookIntentWorkerOnce(
  db: Database.Database,
  now = Date.now(),
): WebhookIntentWorkerResult {
  const recovered = recoverExpiredWebhookIntentLeases(db, now);
  const maxAgeMinutes = parseMaxWebhookIntentAgeMinutes(
    getSetting(db, "max_webhook_intent_age_minutes"),
  );
  const expired = expireOldWebhookIntents(db, now, maxAgeMinutes * 60_000);
  const intent = claimDueWebhookIntent(db, now, 60_000);
  if (!intent) return { claimed: 0, recovered, expired };

  // Phase 1 intentionally stops before launch integration.
  return { claimed: 1, recovered, expired };
}
