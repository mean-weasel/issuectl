import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  claimDueWebhookIntent,
  initSchema,
  mergeWebhookIntent,
  queryDiagnosticEvents,
  recordDeployment,
  seedDefaults,
  setSetting,
} from "@issuectl/core";
import { enforceWebhookRunawayControls } from "./webhook-runaway-controls.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  seedDefaults(db);
  return db;
}

function getIntentRow(db: Database.Database, id: number) {
  return db.prepare(
    `SELECT status, scheduled_at, resolved_at, failure_reason
     FROM webhook_intents WHERE id = ?`,
  ).get(id);
}

describe("webhook runaway controls", () => {
  let db: Database.Database;
  let repo: ReturnType<typeof addRepo>;

  beforeEach(() => {
    db = createTestDb();
    repo = addRepo(db, { owner: "mean-weasel", name: "issuectl" });
  });

  it("defers launches when the global concurrent webhook agent cap is reached", () => {
    setSetting(db, "max_concurrent_webhook_agents", "1");
    const activeDeploymentId = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 999,
      branchName: "issue-999",
      workspaceMode: "worktree",
      workspacePath: "/tmp/issuectl-live",
    }).id;
    db.prepare("UPDATE deployments SET triggered_by = 'webhook' WHERE id = ?").run(activeDeploymentId);
    const intent = claimIntent(db, 506, 2_000);

    const decision = enforceWebhookRunawayControls(db, repo, intent, 2_000);

    expect(decision).toEqual({
      allowed: false,
      outcome: "deferred",
      reason: "concurrent_agents_exceeded",
    });
    expect(getIntentRow(db, intent.id)).toEqual(
      expect.objectContaining({ status: "deferred", scheduled_at: 12_000 }),
    );
    expect(queryDiagnosticEvents(db, { events: ["webhook.runaway_limited"] })).toEqual([
      expect.objectContaining({
        status: "concurrent_agents_exceeded",
        targetType: "issue",
        targetNumber: 506,
      }),
    ]);
  });

  it("counts active comment-command sessions toward the webhook agent cap", () => {
    setSetting(db, "max_concurrent_webhook_agents", "1");
    const activeDeploymentId = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 999,
      branchName: "issue-999",
      workspaceMode: "worktree",
      workspacePath: "/tmp/issuectl-live",
    }).id;
    db.prepare("UPDATE deployments SET triggered_by = 'comment_command' WHERE id = ?").run(activeDeploymentId);
    const intent = claimIntent(db, 506, 2_000);

    const decision = enforceWebhookRunawayControls(db, repo, intent, 2_000);

    expect(decision).toEqual({
      allowed: false,
      outcome: "deferred",
      reason: "concurrent_agents_exceeded",
    });
    expect(getIntentRow(db, intent.id)).toEqual(
      expect.objectContaining({ status: "deferred", scheduled_at: 12_000 }),
    );
  });

  it("defers launches when the repo launch-rate cap is reached", () => {
    setSetting(db, "max_webhook_launches_per_minute", "1");
    const launchedId = mergeWebhookIntent(db, {
      repoId: repo.id,
      targetType: "issue",
      targetNumber: 505,
      signalAt: 1_000,
      scheduledAt: 1_000,
    });
    db.prepare("UPDATE webhook_intents SET status = 'launched', resolved_at = ? WHERE id = ?").run(1_500, launchedId);
    const intent = claimIntent(db, 506, 2_000);

    const decision = enforceWebhookRunawayControls(db, repo, intent, 2_000);

    expect(decision).toEqual({
      allowed: false,
      outcome: "deferred",
      reason: "launch_rate_exceeded",
    });
    expect(getIntentRow(db, intent.id)).toEqual(
      expect.objectContaining({
        status: "deferred",
        scheduled_at: 61_501,
        failure_reason: "launch_rate_exceeded",
      }),
    );
  });

  it("fails claimed intents when the active webhook queue exceeds the configured cap", () => {
    setSetting(db, "max_webhook_queue_depth", "0");
    const intent = claimIntent(db, 506, 2_000);

    const decision = enforceWebhookRunawayControls(db, repo, intent, 2_000);

    expect(decision).toEqual({
      allowed: false,
      outcome: "failed",
      reason: "queue_depth_exceeded",
    });
    expect(getIntentRow(db, intent.id)).toEqual(
      expect.objectContaining({
        status: "failed",
        resolved_at: 2_000,
        failure_reason: "queue_depth_exceeded",
      }),
    );
  });
});

function claimIntent(db: Database.Database, targetNumber: number, now: number) {
  mergeWebhookIntent(db, {
    repoId: 1,
    targetType: "issue",
    targetNumber,
    signalAt: 1_000,
    scheduledAt: now,
  });
  const intent = claimDueWebhookIntent(db, now, 60_000);
  if (!intent) throw new Error("Expected test intent to be claimed");
  return intent;
}
