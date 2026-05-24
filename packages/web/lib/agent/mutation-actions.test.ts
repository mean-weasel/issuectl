import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  initSchema,
  recordDeployment,
  seedDefaults,
} from "@issuectl/core";
import {
  executeAgentMutationRequest,
  type AgentMutationAction,
  type AgentMutationAdapters,
} from "./mutations.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  ensureColumn(db, "deployments", "target_type", "TEXT DEFAULT 'issue'");
  ensureColumn(db, "deployments", "target_number", "INTEGER");
  ensureColumn(db, "deployments", "triggered_by", "TEXT DEFAULT 'manual'");
  ensureColumn(db, "deployments", "completion_token", "TEXT");
  ensureColumn(db, "deployments", "webhook_depth", "INTEGER NOT NULL DEFAULT 0");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_action_budgets (
      deployment_id INTEGER NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      limit_count INTEGER NOT NULL DEFAULT 0,
      used_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (deployment_id, action_type)
    );
  `);
  seedDefaults(db);
  return db;
}

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function setBudget(
  db: Database.Database,
  deploymentId: number,
  actionType: AgentMutationAction,
  limit: number,
): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO agent_action_budgets (
      deployment_id, action_type, limit_count, used_count, created_at, updated_at
    ) VALUES (?, ?, ?, 0, ?, ?)`,
  ).run(deploymentId, actionType, limit, now, now);
}

describe("agent mutation non-push adapters", () => {
  let db: Database.Database;
  let repoId: number;
  let deploymentId: number;

  beforeEach(() => {
    db = createTestDb();
    repoId = addRepo(db, { owner: "acme", name: "api" }).id;
    deploymentId = recordDeployment(db, {
      repoId,
      issueNumber: 44,
      branchName: "issue-44",
      workspaceMode: "worktree",
      workspacePath: "/tmp/issuectl-44",
    }).id;
    db.prepare(
      `UPDATE deployments
       SET target_type = 'issue',
           target_number = 44,
           triggered_by = 'comment_command',
           completion_token = 'token-44'
       WHERE id = ?`,
    ).run(deploymentId);
  });

  afterEach(() => {
    db.close();
  });

  it("executes label, create_issue, and create_pr only through budgeted adapters", async () => {
    const label = vi.fn().mockResolvedValue(undefined);
    const createIssue = vi.fn().mockResolvedValue(undefined);
    const createPr = vi.fn().mockResolvedValue(undefined);
    const adapters: AgentMutationAdapters = { label, createIssue, createPr };
    setBudget(db, deploymentId, "label", 1);
    setBudget(db, deploymentId, "create_issue", 1);
    setBudget(db, deploymentId, "create_pr", 1);

    await expect(executeAgentMutationRequest(db, baseRequest("label", {
      label: "issuectl:reviewed",
      operation: "remove",
    }), adapters)).resolves.toEqual({ allowed: true });
    await expect(executeAgentMutationRequest(db, baseRequest("create_issue", {
      title: "Follow-up",
      body: "Details",
    }), adapters)).resolves.toEqual({ allowed: true });
    await expect(executeAgentMutationRequest(db, baseRequest("create_pr", {
      title: "Follow-up PR",
      head: "issue-44-follow-up",
      base: "main",
      body: "Details",
    }), adapters)).resolves.toEqual({ allowed: true });

    expect(label).toHaveBeenCalledWith({
      owner: "acme",
      repo: "api",
      targetNumber: 44,
      label: "issuectl:reviewed",
      operation: "remove",
    });
    expect(createIssue).toHaveBeenCalledWith({
      owner: "acme",
      repo: "api",
      title: "Follow-up",
      body: "Details",
    });
    expect(createPr).toHaveBeenCalledWith({
      owner: "acme",
      repo: "api",
      title: "Follow-up PR",
      head: "issue-44-follow-up",
      base: "main",
      body: "Details",
    });
  });

  it("denies create_pr fork heads before consuming budget", async () => {
    const createPr = vi.fn().mockResolvedValue(undefined);
    setBudget(db, deploymentId, "create_pr", 1);

    await expect(executeAgentMutationRequest(db, baseRequest("create_pr", {
      title: "Fork PR",
      head: "contributor:branch",
      base: "main",
    }), { createPr })).resolves.toEqual({ allowed: false, reason: "unsafe_fork_pr" });

    expect(createPr).not.toHaveBeenCalled();
  });

  function baseRequest(actionType: AgentMutationAction, payload: unknown) {
    return {
      deploymentId,
      completionToken: "token-44",
      repoId,
      targetType: "issue" as const,
      targetNumber: 44,
      actionType,
      payload,
    };
  }
});
