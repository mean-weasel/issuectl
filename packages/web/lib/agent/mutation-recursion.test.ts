import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  initSchema,
  recordDeployment,
  seedDefaults,
} from "@issuectl/core";
import { executeAgentMutationRequest } from "./mutations.js";

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

function setBudget(db: Database.Database, deploymentId: number): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO agent_action_budgets (
      deployment_id, action_type, limit_count, used_count, created_at, updated_at
    ) VALUES (?, 'create_issue', 1, 0, ?, ?)`,
  ).run(deploymentId, now, now);
}

function setLocalSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

describe("agent mutation recursion controls", () => {
  let db: Database.Database;
  let repoId: number;
  let deploymentId: number;

  beforeEach(() => {
    db = createTestDb();
    repoId = addRepo(db, { owner: "acme", name: "api" }).id;
    deploymentId = recordDeployment(db, {
      repoId,
      issueNumber: 44,
      branchName: "feature/review",
      workspaceMode: "worktree",
      workspacePath: "/tmp/issuectl-pr-44",
    }).id;
    db.prepare(
      `UPDATE deployments
       SET target_type = 'pr',
           target_number = 44,
           triggered_by = 'webhook',
           completion_token = 'token-44'
       WHERE id = ?`,
    ).run(deploymentId);
    setLocalSetting(db, "max_webhook_recursion_depth", "1");
    setBudget(db, deploymentId);
  });

  it("denies agent-created follow-up work at the webhook recursion limit", async () => {
    const createIssue = vi.fn().mockResolvedValue(undefined);
    db.prepare("UPDATE deployments SET webhook_depth = 1 WHERE id = ?").run(deploymentId);

    const result = await requestCreateIssue(db, repoId, deploymentId, createIssue);

    expect(result).toEqual({ allowed: false, reason: "recursion_depth_exceeded" });
    expect(createIssue).not.toHaveBeenCalled();
    expect(budgetRow(db, deploymentId)).toEqual({ limit_count: 1, used_count: 0 });
  });

  it("allows agent-created follow-up work below the webhook recursion limit", async () => {
    const createIssue = vi.fn().mockResolvedValue(undefined);

    const result = await requestCreateIssue(db, repoId, deploymentId, createIssue);

    expect(result).toEqual({ allowed: true });
    expect(createIssue).toHaveBeenCalledWith({
      owner: "acme",
      repo: "api",
      title: "Follow-up",
      body: "Track this separately.",
    });
    expect(budgetRow(db, deploymentId)).toEqual({ limit_count: 1, used_count: 1 });
  });
});

function requestCreateIssue(
  db: Database.Database,
  repoId: number,
  deploymentId: number,
  createIssue: (input: unknown) => Promise<void>,
) {
  return executeAgentMutationRequest(db, {
    deploymentId,
    completionToken: "token-44",
    repoId,
    targetType: "pr",
    targetNumber: 44,
    actionType: "create_issue",
    payload: { title: "Follow-up", body: "Track this separately." },
  }, { createIssue });
}

function budgetRow(db: Database.Database, deploymentId: number) {
  return db.prepare(
    `SELECT limit_count, used_count
     FROM agent_action_budgets
     WHERE deployment_id = ? AND action_type = 'create_issue'`,
  ).get(deploymentId);
}
