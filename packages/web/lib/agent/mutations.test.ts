/* eslint-disable max-lines */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  initSchema,
  queryDiagnosticEvents,
  recordDeployment,
  seedDefaults,
} from "@issuectl/core";
import {
  executeAgentMutationRequest,
  type AgentMutationAdapters,
  type PullForSafety,
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
  actionType: string,
  limit: number,
): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO agent_action_budgets (
      deployment_id, action_type, limit_count, used_count, created_at, updated_at
    ) VALUES (?, ?, ?, 0, ?, ?)
    ON CONFLICT(deployment_id, action_type) DO UPDATE SET
      limit_count = excluded.limit_count,
      used_count = MIN(agent_action_budgets.used_count, excluded.limit_count),
      updated_at = excluded.updated_at`,
  ).run(deploymentId, actionType, limit, now, now);
}

function budgetRow(db: Database.Database, deploymentId: number, actionType: string) {
  return db.prepare(
    `SELECT limit_count, used_count
     FROM agent_action_budgets
     WHERE deployment_id = ? AND action_type = ?`,
  ).get(deploymentId, actionType);
}

function pull(overrides: Partial<PullForSafety> = {}): PullForSafety {
  return {
    number: 44,
    title: "Review me",
    body: null,
    state: "open",
    draft: false,
    merged: false,
    user: null,
    headRef: "feature/review",
    baseRef: "main",
    headSha: "head-a",
    baseSha: "base-a",
    headRepoFullName: "acme/api",
    baseRepoFullName: "acme/api",
    additions: 1,
    deletions: 0,
    changedFiles: 1,
    createdAt: "2026-05-24T00:00:00Z",
    updatedAt: "2026-05-24T00:00:00Z",
    mergedAt: null,
    closedAt: null,
    htmlUrl: "https://github.com/acme/api/pull/44",
    ...overrides,
  };
}

describe("executeAgentMutationRequest", () => {
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
  });

  afterEach(() => {
    db.close();
  });

  it("executes one budgeted comment and fails closed when the budget is exhausted", async () => {
    const comment = vi.fn().mockResolvedValue(undefined);
    const adapters: AgentMutationAdapters = { comment };
    setBudget(db, deploymentId, "comment", 1);

    const request = {
      deploymentId,
      completionToken: "token-44",
      repoId,
      targetType: "pr" as const,
      targetNumber: 44,
      actionType: "comment" as const,
      payload: { body: "Review completed." },
    };

    await expect(executeAgentMutationRequest(db, request, adapters)).resolves.toEqual({
      allowed: true,
    });
    await expect(executeAgentMutationRequest(db, request, adapters)).resolves.toEqual({
      allowed: false,
      reason: "budget_exhausted",
    });

    expect(comment).toHaveBeenCalledTimes(1);
    expect(comment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "api",
      targetNumber: 44,
      body: "Review completed.",
    });
    expect(budgetRow(db, deploymentId, "comment")).toEqual({
      limit_count: 1,
      used_count: 1,
    });
    expect(queryDiagnosticEvents(db, { events: ["agent.mutation_executed"] })).toHaveLength(1);
    expect(queryDiagnosticEvents(db, { events: ["agent.mutation_denied"] }).at(-1)).toMatchObject({
      status: "budget_exhausted",
    });
  });

  it("allows only bounded comment and label mutations for issue webhook sessions", async () => {
    db.prepare(
      `UPDATE deployments
       SET target_type = 'issue',
           target_number = 506,
           issue_number = 506,
           triggered_by = 'webhook',
           completion_token = 'token-506'
       WHERE id = ?`,
    ).run(deploymentId);
    setBudget(db, deploymentId, "comment", 1);
    setBudget(db, deploymentId, "label", 2);
    setBudget(db, deploymentId, "create_issue", 0);
    setBudget(db, deploymentId, "create_pr", 0);
    setBudget(db, deploymentId, "push", 0);
    const comment = vi.fn().mockResolvedValue(undefined);
    const label = vi.fn().mockResolvedValue(undefined);
    const createIssue = vi.fn().mockResolvedValue(undefined);
    const createPr = vi.fn().mockResolvedValue(undefined);
    const push = vi.fn().mockResolvedValue(undefined);

    await expect(executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-506",
      repoId,
      targetType: "issue",
      targetNumber: 506,
      actionType: "comment",
      payload: { body: "Completed local pass." },
    }, { comment })).resolves.toEqual({ allowed: true });
    await expect(executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-506",
      repoId,
      targetType: "issue",
      targetNumber: 506,
      actionType: "label",
      payload: { label: "issuectl:done" },
    }, { label })).resolves.toEqual({ allowed: true });
    await expect(executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-506",
      repoId,
      targetType: "issue",
      targetNumber: 506,
      actionType: "label",
      payload: { label: "needs-review", operation: "remove" },
    }, { label })).resolves.toEqual({ allowed: true });
    await expect(executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-506",
      repoId,
      targetType: "issue",
      targetNumber: 506,
      actionType: "create_issue",
      payload: { title: "Follow-up", body: "Not allowed from issue sessions." },
    }, { createIssue })).resolves.toEqual({ allowed: false, reason: "budget_exhausted" });
    await expect(executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-506",
      repoId,
      targetType: "issue",
      targetNumber: 506,
      actionType: "create_pr",
      payload: { title: "Fix", head: "issue-506", base: "main", body: "Not allowed." },
    }, { createPr })).resolves.toEqual({ allowed: false, reason: "budget_exhausted" });
    await expect(executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-506",
      repoId,
      targetType: "issue",
      targetNumber: 506,
      actionType: "push",
      payload: {
        expectedHeadRef: "issue-506",
        expectedHeadSha: "head-a",
        newSha: "head-b",
      },
    }, {
      fetchPull: async () => pull(),
      isBranchProtected: async () => false,
      verifyWorkspaceHead: async () => ({ ok: true }),
      push,
    })).resolves.toEqual({ allowed: false, reason: "target_mismatch" });

    expect(comment).toHaveBeenCalledTimes(1);
    expect(label).toHaveBeenCalledTimes(2);
    expect(createIssue).not.toHaveBeenCalled();
    expect(createPr).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(budgetRow(db, deploymentId, "comment")).toEqual({ limit_count: 1, used_count: 1 });
    expect(budgetRow(db, deploymentId, "label")).toEqual({ limit_count: 2, used_count: 2 });
    expect(budgetRow(db, deploymentId, "create_issue")).toEqual({ limit_count: 0, used_count: 0 });
    expect(budgetRow(db, deploymentId, "create_pr")).toEqual({ limit_count: 0, used_count: 0 });
    expect(budgetRow(db, deploymentId, "push")).toEqual({ limit_count: 0, used_count: 0 });
  });

  it("keeps manual sessions denied even when a token and budget exist", async () => {
    db.prepare(
      `UPDATE deployments
       SET target_type = 'issue',
           target_number = 506,
           issue_number = 506,
           triggered_by = 'manual',
           completion_token = 'token-506'
       WHERE id = ?`,
    ).run(deploymentId);
    setBudget(db, deploymentId, "comment", 1);
    const comment = vi.fn().mockResolvedValue(undefined);

    await expect(executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-506",
      repoId,
      targetType: "issue",
      targetNumber: 506,
      actionType: "comment",
      payload: { body: "Should be denied." },
    }, { comment })).resolves.toEqual({ allowed: false, reason: "manual_session" });

    expect(comment).not.toHaveBeenCalled();
    expect(budgetRow(db, deploymentId, "comment")).toEqual({ limit_count: 1, used_count: 0 });
  });

  it("denies fork PR pushes before consuming budget or calling the adapter", async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    setBudget(db, deploymentId, "push", 1);

    const result = await executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-44",
      repoId,
      targetType: "pr",
      targetNumber: 44,
      actionType: "push",
      payload: {
        expectedHeadRef: "feature/review",
        expectedHeadSha: "head-a",
        newSha: "head-b",
      },
    }, {
      fetchPull: async () => pull({ headRepoFullName: "contributor/api" }),
      isBranchProtected: async () => false,
      push,
    });

    expect(result).toEqual({ allowed: false, reason: "unsafe_fork_pr" });
    expect(push).not.toHaveBeenCalled();
    expect(budgetRow(db, deploymentId, "push")).toEqual({ limit_count: 1, used_count: 0 });
  });

  it("denies stale PR pushes after the final PR refetch", async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    setBudget(db, deploymentId, "push", 1);

    const result = await executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-44",
      repoId,
      targetType: "pr",
      targetNumber: 44,
      actionType: "push",
      payload: {
        expectedHeadRef: "feature/review",
        expectedHeadSha: "head-old",
        newSha: "head-b",
      },
    }, {
      fetchPull: async () => pull({ headSha: "head-a" }),
      isBranchProtected: async () => false,
      push,
    });

    expect(result).toEqual({ allowed: false, reason: "head_sha_mismatch" });
    expect(push).not.toHaveBeenCalled();
    expect(budgetRow(db, deploymentId, "push")).toEqual({ limit_count: 1, used_count: 0 });
  });

  it("denies same-repo pushes when the PR head is the repository default branch", async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    setBudget(db, deploymentId, "push", 1);

    const result = await executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-44",
      repoId,
      targetType: "pr",
      targetNumber: 44,
      actionType: "push",
      payload: {
        expectedHeadRef: "main",
        expectedHeadSha: "head-a",
        newSha: "head-b",
      },
    }, {
      fetchPull: async () => pull({ headRef: "main", baseRef: "develop", defaultBranch: "main" }),
      isBranchProtected: async () => false,
      push,
    });

    expect(result).toEqual({ allowed: false, reason: "unsafe_default_branch" });
    expect(push).not.toHaveBeenCalled();
    expect(budgetRow(db, deploymentId, "push")).toEqual({ limit_count: 1, used_count: 0 });
  });

  it("denies protected branch pushes", async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    setBudget(db, deploymentId, "push", 1);

    const result = await executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-44",
      repoId,
      targetType: "pr",
      targetNumber: 44,
      actionType: "push",
      payload: {
        expectedHeadRef: "feature/review",
        expectedHeadSha: "head-a",
        newSha: "head-b",
      },
    }, {
      fetchPull: async () => pull(),
      isBranchProtected: async () => true,
      push,
    });

    expect(result).toEqual({ allowed: false, reason: "unsafe_protected_branch" });
    expect(push).not.toHaveBeenCalled();
    expect(budgetRow(db, deploymentId, "push")).toEqual({ limit_count: 1, used_count: 0 });
  });

  it("pushes the new local head after same-repo, non-default, unprotected, final-head and checkout verification", async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const verifyWorkspaceHead = vi.fn().mockResolvedValue({ ok: true });
    setBudget(db, deploymentId, "push", 1);

    const result = await executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-44",
      repoId,
      targetType: "pr",
      targetNumber: 44,
      actionType: "push",
      payload: {
        expectedHeadRef: "feature/review",
        expectedHeadSha: "head-a",
        newSha: "head-b",
      },
    }, {
      fetchPull: async () => pull(),
      isBranchProtected: async () => false,
      verifyWorkspaceHead,
      push,
    });

    expect(result).toEqual({ allowed: true });
    expect(verifyWorkspaceHead).toHaveBeenCalledWith({
      workspacePath: "/tmp/issuectl-pr-44",
      expectedHeadRef: "feature/review",
      expectedHeadSha: "head-b",
      owner: "acme",
      repo: "api",
    });
    expect(push).toHaveBeenCalledWith({
      owner: "acme",
      repo: "api",
      ref: "heads/feature/review",
      sha: "head-b",
      expectedHeadSha: "head-a",
      workspacePath: "/tmp/issuectl-pr-44",
    });
    expect(budgetRow(db, deploymentId, "push")).toEqual({ limit_count: 1, used_count: 1 });
  });

  it("denies push when the push adapter is not configured", async () => {
    setBudget(db, deploymentId, "push", 1);

    const result = await executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-44",
      repoId,
      targetType: "pr",
      targetNumber: 44,
      actionType: "push",
      payload: {
        expectedHeadRef: "feature/review",
        expectedHeadSha: "head-a",
        newSha: "head-b",
      },
    }, {
      fetchPull: async () => pull(),
      isBranchProtected: async () => false,
      verifyWorkspaceHead: async () => ({ ok: true }),
    });

    expect(result).toEqual({ allowed: false, reason: "action_unimplemented" });
    expect(budgetRow(db, deploymentId, "push")).toEqual({ limit_count: 1, used_count: 0 });
  });

  it("denies push when local checkout does not match the expected PR head", async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    setBudget(db, deploymentId, "push", 1);

    const result = await executeAgentMutationRequest(db, {
      deploymentId,
      completionToken: "token-44",
      repoId,
      targetType: "pr",
      targetNumber: 44,
      actionType: "push",
      payload: {
        expectedHeadRef: "feature/review",
        expectedHeadSha: "head-a",
        newSha: "head-b",
      },
    }, {
      fetchPull: async () => pull(),
      isBranchProtected: async () => false,
      verifyWorkspaceHead: async () => ({ ok: false, reason: "unsafe_checkout" }),
      push,
    });

    expect(result).toEqual({ allowed: false, reason: "unsafe_checkout" });
    expect(push).not.toHaveBeenCalled();
    expect(budgetRow(db, deploymentId, "push")).toEqual({ limit_count: 1, used_count: 0 });
  });
});
