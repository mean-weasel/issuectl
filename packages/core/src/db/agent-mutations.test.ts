import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createRawTestDb, createTestDb } from "./test-helpers.js";
import { seedRepo } from "./deployments-test-helpers.js";
import { recordDeployment } from "./deployments.js";
import { queryDiagnosticEvents } from "./diagnostics.js";
import { initSchema, getSchemaVersion } from "./schema.js";
import { runMigrations } from "./migrations.js";
import {
  evaluateAgentMutationRequest,
  getAgentActionBudget,
  claimAgentActionBudget,
  setAgentActionBudget,
} from "./agent-mutations.js";

describe("agent mutation gateway foundation", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("denies a valid webhook deployment by default and records a persistent budget row", () => {
    const repo = seedRepo(db);
    const deployment = recordDeployment(db, {
      repoId: repo.id,
      targetType: "pr",
      targetNumber: 42,
      branchName: "pr-42-review",
      workspaceMode: "worktree",
      workspacePath: "/tmp/pr-42",
      triggeredBy: "webhook",
      completionToken: "token-42",
    });

    const decision = evaluateAgentMutationRequest(db, {
      deploymentId: deployment.id,
      completionToken: "token-42",
      repoId: repo.id,
      targetType: "pr",
      targetNumber: 42,
      actionType: "push",
    });

    expect(decision).toEqual({ allowed: false, reason: "action_unimplemented" });
    expect(getAgentActionBudget(db, deployment.id, "push")).toEqual({
      deploymentId: deployment.id,
      actionType: "push",
      limitCount: 0,
      usedCount: 0,
    });
    expect(queryDiagnosticEvents(db, { events: ["agent.mutation_denied"] })[0]).toMatchObject({
      event: "agent.mutation_denied",
      deploymentId: deployment.id,
      data: expect.objectContaining({
        actionType: "push",
        reason: "action_unimplemented",
        targetType: "pr",
        targetNumber: 42,
      }),
    });
  });

  it("denies invalid token and target mismatch before action evaluation", () => {
    const repo = seedRepo(db);
    const deployment = recordDeployment(db, {
      repoId: repo.id,
      targetType: "pr",
      targetNumber: 42,
      branchName: "pr-42-review",
      workspaceMode: "worktree",
      workspacePath: "/tmp/pr-42",
      triggeredBy: "comment_command",
      completionToken: "token-42",
    });

    expect(evaluateAgentMutationRequest(db, {
      deploymentId: deployment.id,
      completionToken: "wrong",
      repoId: repo.id,
      targetType: "pr",
      targetNumber: 42,
      actionType: "comment",
    })).toEqual({ allowed: false, reason: "invalid_token" });

    expect(evaluateAgentMutationRequest(db, {
      deploymentId: deployment.id,
      completionToken: "token-42",
      repoId: repo.id,
      targetType: "issue",
      targetNumber: 42,
      actionType: "comment",
    })).toEqual({ allowed: false, reason: "target_mismatch" });
  });

  it("denies manual sessions because they are outside the non-manual gateway model", () => {
    const repo = seedRepo(db);
    const deployment = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 42,
      branchName: "issue-42",
      workspaceMode: "worktree",
      workspacePath: "/tmp/issue-42",
      completionToken: "token-42",
    });

    expect(evaluateAgentMutationRequest(db, {
      deploymentId: deployment.id,
      completionToken: "token-42",
      repoId: repo.id,
      targetType: "issue",
      targetNumber: 42,
      actionType: "label",
    })).toEqual({ allowed: false, reason: "manual_session" });
  });

  it("persists and consumes action budgets without allowing overuse", () => {
    const repo = seedRepo(db);
    const deployment = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 44,
      branchName: "issue-44",
      workspaceMode: "worktree",
      workspacePath: "/tmp/issue-44",
      triggeredBy: "webhook",
      completionToken: "token-44",
    });

    setAgentActionBudget(db, deployment.id, "comment", 1);

    expect(claimAgentActionBudget(db, deployment.id, "comment")).toBe(true);
    expect(claimAgentActionBudget(db, deployment.id, "comment")).toBe(false);
    expect(getAgentActionBudget(db, deployment.id, "comment")).toEqual({
      deploymentId: deployment.id,
      actionType: "comment",
      limitCount: 1,
      usedCount: 1,
    });
  });
});

describe("agent mutation gateway schema", () => {
  it("creates persistent action budget table on fresh schema", () => {
    const db = createTestDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_action_budgets'",
    ).all();

    expect(tables).toHaveLength(1);
  });

  it("migrates old schemas to agent action budget version", () => {
    const db = createRawTestDb();
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (20);
    `);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(23);
    expect(db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_action_budgets'",
    ).all()).toHaveLength(1);
  });

  it("sets fresh schema version to 23", () => {
    const db = createRawTestDb();
    initSchema(db);
    expect(getSchemaVersion(db)).toBe(23);
  });
});
