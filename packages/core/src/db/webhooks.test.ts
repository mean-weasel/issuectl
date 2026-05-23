import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createRawTestDb } from "./test-helpers.js";
import { initSchema } from "./schema.js";
import { runMigrations } from "./migrations.js";
import { seedDefaults } from "./settings.js";
import { addRepo } from "./repos.js";
import {
  claimDueWebhookIntent,
  listWebhookEvents,
  mergeWebhookIntent,
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

  it("merges repeated signals into one active intent", () => {
    const firstIntentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 1_060,
      desiredHeadSha: "abc",
    });
    const secondIntentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_020,
      scheduledAt: 1_080,
      desiredHeadSha: "def",
    });

    expect(secondIntentId).toBe(firstIntentId);

    const intent = db
      .prepare("SELECT * FROM webhook_intents WHERE id = ?")
      .get(firstIntentId) as Record<string, unknown>;
    expect(intent).toMatchObject({
      first_signal_at: 1_000,
      last_signal_at: 1_020,
      scheduled_at: 1_080,
      generation: 2,
      desired_head_sha: "def",
      signal_count: 2,
      status: "pending",
    });
  });

  it("allows one active intent per target across pending processing deferred", () => {
    const pendingId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 1_000,
    });

    db.prepare(
      "UPDATE webhook_intents SET status = 'processing', processing_started_at = ?, lease_expires_at = ? WHERE id = ?",
    ).run(1_001, 2_001, pendingId);

    const processingMergeId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_010,
      scheduledAt: 1_070,
    });
    expect(processingMergeId).toBe(pendingId);

    db.prepare(
      "UPDATE webhook_intents SET status = 'deferred', processing_started_at = NULL, lease_expires_at = NULL WHERE id = ?",
    ).run(pendingId);

    const deferredMergeId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_020,
      scheduledAt: 1_080,
    });
    expect(deferredMergeId).toBe(pendingId);

    expect(db.prepare("SELECT COUNT(*) AS count FROM webhook_intents").get()).toEqual({
      count: 1,
    });
    expect(() =>
      db
        .prepare(
          "INSERT INTO webhook_intents (repo_id, target_type, target_number, first_signal_at, last_signal_at, scheduled_at, status) VALUES (?, 'issue', ?, ?, ?, ?, 'pending')",
        )
        .run(repoId, 506, 1_030, 1_030, 1_090),
    ).toThrow();
  });

  it("claims and recovers stale processing intents", () => {
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 42,
      signalAt: 1_000,
      scheduledAt: 1_050,
    });

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
});
