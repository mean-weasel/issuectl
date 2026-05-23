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

export function runWebhookIntentWorkerOnce(
  db: Database.Database,
  now = Date.now(),
): WebhookIntentWorkerResult {
  const recovered = recoverExpiredWebhookIntentLeases(db, now);
  const maxAgeMinutes = Number(
    getSetting(db, "max_webhook_intent_age_minutes") ?? "60",
  );
  const expired = expireOldWebhookIntents(db, now, maxAgeMinutes * 60_000);
  const intent = claimDueWebhookIntent(db, now, 60_000);
  if (!intent) return { claimed: 0, recovered, expired };

  // Phase 1 intentionally stops before launch integration.
  return { claimed: 1, recovered, expired };
}
