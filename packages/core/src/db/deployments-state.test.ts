import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import { seedRepo } from "./deployments-test-helpers.js";
import {
  recordDeployment,
  getDeploymentById,
  getDeploymentsForIssue,
  getDeploymentsByRepo,
  activateDeployment,
  deletePendingDeployment,
} from "./deployments.js";

describe("deployment state (R2: pending/active lifecycle)", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    repoId = seedRepo(db).id;
  });

  it("defaults new rows to state='active' for backward compatibility", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 1,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
    });
    expect(dep.state).toBe("active");
  });

  it("records a pending deployment when state='pending' is passed", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 2,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
      state: "pending",
    });
    expect(dep.state).toBe("pending");
  });

  it("getDeploymentsForIssue hides pending rows from callers", () => {
    recordDeployment(db, {
      repoId,
      issueNumber: 3,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
      state: "pending",
    });
    const rows = getDeploymentsForIssue(db, repoId, 3);
    expect(rows).toHaveLength(0);
  });

  it("getDeploymentsByRepo hides pending rows from callers", () => {
    recordDeployment(db, {
      repoId,
      issueNumber: 4,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
      state: "pending",
    });
    const rows = getDeploymentsByRepo(db, repoId);
    expect(rows).toHaveLength(0);
  });

  it("getDeploymentById returns pending rows so rollback can find them", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 5,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
      state: "pending",
    });
    const row = getDeploymentById(db, dep.id);
    expect(row).toBeDefined();
    expect(row?.state).toBe("pending");
  });

  it("activateDeployment flips pending → active", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 6,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
      state: "pending",
    });
    activateDeployment(db, dep.id);
    const row = getDeploymentById(db, dep.id);
    expect(row?.state).toBe("active");
  });

  it("activateDeployment makes the row visible to list queries", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 7,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
      state: "pending",
    });
    expect(getDeploymentsForIssue(db, repoId, 7)).toHaveLength(0);
    activateDeployment(db, dep.id);
    expect(getDeploymentsForIssue(db, repoId, 7)).toHaveLength(1);
  });

  it("activateDeployment throws when no pending row exists", () => {
    // Active rows cannot be re-activated
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 8,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
    });
    expect(() => activateDeployment(db, dep.id)).toThrow(
      /No pending deployment/,
    );
    expect(() => activateDeployment(db, 99999)).toThrow(/No pending deployment/);
  });

  it("deletePendingDeployment removes a pending row as a rollback", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 9,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
      state: "pending",
    });
    deletePendingDeployment(db, dep.id);
    expect(getDeploymentById(db, dep.id)).toBeUndefined();
  });

  it("deletePendingDeployment refuses to delete an active row", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 10,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
    });
    expect(() => deletePendingDeployment(db, dep.id)).toThrow(
      /No pending deployment/,
    );
    // Active row should still be there
    expect(getDeploymentById(db, dep.id)).toBeDefined();
  });
});
