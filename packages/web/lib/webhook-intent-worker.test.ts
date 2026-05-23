import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  initSchema,
  mergeWebhookIntent,
  seedDefaults,
  setSetting,
} from "@issuectl/core";
import { runWebhookIntentWorkerOnce } from "./webhook-intent-worker.js";

type IntentRow = {
  status: string;
  processing_started_at: number | null;
  lease_expires_at: number | null;
  resolved_at: number | null;
  deployment_id: number | null;
};

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  seedDefaults(db);
  return db;
}

function getIntentRow(db: Database.Database, id: number): IntentRow {
  const row = db
    .prepare(
      "SELECT status, processing_started_at, lease_expires_at, resolved_at, deployment_id FROM webhook_intents WHERE id = ?",
    )
    .get(id) as IntentRow | undefined;
  if (!row) throw new Error(`Missing webhook intent ${id}`);
  return row;
}

describe("runWebhookIntentWorkerOnce", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    repoId = addRepo(db, { owner: "mean-weasel", name: "issuectl" }).id;
  });

  afterEach(() => {
    db.close();
  });

  it("claims due pending intents with a lease", () => {
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 2_000,
    });

    const result = runWebhookIntentWorkerOnce(db, 2_000);

    expect(result).toEqual({ claimed: 1, recovered: 0, expired: 0 });
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({
        status: "processing",
        processing_started_at: 2_000,
        lease_expires_at: 62_000,
      }),
    );
  });

  it("does not claim future scheduled intents", () => {
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 2_001,
    });

    const result = runWebhookIntentWorkerOnce(db, 2_000);

    expect(result).toEqual({ claimed: 0, recovered: 0, expired: 0 });
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({
        status: "pending",
        processing_started_at: null,
        lease_expires_at: null,
      }),
    );
  });

  it("recovers expired processing leases to pending", () => {
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 5_000,
    });
    db.prepare(
      "UPDATE webhook_intents SET status = 'processing', processing_started_at = ?, lease_expires_at = ? WHERE id = ?",
    ).run(2_000, 3_000, intentId);

    const result = runWebhookIntentWorkerOnce(db, 3_000);

    expect(result).toEqual({ claimed: 0, recovered: 1, expired: 0 });
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({
        status: "pending",
        processing_started_at: null,
        lease_expires_at: null,
      }),
    );
  });

  it("expires active intents beyond max age", () => {
    setSetting(db, "max_webhook_intent_age_minutes", "1");
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 1_500,
    });

    const result = runWebhookIntentWorkerOnce(db, 61_000);

    expect(result).toEqual({ claimed: 0, recovered: 0, expired: 1 });
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({
        status: "expired",
        processing_started_at: null,
        lease_expires_at: null,
        resolved_at: 61_000,
      }),
    );
  });

  it("does not launch agents in phase 1", () => {
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 2_000,
    });

    const result = runWebhookIntentWorkerOnce(db, 2_000);

    expect(result).toEqual({ claimed: 1, recovered: 0, expired: 0 });
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({
        status: "processing",
        deployment_id: null,
      }),
    );
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM deployments").get(),
    ).toEqual({ count: 0 });
  });
});
