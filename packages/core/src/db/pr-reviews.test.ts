import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createRawTestDb, createTestDb } from "./test-helpers.js";
import { addRepo } from "./repos.js";
import { getSchemaVersion } from "./schema.js";
import { runMigrations } from "./migrations.js";
import {
  coalescePrReviewDesiredHead,
  completePrReview,
  getActivePrReview,
  getLatestCompletedPrReview,
  getPrReviewById,
  reservePrReview,
  supersedePrReview,
} from "./pr-reviews.js";

describe("pr_reviews", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    repoId = addRepo(db, { owner: "mean-weasel", name: "issuectl" }).id;
  });

  it("reserves a PR review with reviewed range and head identity", () => {
    const review = reservePrReview(db, {
      repoId,
      prNumber: 506,
      startedHeadSha: "head-b",
      reviewBaseSha: "base-a",
      reviewedFromSha: "base-a",
      reviewedToSha: "head-b",
      headRepoFullName: "mean-weasel/issuectl",
      headRef: "feature/webhooks",
      triggeredBy: "webhook",
      startedAt: 1_000,
    });

    expect(review).toMatchObject({
      repoId,
      prNumber: 506,
      status: "reserved",
      deploymentId: null,
      startedHeadSha: "head-b",
      completedHeadSha: null,
      reviewBaseSha: "base-a",
      reviewedFromSha: "base-a",
      reviewedToSha: "head-b",
      headRepoFullName: "mean-weasel/issuectl",
      headRef: "feature/webhooks",
      triggeredBy: "webhook",
      resultJson: null,
      startedAt: 1_000,
      completedAt: null,
    });
    expect(getPrReviewById(db, review.id)).toEqual(review);
    expect(getActivePrReview(db, repoId, 506)?.id).toBe(review.id);
  });

  it("enforces one review per repo, PR, and reviewed_to_sha", () => {
    const input = {
      repoId,
      prNumber: 506,
      startedHeadSha: "head-b",
      reviewBaseSha: "base-a",
      reviewedToSha: "head-b",
      headRepoFullName: "mean-weasel/issuectl",
      headRef: "feature/webhooks",
      triggeredBy: "webhook" as const,
      startedAt: 1_000,
    };
    reservePrReview(db, input);

    expect(() => reservePrReview(db, input)).toThrow(/UNIQUE constraint failed/);
  });

  it("completes a review and exposes it as the latest completed range", () => {
    const review = reservePrReview(db, {
      repoId,
      prNumber: 506,
      startedHeadSha: "head-b",
      reviewBaseSha: "base-a",
      reviewedFromSha: "base-a",
      reviewedToSha: "head-b",
      headRepoFullName: "mean-weasel/issuectl",
      headRef: "feature/webhooks",
      triggeredBy: "webhook",
      startedAt: 1_000,
    });

    completePrReview(db, review.id, {
      completedHeadSha: "head-b",
      completedAt: 2_000,
      result: { status: "no_changes" },
    });

    expect(getLatestCompletedPrReview(db, repoId, 506)).toEqual(
      expect.objectContaining({
        id: review.id,
        status: "completed",
        completedHeadSha: "head-b",
        completedAt: 2_000,
        resultJson: JSON.stringify({ status: "no_changes" }),
      }),
    );
  });

  it("stores at most one coalesced desired head for a running review", () => {
    const review = reservePrReview(db, {
      repoId,
      prNumber: 506,
      startedHeadSha: "head-b",
      reviewBaseSha: "base-a",
      reviewedToSha: "head-b",
      headRepoFullName: "mean-weasel/issuectl",
      headRef: "feature/webhooks",
      triggeredBy: "webhook",
      startedAt: 1_000,
    });

    coalescePrReviewDesiredHead(db, review.id, {
      desiredHeadSha: "head-c",
      desiredBaseSha: "base-a",
      desiredHeadRef: "feature/webhooks",
    });
    coalescePrReviewDesiredHead(db, review.id, {
      desiredHeadSha: "head-d",
      desiredBaseSha: "base-a",
      desiredHeadRef: "feature/webhooks",
    });

    expect(JSON.parse(getPrReviewById(db, review.id)?.resultJson ?? "{}")).toEqual({
      desiredHeadSha: "head-c",
      desiredBaseSha: "base-a",
      desiredHeadRef: "feature/webhooks",
      followUpGeneration: 1,
    });
  });

  it("marks completed ranges superseded after a force push", () => {
    const review = reservePrReview(db, {
      repoId,
      prNumber: 506,
      startedHeadSha: "head-b",
      reviewBaseSha: "base-a",
      reviewedToSha: "head-b",
      headRepoFullName: "mean-weasel/issuectl",
      headRef: "feature/webhooks",
      triggeredBy: "webhook",
      startedAt: 1_000,
    });
    completePrReview(db, review.id, {
      completedHeadSha: "head-b",
      completedAt: 2_000,
      result: { status: "completed" },
    });

    supersedePrReview(db, review.id, 3_000, "force_push");

    expect(getPrReviewById(db, review.id)).toEqual(
      expect.objectContaining({
        status: "superseded",
        completedAt: 3_000,
        resultJson: JSON.stringify({ reason: "force_push" }),
      }),
    );
  });
});

describe("pr_reviews migration", () => {
  it("adds the PR review table to a v19 database with existing deployments and intents", () => {
    const db = createRawTestDb();
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (19);
      CREATE TABLE repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        UNIQUE(owner, name)
      );
      CREATE TABLE deployments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        issue_number INTEGER,
        target_type TEXT NOT NULL DEFAULT 'issue' CHECK (target_type IN ('issue', 'pr')),
        target_number INTEGER NOT NULL,
        agent TEXT NOT NULL DEFAULT 'claude' CHECK (agent IN ('claude', 'codex')),
        branch_name TEXT NOT NULL,
        workspace_mode TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        linked_pr_number INTEGER,
        state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('pending', 'active')),
        terminal_backend TEXT NOT NULL DEFAULT 'ttyd' CHECK (terminal_backend IN ('ttyd', 'pty_bridge')),
        triggered_by TEXT NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('manual', 'webhook', 'comment_command')),
        launched_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT,
        terminal_reason TEXT,
        completion_token TEXT,
        completion_result_json TEXT,
        notification_sent_at TEXT,
        ttyd_port INTEGER,
        ttyd_pid INTEGER,
        idle_since TEXT
      );
      CREATE TABLE webhook_intents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK (target_type IN ('issue', 'pr')),
        target_number INTEGER NOT NULL,
        first_signal_at INTEGER NOT NULL,
        last_signal_at INTEGER NOT NULL,
        scheduled_at INTEGER NOT NULL,
        generation INTEGER NOT NULL DEFAULT 1,
        signal_count INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        deployment_id INTEGER REFERENCES deployments(id)
      );
      INSERT INTO repos (owner, name) VALUES ('o', 'n');
      INSERT INTO deployments (repo_id, issue_number, target_type, target_number, branch_name, workspace_mode, workspace_path)
        VALUES (1, NULL, 'pr', 44, 'pr-44', 'existing', '/x');
      INSERT INTO webhook_intents (repo_id, target_type, target_number, first_signal_at, last_signal_at, scheduled_at, status, deployment_id)
        VALUES (1, 'pr', 44, 1, 1, 1, 'launched', 1);
    `);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(23);
    expect(() =>
      db.prepare(
        `INSERT INTO pr_reviews (
          repo_id, pr_number, deployment_id, started_head_sha, review_base_sha,
          reviewed_to_sha, head_repo_full_name, head_ref, triggered_by, started_at
        ) VALUES (1, 44, 1, 'head', 'base', 'head', 'o/n', 'feature', 'webhook', 1)`,
      ).run(),
    ).not.toThrow();
  });
});
