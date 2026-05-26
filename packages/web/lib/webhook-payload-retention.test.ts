import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  initSchema,
  recordWebhookEvent,
  seedDefaults,
} from "@issuectl/core";
import { pruneExpiredWebhookData } from "./webhook-payload-retention";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  seedDefaults(db);
  return db;
}

describe("pruneExpiredWebhookData", () => {
  it("uses configurable webhook event retention while preserving delivery tombstones", () => {
    const db = createTestDb();
    const repoId = addRepo(db, { owner: "mean-weasel", name: "issuectl" }).id;
    db
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run("webhook_event_retention_days", "2");

    recordWebhookEvent(db, {
      deliveryId: "delivery-old",
      repoId,
      eventType: "issues",
      action: "opened",
      targetType: "issue",
      targetNumber: 506,
      receivedAt: 1_000,
    });
    recordWebhookEvent(db, {
      deliveryId: "delivery-new",
      repoId,
      eventType: "issues",
      action: "opened",
      targetType: "issue",
      targetNumber: 507,
      receivedAt: 2 * 24 * 60 * 60 * 1000,
    });

    expect(pruneExpiredWebhookData(db, 3 * 24 * 60 * 60 * 1000 + 1_000)).toEqual({
      prunedPayloads: 0,
      prunedEvents: 1,
    });
    expect(
      db.prepare("SELECT delivery_id FROM webhook_events ORDER BY delivery_id").all(),
    ).toEqual([{ delivery_id: "delivery-new" }]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM webhook_deliveries").get()).toEqual({
      count: 2,
    });
  });
});
