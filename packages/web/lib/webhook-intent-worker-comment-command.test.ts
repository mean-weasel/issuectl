import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  initSchema,
  mergeWebhookIntent,
  recordDeployment,
  recordWebhookEvent,
  seedDefaults,
  updateRepoWebhookSettings,
} from "@issuectl/core";
import { runWebhookIntentWorkerOnce } from "./webhook-intent-worker.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  seedDefaults(db);
  return db;
}

function getDeploymentByIdForTest(db: Database.Database, id: number) {
  return db.prepare("SELECT ended_at FROM deployments WHERE id = ?").get(id);
}

function getIntentStatus(db: Database.Database, id: number) {
  return db.prepare("SELECT status FROM webhook_intents WHERE id = ?").get(id);
}

function testWorkerDeps() {
  return {
    fetchIssueState: async () => ({
      title: "Manual command launch",
      state: "open",
      labels: [],
    }),
    launchIssue: async (
      db: Database.Database,
      _repo: unknown,
      intent: { repoId: number; targetNumber: number },
      _issue: unknown,
      triggeredBy: "webhook" | "comment_command",
    ) => {
      const deploymentId = recordDeployment(db, {
        repoId: intent.repoId,
        issueNumber: intent.targetNumber,
        branchName: "issue-506",
        workspaceMode: "worktree",
        workspacePath: "/tmp/issuectl-test",
      }).id;
      db.prepare("UPDATE deployments SET triggered_by = ? WHERE id = ?").run(triggeredBy, deploymentId);
      return { deploymentId };
    },
  };
}

describe("comment-command webhook intents", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    repoId = addRepo(db, { owner: "mean-weasel", name: "issuectl" }).id;
    updateRepoWebhookSettings(db, repoId, { autoLaunchIssues: false });
  });

  afterEach(() => {
    db.close();
  });

  it("launches issue intents without the auto-launch label", async () => {
    const event = recordWebhookEvent(db, {
      deliveryId: "delivery-command",
      repoId,
      eventType: "issue_comment",
      action: "created",
      targetType: "issue",
      targetNumber: 506,
      senderLogin: "octocat",
      receivedAt: 1_000,
    });
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 1_000,
      scheduledAt: 2_000,
      eventId: event.deduped ? null : event.eventId,
    });

    const result = await runWebhookIntentWorkerOnce(db, 2_000, testWorkerDeps());

    expect(result).toEqual(expect.objectContaining({ claimed: 1, launched: 1 }));
    expect(getIntentStatus(db, intentId)).toEqual({ status: "launched" });
    expect(
      db.prepare("SELECT triggered_by FROM deployments WHERE id = 1").get(),
    ).toEqual({ triggered_by: "comment_command" });
  });

  it("does not end comment-command sessions on label removal", async () => {
    const deploymentId = recordDeployment(db, {
      repoId,
      issueNumber: 506,
      branchName: "issue-506-command",
      workspaceMode: "worktree",
      workspacePath: "/tmp/issuectl-command",
    }).id;
    db.prepare("UPDATE deployments SET triggered_by = 'comment_command' WHERE id = ?").run(deploymentId);
    const priorEvent = recordWebhookEvent(db, {
      deliveryId: "delivery-command-launch",
      repoId,
      eventType: "issue_comment",
      action: "created",
      targetType: "issue",
      targetNumber: 506,
      senderLogin: "octocat",
      receivedAt: 500,
    });
    const priorIntentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "issue",
      targetNumber: 506,
      signalAt: 500,
      scheduledAt: 500,
      eventId: priorEvent.deduped ? null : priorEvent.eventId,
    });
    db.prepare(
      "UPDATE webhook_intents SET status = 'launched', deployment_id = ?, resolved_at = ? WHERE id = ?",
    ).run(deploymentId, 600, priorIntentId);
    const event = recordWebhookEvent(db, {
      deliveryId: "delivery-unlabel",
      repoId,
      eventType: "issues",
      action: "unlabeled",
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

    const result = await runWebhookIntentWorkerOnce(db, 2_000, testWorkerDeps());

    expect(result).toEqual(expect.objectContaining({ claimed: 1, skippedOptout: 1, endedSessions: 0 }));
    expect(getDeploymentByIdForTest(db, deploymentId)).toEqual({ ended_at: null });
  });
});
