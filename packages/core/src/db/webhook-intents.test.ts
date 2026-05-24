import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createRawTestDb } from "./test-helpers.js";
import { initSchema } from "./schema.js";
import { runMigrations } from "./migrations.js";
import { seedDefaults } from "./settings.js";
import { addRepo } from "./repos.js";
import { mergeWebhookIntent } from "./webhooks.js";

describe("webhook intent merge helpers", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createRawTestDb();
    initSchema(db);
    runMigrations(db);
    seedDefaults(db);
    repoId = addRepo(db, { owner: "mean-weasel", name: "issuectl" }).id;
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

  it("caps repeated signals at the max debounce window from the first signal", () => {
    const firstIntentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 61_000,
      maxDebounceMs: 300_000,
    });
    const secondIntentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 290_000,
      scheduledAt: 350_000,
      maxDebounceMs: 300_000,
    });

    expect(secondIntentId).toBe(firstIntentId);
    expect(
      db.prepare("SELECT first_signal_at, last_signal_at, scheduled_at FROM webhook_intents WHERE id = ?").get(firstIntentId),
    ).toEqual({
      first_signal_at: 1_000,
      last_signal_at: 290_000,
      scheduled_at: 301_000,
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

  it("retries insert conflicts by merging into the active intent", () => {
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 1_060,
      desiredHeadSha: "abc",
    });
    const originalPrepare = db.prepare.bind(db);
    let hidActiveIntent = false;

    db.prepare = ((source: string) => {
      const statement = originalPrepare(source);
      if (
        !hidActiveIntent &&
        source.includes("SELECT * FROM webhook_intents") &&
        source.includes("status IN")
      ) {
        hidActiveIntent = true;
        const wrapper = Object.create(statement) as Database.Statement;
        wrapper.get = () => undefined;
        return wrapper;
      }
      return statement;
    }) as typeof db.prepare;

    try {
      const mergedIntentId = mergeWebhookIntent(db, {
        repoId,
        targetType: "issue",
        targetNumber: 506,
        signalAt: 1_020,
        scheduledAt: 1_080,
        desiredHeadSha: "def",
      });

      expect(mergedIntentId).toBe(intentId);
    } finally {
      db.prepare = originalPrepare;
    }

    expect(db.prepare("SELECT COUNT(*) AS count FROM webhook_intents").get()).toEqual({
      count: 1,
    });
    expect(
      db.prepare("SELECT signal_count, desired_head_sha FROM webhook_intents").get(),
    ).toEqual({ signal_count: 2, desired_head_sha: "def" });
  });

  it("retries merge in a fresh transaction after sqlite busy snapshot", () => {
    const originalTransaction = db.transaction.bind(db);
    let transactionAttempts = 0;

    db.transaction = ((fn: Parameters<typeof db.transaction>[0]) => {
      const transaction = originalTransaction(fn);
      if (transactionAttempts === 0) {
        return ((..._args: unknown[]) => {
          transactionAttempts += 1;
          const error = new Error("busy snapshot") as Error & { code: string };
          error.code = "SQLITE_BUSY_SNAPSHOT";
          throw error;
        }) as unknown as ReturnType<typeof db.transaction>;
      }

      return ((...args: unknown[]) => {
        transactionAttempts += 1;
        return transaction(...args);
      }) as unknown as ReturnType<typeof db.transaction>;
    }) as typeof db.transaction;

    try {
      const intentId = mergeWebhookIntent(db, {
        repoId,
        targetType: "issue",
        targetNumber: 508,
        signalAt: 1_000,
        scheduledAt: 1_060,
      });

      expect(intentId).toBe(1);
      expect(transactionAttempts).toBe(2);
    } finally {
      db.transaction = originalTransaction;
    }

    expect(db.prepare("SELECT COUNT(*) AS count FROM webhook_intents").get()).toEqual({
      count: 1,
    });
  });
});
