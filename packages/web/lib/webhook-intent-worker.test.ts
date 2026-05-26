/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  initSchema,
  mergeWebhookIntent,
  queryDiagnosticEvents,
  recordDeployment,
  recordWebhookEvent,
  seedDefaults,
  setSetting,
  updateRepoWebhookSettings,
} from "@issuectl/core";
import { runWebhookIntentWorkerOnce } from "./webhook-intent-worker.js";

const notifyDeploymentTerminalOutcome = vi.hoisted(() => vi.fn());
vi.mock("./push/notifications", () => ({
  notifyDeploymentTerminalOutcome: (...args: unknown[]) => notifyDeploymentTerminalOutcome(...args),
}));

type IntentRow = {
  status: string;
  scheduled_at: number;
  processing_started_at: number | null;
  lease_expires_at: number | null;
  resolved_at: number | null;
  deployment_id: number | null;
  failure_reason: string | null;
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
      `SELECT status, scheduled_at, processing_started_at, lease_expires_at,
              resolved_at, deployment_id, failure_reason
       FROM webhook_intents WHERE id = ?`,
    )
    .get(id) as IntentRow | undefined;
  if (!row) throw new Error(`Missing webhook intent ${id}`);
  return row;
}

function getDeploymentByIdForTest(db: Database.Database, id: number) {
  return db.prepare("SELECT ended_at FROM deployments WHERE id = ?").get(id);
}

function testWorkerDeps() {
  return {
    fetchIssueState: async () => ({
      title: "Fix webhook auto launch",
      state: "open",
      labels: ["issuectl:auto-launch"],
    }),
    launchIssue: async (
      _db: Database.Database,
      _repo: unknown,
      intent: { repoId: number; targetNumber: number; requestedAgent: "claude" | "codex" | null },
      _issue: unknown,
      triggeredBy: "webhook" | "comment_command",
    ) => {
      const deploymentId = recordDeployment(_db, {
        repoId: intent.repoId,
        issueNumber: intent.targetNumber,
        agent: intent.requestedAgent ?? "claude",
        branchName: "issue-506",
        workspaceMode: "worktree",
        workspacePath: "/tmp/issuectl-test",
      }).id;
      _db.prepare("UPDATE deployments SET triggered_by = ? WHERE id = ?").run(triggeredBy, deploymentId);
      return { deploymentId };
    },
  };
}

async function runWorker(
  db: Database.Database,
  now: number,
  deps: Partial<Parameters<typeof runWebhookIntentWorkerOnce>[2]> = {},
) {
  return runWebhookIntentWorkerOnce(db, now, { ...testWorkerDeps(), ...deps });
}

function expectWorkerResult(
  result: Awaited<ReturnType<typeof runWebhookIntentWorkerOnce>>,
  values: Partial<Awaited<ReturnType<typeof runWebhookIntentWorkerOnce>>>,
): void {
  expect(result).toEqual({
    claimed: 0,
    recovered: 0,
    expired: 0,
    prunedPayloads: 0,
    launched: 0,
    deferred: 0,
    skippedLocked: 0,
    skippedOptout: 0,
    failed: 0,
    endedSessions: 0,
    ...values,
  });
}

describe("runWebhookIntentWorkerOnce", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    notifyDeploymentTerminalOutcome.mockReset();
    db = createTestDb();
    repoId = addRepo(db, { owner: "mean-weasel", name: "issuectl" }).id;
    updateRepoWebhookSettings(db, repoId, { autoLaunchIssues: true });
  });

  it("launches due opted-in issue intents", async () => {
    const launchIssue = vi.fn(testWorkerDeps().launchIssue);
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 2_000,
      requestedAgent: "codex",
    });

    const result = await runWorker(db, 2_000, { launchIssue });

    expectWorkerResult(result, { claimed: 1, launched: 1 });
    expect(launchIssue).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ id: repoId }),
      expect.objectContaining({ id: intentId }),
      expect.objectContaining({ title: "Fix webhook auto launch" }),
      "webhook",
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(queryDiagnosticEvents(db, {
      target: { owner: "mean-weasel", repo: "issuectl", targetType: "issue", targetNumber: 506 },
      events: ["webhook.lock_check"],
    })).toEqual([
      expect.objectContaining({
        issueNumber: 506,
        targetType: "issue",
        targetNumber: 506,
        message: "Issue has no live session.",
      }),
    ]);
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({
        status: "launched",
        processing_started_at: null,
        lease_expires_at: null,
        deployment_id: 1,
      }),
    );
    expect(db.prepare("SELECT agent FROM deployments WHERE id = 1").get()).toEqual({ agent: "codex" });
  });

  it("broadcasts live-tail updates when issue intent state changes", async () => {
    const broadcastEventsChanged = vi.fn();
    mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 2_000,
    });

    const result = await runWorker(db, 2_000, { broadcastEventsChanged });

    expectWorkerResult(result, { claimed: 1, launched: 1 });
    expect(broadcastEventsChanged).toHaveBeenCalledTimes(2);
  });

  it("recovers expired processing leases to pending", async () => {
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

    const result = await runWorker(db, 3_000);

    expectWorkerResult(result, { recovered: 1 });
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({
        status: "pending",
        processing_started_at: null,
        lease_expires_at: null,
      }),
    );
  });

  it("recovers orphaned active PR review rows before claiming new work", async () => {
    db.prepare(
      `INSERT INTO pr_reviews (
        repo_id, pr_number, started_head_sha, review_base_sha, reviewed_to_sha,
        head_repo_full_name, head_ref, status, triggered_by, started_at
      ) VALUES (?, 44, 'head-b', 'base-a', 'head-b', 'mean-weasel/issuectl',
        'feature/webhooks', 'launching', 'webhook', 1000)`,
    ).run(repoId);

    const result = await runWorker(db, 3_000);

    expectWorkerResult(result, { recovered: 0 });
    expect(db.prepare("SELECT status, completed_at, result_json FROM pr_reviews").get()).toEqual({
      status: "failed",
      completed_at: 3_000,
      result_json: JSON.stringify({ reason: "orphaned_before_deployment" }),
    });
    expect(queryDiagnosticEvents(db, { events: ["webhook.pr_review_recovered"] })).toEqual([
      expect.objectContaining({
        owner: "mean-weasel",
        repo: "issuectl",
        targetType: "pr",
        targetNumber: 44,
        status: "failed",
      }),
    ]);
  });

  it("expires active intents beyond max age", async () => {
    setSetting(db, "max_webhook_intent_age_minutes", "1");
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 1_500,
    });

    const result = await runWorker(db, 61_000);

    expectWorkerResult(result, { expired: 1 });
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({
        status: "expired",
        processing_started_at: null,
        lease_expires_at: null,
        resolved_at: 61_000,
      }),
    );
  });

  it("skips opted-in issues when another session is already live", async () => {
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 2_000,
    });
    recordDeployment(db, {
      repoId,
      issueNumber: 506,
      branchName: "issue-506",
      workspaceMode: "worktree",
      workspacePath: "/tmp/issuectl-live",
    });

    const result = await runWorker(db, 2_000);

    expectWorkerResult(result, { claimed: 1, skippedLocked: 1 });
    expect(queryDiagnosticEvents(db, {
      target: { owner: "mean-weasel", repo: "issuectl", targetType: "issue", targetNumber: 506 },
      events: ["webhook.lock_check"],
    })).toEqual([
      expect.objectContaining({
        issueNumber: 506,
        targetType: "issue",
        targetNumber: 506,
        message: "Issue already has a live session.",
      }),
    ]);
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({
        status: "skipped_locked",
        deployment_id: null,
      }),
    );
  });

  it("skips issues that are not opted in by repo flag or label", async () => {
    updateRepoWebhookSettings(db, repoId, { autoLaunchIssues: false });
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 2_000,
    });

    const result = await runWorker(db, 2_000);

    expectWorkerResult(result, { claimed: 1, skippedOptout: 1 });
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({ status: "skipped_optout" }),
    );
    expect(queryDiagnosticEvents(db, { events: ["webhook.kill_switch"] })).toHaveLength(1);
  });

  it("ends prior webhook-launched sessions on issue close or label removal", async () => {
    const deploymentId = recordDeployment(db, {
      repoId,
      issueNumber: 506,
      branchName: "issue-506",
      workspaceMode: "worktree",
      workspacePath: "/tmp/issuectl-live",
    }).id;
    db.prepare("UPDATE deployments SET triggered_by = 'webhook' WHERE id = ?").run(deploymentId);
    const priorIntentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 500,
      scheduledAt: 500,
    });
    db.prepare("UPDATE webhook_intents SET status = 'launched', deployment_id = ?, resolved_at = ? WHERE id = ?").run(deploymentId, 600, priorIntentId);
    const event = recordWebhookEvent(db, {
      deliveryId: "delivery-close",
      repoId,
      eventType: "issues",
      action: "closed",
      targetType: "issue",
      targetNumber: 506,
      receivedAt: 1_000,
    });
    mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 2_000,
      eventId: event.deduped ? null : event.eventId,
    });

    const result = await runWorker(db, 2_000);

    expectWorkerResult(result, { claimed: 1, skippedOptout: 1, endedSessions: 1 });
    expect(queryDiagnosticEvents(db, { events: ["webhook.kill_switch"] })).toHaveLength(1);
    expect(getDeploymentByIdForTest(db, deploymentId)).toEqual(
      expect.objectContaining({ ended_at: expect.any(String) }),
    );
  });

  it("records diagnostics for recoveries, expirations, and claims", async () => {
    setSetting(db, "max_webhook_intent_age_minutes", "1");
    const recoveredId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 100_000,
    });
    db.prepare(
      "UPDATE webhook_intents SET status = 'processing', processing_started_at = ?, lease_expires_at = ? WHERE id = ?",
    ).run(2_000, 3_000, recoveredId);
    mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 507,
      signalAt: 1_000,
      scheduledAt: 100_000,
    });
    mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 508,
      signalAt: 10_000,
      scheduledAt: 61_000,
    });

    const result = await runWorker(db, 61_000);

    expectWorkerResult(result, { claimed: 1, recovered: 1, expired: 2, launched: 1 });
    expect(queryDiagnosticEvents(db, { events: ["webhook.intent_recovered"] })).toEqual([
      expect.objectContaining({
        owner: "mean-weasel",
        repo: "issuectl",
        issueNumber: 506,
        targetType: "issue",
        targetNumber: 506,
      }),
    ]);
    expect(queryDiagnosticEvents(db, { events: ["webhook.expired"] })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        owner: "mean-weasel",
        repo: "issuectl",
        issueNumber: 506,
      }),
      expect.objectContaining({
        owner: "mean-weasel",
        repo: "issuectl",
        issueNumber: 507,
      }),
    ]));
    expect(queryDiagnosticEvents(db, { events: ["webhook.intent_claimed"] })).toEqual([
      expect.objectContaining({
        owner: "mean-weasel",
        repo: "issuectl",
        issueNumber: 508,
        targetType: "issue",
        targetNumber: 508,
      }),
    ]);
  });

  it("prunes expired raw payloads while keeping delivery tombstones", async () => {
    recordWebhookEvent(db, {
      deliveryId: "delivery-raw",
      repoId,
      eventType: "issues",
      action: "opened",
      targetType: "issue",
      targetNumber: 506,
      payloadJson: JSON.stringify({ secret: "payload" }),
      receivedAt: 1_000,
      retainedUntil: 2_000,
    });

    const result = await runWorker(db, 2_000);

    expect(result.prunedPayloads).toBe(1);
    expect(db.prepare("SELECT payload_json FROM webhook_events").get()).toEqual({ payload_json: null });
    expect(db.prepare("SELECT COUNT(*) AS count FROM webhook_deliveries").get()).toEqual({ count: 1 });
  });

  it("prunes webhook event rows older than 30 days while keeping delivery tombstones", async () => {
    const now = 31 * 24 * 60 * 60 * 1000;
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
      receivedAt: now - 1_000,
    });

    await runWorker(db, now);

    expect(
      db.prepare("SELECT delivery_id FROM webhook_events ORDER BY delivery_id").all(),
    ).toEqual([{ delivery_id: "delivery-new" }]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM webhook_deliveries").get()).toEqual({ count: 2 });
  });
});
