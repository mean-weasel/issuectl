import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  initSchema,
  mergeWebhookIntent,
  queryDiagnosticEvents,
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS pr_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      pr_number INTEGER NOT NULL,
      deployment_id INTEGER REFERENCES deployments(id),
      started_head_sha TEXT NOT NULL,
      completed_head_sha TEXT,
      review_base_sha TEXT NOT NULL,
      reviewed_from_sha TEXT,
      reviewed_to_sha TEXT NOT NULL,
      head_repo_full_name TEXT NOT NULL,
      head_ref TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'reserved',
      triggered_by TEXT NOT NULL,
      result_json TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      UNIQUE(repo_id, pr_number, reviewed_to_sha)
    );
  `);
  seedDefaults(db);
  return db;
}

const safePull = {
  title: "Add webhook review",
  body: "Please review",
  state: "open",
  draft: false,
  labels: ["issuectl:auto-review"],
  headRef: "feature/webhooks",
  baseRef: "main",
  headSha: "head-b",
  baseSha: "base-a",
  headRepoFullName: "mean-weasel/issuectl",
  baseRepoFullName: "mean-weasel/issuectl",
  defaultBranch: "main",
};

describe("PR webhook control events", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    repoId = addRepo(db, { owner: "mean-weasel", name: "issuectl" }).id;
    updateRepoWebhookSettings(db, repoId, { autoReviewPrs: true });
  });

  it("ends webhook PR sessions when auto-review is disabled", async () => {
    updateRepoWebhookSettings(db, repoId, { autoReviewPrs: false });
    const deploymentId = seedActiveReview("webhook", 51);
    seedIntent("pull_request", "synchronize", 51);

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => safePull,
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, skippedOptout: 1, endedSessions: 1 }));
    expect(db.prepare("SELECT ended_at FROM deployments WHERE id = ?").get(deploymentId)).toEqual({ ended_at: expect.any(String) });
    expect(db.prepare("SELECT status FROM pr_reviews WHERE pr_number = 51").get()).toEqual({ status: "superseded" });
  });

  it("ends webhook PR sessions on unlabeled opt-out", async () => {
    const deploymentId = seedActiveReview("webhook", 52);
    seedIntent("pull_request", "unlabeled", 52);

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => ({ ...safePull, labels: [] }),
    });

    expect(result).toEqual(expect.objectContaining({ endedSessions: 1 }));
    expect(db.prepare("SELECT ended_at FROM deployments WHERE id = ?").get(deploymentId)).toEqual({ ended_at: expect.any(String) });
    expect(queryDiagnosticEvents(db, { events: ["webhook.pr_session_ended"] })).toHaveLength(1);
  });

  it("preserves manual PR sessions on opt-out controls", async () => {
    updateRepoWebhookSettings(db, repoId, { autoReviewPrs: false });
    const deploymentId = seedActiveReview("manual", 53);
    seedIntent("pull_request", "synchronize", 53);

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => safePull,
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, skippedOptout: 1, endedSessions: 0 }));
    expect(db.prepare("SELECT ended_at FROM deployments WHERE id = ?").get(deploymentId)).toEqual({ ended_at: null });
    expect(db.prepare("SELECT status FROM pr_reviews WHERE pr_number = 53").get()).toEqual({ status: "in_progress" });
  });

  function seedActiveReview(triggeredBy: "manual" | "webhook", prNumber: number): number {
    const deploymentId = recordDeployment(db, {
      repoId,
      issueNumber: prNumber,
      branchName: `pr-${prNumber}-review`,
      workspaceMode: "worktree",
      workspacePath: `/tmp/pr-${prNumber}`,
    }).id;
    db.prepare("UPDATE deployments SET triggered_by = ? WHERE id = ?").run(triggeredBy, deploymentId);
    db.prepare(
      `INSERT INTO pr_reviews (
        repo_id, pr_number, deployment_id, started_head_sha, review_base_sha,
        reviewed_to_sha, head_repo_full_name, head_ref, status, triggered_by, started_at
      ) VALUES (?, ?, ?, 'head-b', 'base-a', 'head-b', 'mean-weasel/issuectl',
        'feature/webhooks', 'in_progress', ?, 1000)`,
    ).run(repoId, prNumber, deploymentId, triggeredBy);
    return deploymentId;
  }

  function seedIntent(eventType: string, action: string, prNumber: number): void {
    const event = recordWebhookEvent(db, {
      deliveryId: `delivery-${prNumber}-${action}`,
      repoId,
      eventType,
      action,
      targetType: "pr",
      targetNumber: prNumber,
      receivedAt: 2_000,
    });
    mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: prNumber,
      signalAt: 2_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-b",
      eventId: event.deduped ? null : event.eventId,
    });
  }
});
