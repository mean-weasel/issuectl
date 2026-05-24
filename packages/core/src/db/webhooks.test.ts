import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createRawTestDb } from "./test-helpers.js";
import { initSchema } from "./schema.js";
import { runMigrations } from "./migrations.js";
import { seedDefaults } from "./settings.js";
import { addRepo } from "./repos.js";
import {
  claimDueWebhookIntent,
  getWebhookEventByDelivery,
  listWebhookEvents,
  mergeWebhookIntent,
  pruneExpiredWebhookPayloads,
  recordWebhookEvent,
  recoverExpiredWebhookIntentLeases,
} from "./webhooks.js";

describe("webhook DB helpers", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createRawTestDb();
    initSchema(db);
    runMigrations(db);
    seedDefaults(db);
    repoId = addRepo(db, { owner: "mean-weasel", name: "issuectl" }).id;
  });

  it("records a delivery and event once", () => {
    const result = recordWebhookEvent(db, {
      deliveryId: "delivery-1",
      repoId,
      eventType: "issues",
      action: "opened",
      senderLogin: "octocat",
      targetType: "issue",
      targetNumber: 506,
      payloadJson: JSON.stringify({ action: "opened" }),
      receivedAt: 1_000,
    });

    expect(result).toEqual({ deduped: false, eventId: 1 });

    const delivery = db
      .prepare("SELECT * FROM webhook_deliveries WHERE delivery_id = ?")
      .get("delivery-1") as { event_type: string; repo_id: number } | undefined;
    expect(delivery).toMatchObject({ event_type: "issues", repo_id: repoId });

    expect(listWebhookEvents(db)).toEqual([
      expect.objectContaining({
        id: 1,
        deliveryId: "delivery-1",
        repoId,
        eventType: "issues",
        action: "opened",
        senderLogin: "octocat",
        targetType: "issue",
        targetNumber: 506,
        payloadJson: JSON.stringify({ action: "opened" }),
        receivedAt: 1_000,
        intentId: null,
      }),
    ]);
  });

  it("dedupes repeated delivery ids", () => {
    const input = {
      deliveryId: "delivery-1",
      repoId,
      eventType: "issues",
      action: "opened",
      senderLogin: "octocat",
      targetType: "issue" as const,
      targetNumber: 506,
      receivedAt: 1_000,
    };

    expect(recordWebhookEvent(db, input)).toEqual({
      deduped: false,
      eventId: 1,
    });
    expect(
      recordWebhookEvent(db, { ...input, action: "labeled", receivedAt: 1_001 }),
    ).toEqual({ deduped: true });

    expect(
      db.prepare("SELECT COUNT(*) AS count FROM webhook_deliveries").get(),
    ).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM webhook_events").get()).toEqual({
      count: 1,
    });
  });

  it("filters listed events by repo and target", () => {
    const otherRepoId = addRepo(db, { owner: "mean-weasel", name: "other" }).id;
    recordWebhookEvent(db, {
      deliveryId: "delivery-1",
      repoId,
      eventType: "issues",
      action: "opened",
      targetType: "issue",
      targetNumber: 506,
      receivedAt: 1_000,
    });
    recordWebhookEvent(db, {
      deliveryId: "delivery-2",
      repoId,
      eventType: "pull_request",
      action: "opened",
      targetType: "pr",
      targetNumber: 17,
      receivedAt: 2_000,
    });
    recordWebhookEvent(db, {
      deliveryId: "delivery-3",
      repoId: otherRepoId,
      eventType: "issues",
      action: "opened",
      targetType: "issue",
      targetNumber: 506,
      receivedAt: 3_000,
    });

    expect(
      listWebhookEvents(db, {
        repoId,
        targetType: "issue",
        targetNumber: 506,
      }),
    ).toEqual([
      expect.objectContaining({
        deliveryId: "delivery-1",
        repoId,
        targetType: "issue",
        targetNumber: 506,
      }),
    ]);
  });

  it("prunes expired raw payloads without deleting delivery tombstones", () => {
    recordWebhookEvent(db, {
      deliveryId: "delivery-raw",
      repoId,
      eventType: "issues",
      action: "opened",
      payloadJson: JSON.stringify({ sensitive: true }),
      receivedAt: 1_000,
      retainedUntil: 2_000,
    });
    recordWebhookEvent(db, {
      deliveryId: "delivery-keep",
      repoId,
      eventType: "issues",
      action: "opened",
      payloadJson: JSON.stringify({ keep: true }),
      receivedAt: 1_000,
      retainedUntil: 3_000,
    });

    expect(pruneExpiredWebhookPayloads(db, 2_000)).toBe(1);

    expect(
      db
        .prepare("SELECT delivery_id, payload_json FROM webhook_events ORDER BY delivery_id")
        .all(),
    ).toEqual([
      { delivery_id: "delivery-keep", payload_json: JSON.stringify({ keep: true }) },
      { delivery_id: "delivery-raw", payload_json: null },
    ]);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM webhook_deliveries").get(),
    ).toEqual({ count: 2 });
  });

  it("finds an existing event by delivery id and repo", () => {
    recordWebhookEvent(db, {
      deliveryId: "delivery-1",
      repoId,
      eventType: "issues",
      action: "opened",
      senderLogin: "octocat",
      targetType: "issue",
      targetNumber: 506,
      receivedAt: 1_000,
    });

    expect(
      getWebhookEventByDelivery(db, {
        deliveryId: "delivery-1",
        repoId,
      }),
    ).toEqual(
      expect.objectContaining({
        id: 1,
        deliveryId: "delivery-1",
        repoId,
        eventType: "issues",
        action: "opened",
        intentId: null,
      }),
    );

    expect(
      getWebhookEventByDelivery(db, {
        deliveryId: "delivery-1",
        repoId: repoId + 1,
      }),
    ).toBeUndefined();
  });

  it("claims and recovers stale processing intents", () => {
    const intentId = insertPendingIntent(db, repoId, "pr", 42, 1_000, 1_050);

    expect(claimDueWebhookIntent(db, 1_049, 500)).toBeUndefined();

    const claimed = claimDueWebhookIntent(db, 1_050, 500);
    expect(claimed).toEqual(
      expect.objectContaining({
        id: intentId,
        status: "processing",
        processingStartedAt: 1_050,
        leaseExpiresAt: 1_550,
      }),
    );
    expect(claimDueWebhookIntent(db, 1_051, 500)).toBeUndefined();

    expect(recoverExpiredWebhookIntentLeases(db, 1_549)).toBe(0);
    expect(recoverExpiredWebhookIntentLeases(db, 1_550)).toBe(1);

    const recovered = db
      .prepare("SELECT status, processing_started_at, lease_expires_at FROM webhook_intents WHERE id = ?")
      .get(intentId);
    expect(recovered).toEqual({
      status: "pending",
      processing_started_at: null,
      lease_expires_at: null,
    });
  });

  it("preserves requested agent and review mode through merged intents", () => {
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 44,
      signalAt: 1_000,
      scheduledAt: 1_050,
      requestedAgent: "codex",
      reviewMode: "full",
    });

    mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 44,
      signalAt: 1_100,
      scheduledAt: 1_150,
    });

    const claimed = claimDueWebhookIntent(db, 1_150, 500);
    expect(claimed).toEqual(expect.objectContaining({
      id: intentId,
      requestedAgent: "codex",
      reviewMode: "full",
    }));
  });

  it("does not return stale active rows as claimed", () => {
    const intentId = insertPendingIntent(db, repoId, "issue", 507, 1_000, 1_000);
    db.prepare(
      "UPDATE webhook_intents SET status = 'launched', resolved_at = ? WHERE id = ?",
    ).run(1_001, intentId);

    expect(claimDueWebhookIntent(db, 1_002, 500)).toBeUndefined();

    expect(
      db
        .prepare(
          "SELECT status, processing_started_at, lease_expires_at FROM webhook_intents WHERE id = ?",
        )
        .get(intentId),
    ).toEqual({
      status: "launched",
      processing_started_at: null,
      lease_expires_at: null,
    });
  });

  it("migrates v22 webhook intents to include command options", () => {
    const oldDb = createRawTestDb();
    oldDb.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (22);
      CREATE TABLE webhook_intents (id INTEGER PRIMARY KEY AUTOINCREMENT);
    `);

    runMigrations(oldDb);

    const columns = oldDb.prepare("PRAGMA table_info(webhook_intents)").all();
    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "requested_agent" }),
        expect.objectContaining({ name: "review_mode" }),
      ]),
    );
  });
});

function insertPendingIntent(
  db: Database.Database,
  repoId: number,
  targetType: "issue" | "pr",
  targetNumber: number,
  signalAt: number,
  scheduledAt: number,
): number {
  const result = db
    .prepare(
      `INSERT INTO webhook_intents
        (repo_id, target_type, target_number, first_signal_at, last_signal_at, scheduled_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    )
    .run(repoId, targetType, targetNumber, signalAt, signalAt, scheduledAt);
  return Number(result.lastInsertRowid);
}
