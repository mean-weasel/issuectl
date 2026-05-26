import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  initSchema,
  queryDiagnosticEvents,
  recordDeployment,
  seedDefaults,
} from "@issuectl/core";

const notifyDeploymentTerminalOutcome = vi.hoisted(() => vi.fn());

vi.mock("@/lib/push/notifications", () => ({
  notifyDeploymentTerminalOutcome: (...args: unknown[]) =>
    notifyDeploymentTerminalOutcome(...args),
}));

import { recordAgentCompletionCheckIn } from "./completion";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  ensureColumn(db, "terminal_reason", "TEXT");
  ensureColumn(db, "target_type", "TEXT DEFAULT 'issue'");
  ensureColumn(db, "target_number", "INTEGER");
  ensureColumn(db, "completion_token", "TEXT");
  ensureColumn(db, "completion_result_json", "TEXT");
  ensureColumn(db, "idle_since", "TEXT");
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

function ensureColumn(db: Database.Database, name: string, definition: string): void {
  const columns = db.prepare("PRAGMA table_info(deployments)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === name)) {
    db.prepare(`ALTER TABLE deployments ADD COLUMN ${name} ${definition}`).run();
  }
}

describe("web agent completion check-ins", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    notifyDeploymentTerminalOutcome.mockReset();
    db = createTestDb();
    repoId = addRepo(db, { owner: "mean-weasel", name: "issuectl" }).id;
  });

  it("notifies only the first accepted terminal completion", () => {
    const deployment = recordDeployment(db, {
      repoId,
      issueNumber: 506,
      branchName: "issue-506",
      workspaceMode: "worktree",
      workspacePath: "/tmp/issue-506",
    });
    db.prepare(
      "UPDATE deployments SET completion_token = 'token-506', triggered_by = 'webhook' WHERE id = ?",
    ).run(deployment.id);

    expect(recordAgentCompletionCheckIn(db, {
      deploymentId: deployment.id,
      completionToken: "token-506",
      status: "pushed_fixes",
      summary: "pushed one fix",
      finalHeadSha: "head-b",
      pushedCommitSha: "fix-b",
    })).toEqual({ accepted: true, duplicate: false });
    expect(recordAgentCompletionCheckIn(db, {
      deploymentId: deployment.id,
      completionToken: "token-506",
      status: "pushed_fixes",
      summary: "pushed one fix",
      finalHeadSha: "head-b",
      pushedCommitSha: "fix-b",
    })).toEqual({ accepted: true, duplicate: true });

    expect(notifyDeploymentTerminalOutcome).toHaveBeenCalledTimes(1);
    expect(notifyDeploymentTerminalOutcome).toHaveBeenCalledWith({ deploymentId: deployment.id });
    expect(queryDiagnosticEvents(db, { events: ["webhook.completed"] })).toHaveLength(1);
    expect(
      db.prepare("SELECT completion_result_json FROM deployments WHERE id = ?").get(deployment.id),
    ).toEqual({
      completion_result_json: JSON.stringify({
        status: "pushed_fixes",
        summary: "pushed one fix",
        finalHeadSha: "head-b",
        pushedCommitSha: "fix-b",
      }),
    });
  });

  it("persists richer completion metadata in the existing result json column", () => {
    const deployment = recordDeployment(db, {
      repoId,
      issueNumber: 506,
      branchName: "issue-506",
      workspaceMode: "worktree",
      workspacePath: "/tmp/issue-506",
    });
    db.prepare(
      "UPDATE deployments SET completion_token = 'token-506', triggered_by = 'webhook' WHERE id = ?",
    ).run(deployment.id);

    expect(recordAgentCompletionCheckIn(db, {
      deploymentId: deployment.id,
      completionToken: "token-506",
      status: "failed",
      summary: "partial run failed",
      pushedCommits: ["fix-a", "fix-b"],
      changedFileCount: 4,
      fixedFindingCount: 2,
      errorMessage: "tests failed",
    })).toEqual({ accepted: true, duplicate: false });

    expect(
      db.prepare("SELECT terminal_reason, completion_result_json FROM deployments WHERE id = ?").get(deployment.id),
    ).toEqual({
      terminal_reason: "failed",
      completion_result_json: JSON.stringify({
        status: "failed",
        summary: "partial run failed",
        pushedCommits: ["fix-a", "fix-b"],
        changedFileCount: 4,
        fixedFindingCount: 2,
        errorMessage: "tests failed",
        error: "tests failed",
      }),
    });
  });

  it("completes linked PR reviews and schedules one coalesced follow-up", () => {
    const deployment = recordDeployment(db, {
      repoId,
      issueNumber: 44,
      branchName: "pr-44",
      workspaceMode: "worktree",
      workspacePath: "/tmp/pr-44",
    });
    db.prepare(
      `UPDATE deployments
       SET completion_token = 'token-44',
           triggered_by = 'webhook',
           target_type = 'pr',
           target_number = 44
       WHERE id = ?`,
    ).run(deployment.id);
    db.prepare(
      `INSERT INTO pr_reviews (
        repo_id, pr_number, deployment_id, started_head_sha, review_base_sha,
        reviewed_from_sha, reviewed_to_sha, head_repo_full_name, head_ref,
        status, triggered_by, started_at, result_json
      ) VALUES (?, 44, ?, 'head-b', 'base-a', 'head-a', 'head-b',
        'mean-weasel/issuectl', 'feature/webhooks', 'in_progress', 'webhook', 1000, ?)`,
    ).run(repoId, deployment.id, JSON.stringify({
      desiredHeadSha: "head-c",
      desiredBaseSha: "base-a",
      desiredHeadRef: "feature/webhooks",
      followUpGeneration: 1,
    }));

    expect(recordAgentCompletionCheckIn(db, {
      deploymentId: deployment.id,
      completionToken: "token-44",
      status: "no_changes",
      summary: "reviewed head-b",
      finalHeadSha: "head-b",
    })).toEqual({ accepted: true, duplicate: false });

    expect(db.prepare(
      "SELECT status, completed_head_sha, result_json FROM pr_reviews WHERE deployment_id = ?",
    ).get(deployment.id)).toEqual(expect.objectContaining({
      status: "completed",
      completed_head_sha: "head-b",
      result_json: JSON.stringify({
        desiredHeadSha: "head-c",
        desiredBaseSha: "base-a",
        desiredHeadRef: "feature/webhooks",
        followUpGeneration: 1,
        status: "no_changes",
        summary: "reviewed head-b",
        finalHeadSha: "head-b",
      }),
    }));
    expect(db.prepare(
      "SELECT target_type, target_number, desired_head_sha, status FROM webhook_intents",
    ).get()).toEqual({
      target_type: "pr",
      target_number: 44,
      desired_head_sha: "head-c",
      status: "pending",
    });
    expect(queryDiagnosticEvents(db, {
      target: { owner: "mean-weasel", repo: "issuectl", targetType: "pr", targetNumber: 44 },
      events: ["webhook.completed"],
    })).toEqual([
      expect.objectContaining({
        issueNumber: null,
        targetType: "pr",
        targetNumber: 44,
        deploymentId: deployment.id,
        status: "no_changes",
      }),
    ]);
  });
});
