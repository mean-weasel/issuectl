import type Database from "better-sqlite3";

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
