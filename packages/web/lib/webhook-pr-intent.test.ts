/* eslint-disable max-lines */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const coreMocks = vi.hoisted(() => ({
  removeLabel: vi.fn(),
  clearCacheKey: vi.fn(),
  withAuthRetry: vi.fn((fn: (octokit: unknown) => Promise<unknown>) => fn({})),
}));

vi.mock("@issuectl/core", async () => {
  const real = await vi.importActual<typeof import("@issuectl/core")>("@issuectl/core");
  return {
    ...real,
    removeLabel: coreMocks.removeLabel,
    clearCacheKey: coreMocks.clearCacheKey,
    withAuthRetry: coreMocks.withAuthRetry,
  };
});

const notifyDeploymentTerminalOutcome = vi.hoisted(() => vi.fn());
vi.mock("./push/notifications", () => ({
  notifyDeploymentTerminalOutcome: (...args: unknown[]) => notifyDeploymentTerminalOutcome(...args),
}));

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
  headProtected: false,
};

describe("PR webhook intents", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    notifyDeploymentTerminalOutcome.mockReset();
    coreMocks.removeLabel.mockReset();
    coreMocks.clearCacheKey.mockReset();
    coreMocks.withAuthRetry.mockImplementation((fn: (octokit: unknown) => Promise<unknown>) => fn({}));
    db = createTestDb();
    repoId = addRepo(db, { owner: "mean-weasel", name: "issuectl" }).id;
    updateRepoWebhookSettings(db, repoId, { autoReviewPrs: true });
  });

  afterEach(() => {
    db.close();
  });

  it("launches opted-in PR intents through the PR review flow", async () => {
    const broadcastEventsChanged = vi.fn();
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 44,
      signalAt: 1_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-b",
    });

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => safePull,
      launchPr: async (_db, _repo, intent, pull, review) => {
        expect(intent.targetNumber).toBe(44);
        expect(pull.headSha).toBe("head-b");
        expect(review.status).toBe("launching");
        const deploymentId = recordDeployment(_db, {
          repoId,
          targetType: "pr",
          targetNumber: 44,
          branchName: "pr-44-review",
          workspaceMode: "worktree",
          workspacePath: "/tmp/pr-44",
        }).id;
        return { deploymentId };
      },
      broadcastEventsChanged,
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, launched: 1, failed: 0 }));
    expect(broadcastEventsChanged).toHaveBeenCalledTimes(3);
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({ status: "launched", deployment_id: 1 }),
    );
    expect(
      db.prepare("SELECT pr_number, status, deployment_id, reviewed_to_sha FROM pr_reviews").get(),
    ).toEqual({ pr_number: 44, status: "in_progress", deployment_id: 1, reviewed_to_sha: "head-b" });
    expect(coreMocks.removeLabel).toHaveBeenCalledWith({}, "mean-weasel", "issuectl", 44, "issuectl:auto-review");
    expect(coreMocks.clearCacheKey).toHaveBeenCalledWith(db, "pull-detail:mean-weasel/issuectl#44");
    expect(coreMocks.clearCacheKey).toHaveBeenCalledWith(db, "pulls-open:mean-weasel/issuectl");
    expect(coreMocks.clearCacheKey).toHaveBeenCalledWith(db, "pulls-with-checks:mean-weasel/issuectl");
    expect(db.prepare("SELECT value FROM settings WHERE key = ?").get("webhook:consumed-auto-review:1:44")).toEqual({ value: "1" });
    const prTarget = { owner: "mean-weasel", repo: "issuectl", targetType: "pr" as const, targetNumber: 44 };
    expect(queryDiagnosticEvents(db, {
      target: prTarget,
      events: ["webhook.lock_check"],
    })).toEqual([
      expect.objectContaining({ issueNumber: null, targetType: "pr", targetNumber: 44, message: "PR has no active review blocking launch." }),
    ]);
    expect(queryDiagnosticEvents(db, {
      target: prTarget,
      events: ["webhook.launched"],
    })).toEqual([
      expect.objectContaining({ issueNumber: null, targetType: "pr", targetNumber: 44, deploymentId: 1 }),
    ]);
    expect(queryDiagnosticEvents(db, { events: ["webhook.pr_launched"] })).toHaveLength(1);
    expect(queryDiagnosticEvents(db, { events: ["webhook.auto_review_label_consumed"] })).toHaveLength(1);
  });

  it("treats the follow-up auto-review unlabeled event as consumed without ending the launched PR session", async () => {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('max_concurrent_webhook_agents', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run();
    const deploymentId = recordDeployment(db, {
      repoId,
      targetType: "pr",
      targetNumber: 44,
      branchName: "pr-44-review",
      workspaceMode: "worktree",
      workspacePath: "/tmp/pr-44",
    }).id;
    db.prepare("UPDATE deployments SET triggered_by = 'webhook' WHERE id = ?").run(deploymentId);
    db.prepare(
      `INSERT INTO pr_reviews (
        repo_id, pr_number, deployment_id, started_head_sha, review_base_sha,
        reviewed_to_sha, head_repo_full_name, head_ref, status, triggered_by, started_at
      ) VALUES (?, 44, ?, 'head-b', 'base-a', 'head-b', 'mean-weasel/issuectl',
        'feature/webhooks', 'in_progress', 'webhook', 1000)`,
    ).run(repoId, deploymentId);
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('webhook:consumed-auto-review:1:44', '1')",
    ).run();
    const event = recordWebhookEvent(db, {
      deliveryId: "delivery-pr-consumed-unlabel",
      repoId,
      eventType: "pull_request",
      action: "unlabeled",
      targetType: "pr",
      targetNumber: 44,
      receivedAt: 2_000,
    });
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 44,
      signalAt: 2_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-b",
      eventId: event.deduped ? null : event.eventId,
    });

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => ({ ...safePull, labels: [] }),
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, skippedOptout: 1, endedSessions: 0 }));
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({ status: "skipped_optout", deployment_id: null }),
    );
    expect(db.prepare("SELECT ended_at FROM deployments WHERE id = ?").get(deploymentId)).toEqual({ ended_at: null });
    expect(db.prepare("SELECT value FROM settings WHERE key = ?").get("webhook:consumed-auto-review:1:44")).toBeUndefined();
    expect(queryDiagnosticEvents(db, { events: ["webhook.auto_review_label_consumed"] })).toHaveLength(1);
  });

  it("skips unsafe PR intents without reserving or launching", async () => {
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 45,
      signalAt: 1_000,
      scheduledAt: 2_000,
      desiredHeadSha: "fork-head",
    });

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => ({
        ...safePull,
        title: "Forked PR",
        body: null,
        headRef: "fork-feature",
        headSha: "fork-head",
        headRepoFullName: "contributor/issuectl",
      }),
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, skippedOptout: 1, launched: 0 }));
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({ status: "skipped_optout", deployment_id: null }),
    );
    expect(db.prepare("SELECT COUNT(*) AS count FROM pr_reviews").get()).toEqual({ count: 0 });
    expect(queryDiagnosticEvents(db, { events: ["webhook.skipped_unsafe_pr"] })).toHaveLength(1);
  });

  it("skips duplicate same-head PR review records instead of surfacing sqlite constraints", async () => {
    db.prepare(
      `INSERT INTO pr_reviews (
        repo_id, pr_number, deployment_id, started_head_sha, review_base_sha,
        reviewed_to_sha, head_repo_full_name, head_ref, status, triggered_by, started_at,
        completed_at, result_json
      ) VALUES (?, 44, NULL, 'head-b', 'base-a', 'head-b', 'mean-weasel/issuectl',
        'feature/webhooks', 'superseded', 'webhook', 1000, 1500, '{"reason":"manual_retry_cleanup"}')`,
    ).run(repoId);
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 44,
      signalAt: 2_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-b",
    });
    const launchPr = vi.fn();

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => safePull,
      launchPr,
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, skippedLocked: 1, failed: 0 }));
    expect(launchPr).not.toHaveBeenCalled();
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({ status: "skipped_locked", deployment_id: null }),
    );
    expect(queryDiagnosticEvents(db, { events: ["webhook.pr_already_reviewed"] })).toHaveLength(1);
  });

  it("skips protected-branch webhook PR intents before reserving or launching", async () => {
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 49,
      signalAt: 1_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-b",
    });
    const launchPr = vi.fn();

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => ({ ...safePull, headRef: "release", headProtected: true }),
      launchPr,
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, skippedOptout: 1, launched: 0 }));
    expect(launchPr).not.toHaveBeenCalled();
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({ status: "skipped_optout", deployment_id: null }),
    );
    expect(db.prepare("SELECT COUNT(*) AS count FROM pr_reviews").get()).toEqual({ count: 0 });
    expect(queryDiagnosticEvents(db, { events: ["webhook.skipped_unsafe_pr"] })).toHaveLength(1);
  });

  it("ends active webhook PR review sessions on PR close", async () => {
    const deploymentId = recordDeployment(db, {
      repoId,
      targetType: "pr",
      targetNumber: 44,
      branchName: "pr-44-review",
      workspaceMode: "worktree",
      workspacePath: "/tmp/pr-44",
    }).id;
    db.prepare("UPDATE deployments SET triggered_by = 'webhook' WHERE id = ?").run(deploymentId);
    db.prepare(
      `INSERT INTO pr_reviews (
        repo_id, pr_number, deployment_id, started_head_sha, review_base_sha,
        reviewed_to_sha, head_repo_full_name, head_ref, status, triggered_by, started_at
      ) VALUES (?, 44, ?, 'head-b', 'base-a', 'head-b', 'mean-weasel/issuectl',
        'feature/webhooks', 'in_progress', 'webhook', 1000)`,
    ).run(repoId, deploymentId);
    const event = recordWebhookEvent(db, {
      deliveryId: "delivery-pr-close",
      repoId,
      eventType: "pull_request",
      action: "closed",
      targetType: "pr",
      targetNumber: 44,
      receivedAt: 2_000,
    });
    mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 44,
      signalAt: 2_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-b",
      eventId: event.deduped ? null : event.eventId,
    });

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => ({ ...safePull, state: "closed" }),
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, skippedOptout: 1, endedSessions: 1 }));
    expect(db.prepare("SELECT ended_at FROM deployments WHERE id = ?").get(deploymentId)).toEqual({ ended_at: expect.any(String) });
    expect(db.prepare("SELECT status FROM pr_reviews WHERE pr_number = 44").get()).toEqual({ status: "superseded" });
    expect(queryDiagnosticEvents(db, { events: ["webhook.pr_session_ended"] })).toHaveLength(1);
  });

  it("does not end comment-command PR sessions on webhook opt-out", async () => {
    const deploymentId = recordDeployment(db, {
      repoId,
      targetType: "pr",
      targetNumber: 48,
      branchName: "pr-48-review",
      workspaceMode: "worktree",
      workspacePath: "/tmp/pr-48",
    }).id;
    db.prepare("UPDATE deployments SET triggered_by = 'comment_command' WHERE id = ?").run(deploymentId);
    db.prepare(
      `INSERT INTO pr_reviews (
        repo_id, pr_number, deployment_id, started_head_sha, review_base_sha,
        reviewed_to_sha, head_repo_full_name, head_ref, status, triggered_by, started_at
      ) VALUES (?, 48, ?, 'head-b', 'base-a', 'head-b', 'mean-weasel/issuectl',
        'feature/webhooks', 'in_progress', 'comment_command', 1000)`,
    ).run(repoId, deploymentId);
    const event = recordWebhookEvent(db, {
      deliveryId: "delivery-pr-unlabel",
      repoId,
      eventType: "pull_request",
      action: "unlabeled",
      targetType: "pr",
      targetNumber: 48,
      receivedAt: 2_000,
    });
    mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 48,
      signalAt: 2_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-b",
      eventId: event.deduped ? null : event.eventId,
    });

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => ({ ...safePull, labels: [] }),
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, skippedOptout: 1, endedSessions: 0 }));
    expect(db.prepare("SELECT ended_at FROM deployments WHERE id = ?").get(deploymentId)).toEqual({ ended_at: null });
  });

  it("launches comment-command PR review intents without auto-review gating", async () => {
    updateRepoWebhookSettings(db, repoId, { autoReviewPrs: false });
    const event = recordWebhookEvent(db, {
      deliveryId: "delivery-review-command",
      repoId,
      eventType: "issue_comment",
      action: "created",
      senderLogin: "octocat",
      targetType: "pr",
      targetNumber: 47,
      receivedAt: 1_000,
    });
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 47,
      signalAt: 1_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-b",
      eventId: event.deduped ? null : event.eventId,
    });

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => ({ ...safePull, labels: [] }),
      launchPr: async (_db) => {
        const deploymentId = recordDeployment(_db, {
          repoId,
          targetType: "pr",
          targetNumber: 47,
          branchName: "pr-47-review",
          workspaceMode: "worktree",
          workspacePath: "/tmp/pr-47",
        }).id;
        _db.prepare(
          "UPDATE deployments SET triggered_by = 'comment_command' WHERE id = ?",
        ).run(deploymentId);
        return { deploymentId };
      },
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, launched: 1, failed: 0 }));
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({ status: "launched", deployment_id: 1 }),
    );
    expect(
      db.prepare("SELECT triggered_by FROM pr_reviews WHERE pr_number = 47").get(),
    ).toEqual({ triggered_by: "comment_command" });
  });

  it("does not apply protected-branch auto-review gating to comment-command PR intents", async () => {
    updateRepoWebhookSettings(db, repoId, { autoReviewPrs: false });
    const event = recordWebhookEvent(db, {
      deliveryId: "delivery-review-protected-command",
      repoId,
      eventType: "issue_comment",
      action: "created",
      senderLogin: "octocat",
      targetType: "pr",
      targetNumber: 50,
      receivedAt: 1_000,
    });
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 50,
      signalAt: 1_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-b",
      eventId: event.deduped ? null : event.eventId,
    });

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => ({ ...safePull, headRef: "release", headProtected: true, labels: [] }),
      launchPr: async (_db) => {
        const deploymentId = recordDeployment(_db, {
          repoId,
          targetType: "pr",
          targetNumber: 50,
          branchName: "pr-50-review",
          workspaceMode: "worktree",
          workspacePath: "/tmp/pr-50",
        }).id;
        _db.prepare(
          "UPDATE deployments SET triggered_by = 'comment_command' WHERE id = ?",
        ).run(deploymentId);
        return { deploymentId };
      },
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, launched: 1, failed: 0 }));
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({ status: "launched", deployment_id: 1 }),
    );
  });

  it("marks the PR review failed when launch fails after reservation", async () => {
    const intentId = mergeWebhookIntent(db, {
      repoId,
      targetType: "pr",
      targetNumber: 46,
      signalAt: 1_000,
      scheduledAt: 2_000,
      desiredHeadSha: "head-b",
    });

    const result = await runWebhookIntentWorkerOnce(db, 2_000, {
      fetchPullState: async () => safePull,
      launchPr: async () => {
        throw new Error("terminal failed");
      },
    });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, failed: 1, launched: 0 }));
    expect(getIntentRow(db, intentId)).toEqual(
      expect.objectContaining({ status: "failed", deployment_id: null }),
    );
    expect(
      db.prepare("SELECT pr_number, status, deployment_id FROM pr_reviews").get(),
    ).toEqual({ pr_number: 46, status: "failed", deployment_id: null });
    expect(queryDiagnosticEvents(db, { events: ["webhook.launch_failed"] })).toHaveLength(1);
  });

});
