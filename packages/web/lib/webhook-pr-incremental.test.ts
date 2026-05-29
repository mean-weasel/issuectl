import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  initSchema,
  mergeWebhookIntent,
  queryDiagnosticEvents,
  recordDeployment,
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

function getIntentRow(db: Database.Database, id: number) {
  return db.prepare("SELECT status, deployment_id FROM webhook_intents WHERE id = ?").get(id);
}

function prReviewRows(db: Database.Database) {
  return db.prepare(
    `SELECT pr_number, status, deployment_id, reviewed_from_sha, reviewed_to_sha, result_json
     FROM pr_reviews ORDER BY id`,
  ).all();
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

describe("incremental PR webhook intents", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    repoId = addRepo(db, { owner: "mean-weasel", name: "issuectl" }).id;
    updateRepoWebhookSettings(db, repoId, { autoReviewPrs: true });
  });

  afterEach(() => {
    db.close();
  });

  it("coalesces one desired head while a review is already active", async () => {
    const deploymentId = recordTestDeployment(db, repoId, 47);
    db.prepare(
      `INSERT INTO pr_reviews (
        repo_id, pr_number, deployment_id, started_head_sha, review_base_sha,
        reviewed_to_sha, head_repo_full_name, head_ref, status, triggered_by, started_at
      ) VALUES (?, 47, ?, 'head-b', 'base-a', 'head-b', 'mean-weasel/issuectl',
        'feature/webhooks', 'in_progress', 'webhook', 1000)`,
    ).run(repoId, deploymentId);
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 47,
      signalAt: 2_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-c",
    });

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => ({ ...safePull, headSha: "head-c" }),
      launchPr: async () => {
        throw new Error("coalesced active reviews must not launch");
      },
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, skippedLocked: 1, launched: 0 }));
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({ status: "skipped_locked", deployment_id: null }),
    );
    expect(JSON.parse((prReviewRows(db)[0] as { result_json: string }).result_json)).toEqual({
      desiredHeadSha: "head-c",
      desiredBaseSha: "base-a",
      desiredHeadRef: "feature/webhooks",
      followUpGeneration: 1,
    });
    expect(queryDiagnosticEvents(db, { events: ["webhook.pr_coalesced"] })).toHaveLength(1);
  });

  it("launches an incremental review from the last completed head when it is an ancestor", async () => {
    seedCompletedReview(db, repoId, 48);
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 48,
      signalAt: 2_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-c",
    });

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => ({ ...safePull, headSha: "head-c" }),
      isAncestor: async () => true,
      launchPr: async (_db, _repo, _intent, _pull, review) => {
        expect(review.reviewedFromSha).toBe("head-b");
        return { deploymentId: recordTestDeployment(_db, repoId, 48) };
      },
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, launched: 1, failed: 0 }));
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({ status: "launched", deployment_id: 1 }),
    );
    expect(prReviewRows(db)).toEqual([
      expect.objectContaining({ status: "completed", reviewed_to_sha: "head-b" }),
      expect.objectContaining({
        status: "in_progress",
        deployment_id: 1,
        reviewed_from_sha: "head-b",
        reviewed_to_sha: "head-c",
      }),
    ]);
  }, 10_000);

  it("supersedes the completed range and launches a full review after force push", async () => {
    seedCompletedReview(db, repoId, 49, {
      startedHeadSha: "head-a",
      completedHeadSha: "head-a",
      reviewedToSha: "head-a",
      startedAt: 500,
      completedAt: 750,
    });
    seedCompletedReview(db, repoId, 49);
    mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 49,
      signalAt: 2_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-z",
    });

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => ({ ...safePull, headSha: "head-z" }),
      isAncestor: async () => false,
      launchPr: async (_db, _repo, _intent, _pull, review) => {
        expect(review.reviewedFromSha).toBeNull();
        return { deploymentId: recordTestDeployment(_db, repoId, 49) };
      },
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, launched: 1, failed: 0 }));
    expect(prReviewRows(db)).toEqual([
      expect.objectContaining({ status: "superseded", reviewed_to_sha: "head-a" }),
      expect.objectContaining({ status: "superseded", reviewed_to_sha: "head-b" }),
      expect.objectContaining({
        status: "in_progress",
        deployment_id: 1,
        reviewed_from_sha: null,
        reviewed_to_sha: "head-z",
      }),
    ]);
  });

  it("forces a full PR review when a comment command requests --full", async () => {
    seedCompletedReview(db, repoId, 50);
    mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 50,
      signalAt: 2_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-c",
      reviewMode: "full",
    });

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => ({ ...safePull, headSha: "head-c" }),
      isAncestor: async () => true,
      launchPr: async (_db, _repo, _intent, _pull, review) => {
        expect(review.reviewedFromSha).toBeNull();
        return { deploymentId: recordTestDeployment(_db, repoId, 50) };
      },
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, launched: 1, failed: 0 }));
    expect(prReviewRows(db)).toEqual([
      expect.objectContaining({ status: "completed", reviewed_to_sha: "head-b" }),
      expect.objectContaining({
        status: "in_progress",
        deployment_id: 1,
        reviewed_from_sha: null,
        reviewed_to_sha: "head-c",
      }),
    ]);
  });
});

function seedCompletedReview(
  db: Database.Database,
  repoId: number,
  prNumber: number,
  options: {
    startedHeadSha?: string;
    completedHeadSha?: string;
    reviewedToSha?: string;
    startedAt?: number;
    completedAt?: number;
  } = {},
): void {
  const startedHeadSha = options.startedHeadSha ?? "head-b";
  const completedHeadSha = options.completedHeadSha ?? "head-b";
  const reviewedToSha = options.reviewedToSha ?? "head-b";
  const startedAt = options.startedAt ?? 1_000;
  const completedAt = options.completedAt ?? 1_500;
  db.prepare(
    `INSERT INTO pr_reviews (
      repo_id, pr_number, deployment_id, started_head_sha, completed_head_sha,
      review_base_sha, reviewed_to_sha, head_repo_full_name, head_ref, status,
      triggered_by, started_at, completed_at, result_json
    ) VALUES (?, ?, NULL, ?, ?, 'base-a', ?,
      'mean-weasel/issuectl', 'feature/webhooks', 'completed', 'webhook', ?, ?, '{}')`,
  ).run(repoId, prNumber, startedHeadSha, completedHeadSha, reviewedToSha, startedAt, completedAt);
}

function recordTestDeployment(db: Database.Database, repoId: number, targetNumber: number): number {
  return recordDeployment(db, {
    repoId,
    targetType: "pr",
    targetNumber,
    branchName: `pr-${targetNumber}-review`,
    workspaceMode: "worktree",
    workspacePath: `/tmp/pr-${targetNumber}`,
  }).id;
}
