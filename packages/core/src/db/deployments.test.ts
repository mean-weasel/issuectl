import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import { addRepo } from "./repos.js";
import {
  recordDeployment,
  getDeploymentById,
  getDeploymentsForIssue,
  getDeploymentsByRepo,
  updateLinkedPR,
  endDeployment,
  activateDeployment,
  deletePendingDeployment,
} from "./deployments.js";

function seedRepo(db: Database.Database) {
  return addRepo(db, { owner: "acme", name: "api" });
}

describe("recordDeployment", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    repoId = seedRepo(db).id;
  });

  it("records a deployment and returns it with an id", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 42,
      branchName: "issue-42-fix-bug",
      workspaceMode: "existing",
      workspacePath: "/home/dev/api",
    });

    expect(dep.id).toBeGreaterThan(0);
    expect(dep.repoId).toBe(repoId);
    expect(dep.issueNumber).toBe(42);
    expect(dep.branchName).toBe("issue-42-fix-bug");
    expect(dep.workspaceMode).toBe("existing");
    expect(dep.workspacePath).toBe("/home/dev/api");
    expect(dep.linkedPrNumber).toBeNull();
    expect(dep.endedAt).toBeNull();
    expect(dep.launchedAt).toBeTruthy();
  });

  it("allows multiple deployments for the same issue", () => {
    const d1 = recordDeployment(db, {
      repoId,
      issueNumber: 1,
      branchName: "issue-1-a",
      workspaceMode: "existing",
      workspacePath: "/a",
    });
    const d2 = recordDeployment(db, {
      repoId,
      issueNumber: 1,
      branchName: "issue-1-b",
      workspaceMode: "worktree",
      workspacePath: "/b",
    });

    expect(d1.id).not.toBe(d2.id);
  });

  it("rejects non-existent repoId (FK constraint)", () => {
    expect(() =>
      recordDeployment(db, {
        repoId: 999,
        issueNumber: 1,
        branchName: "b",
        workspaceMode: "existing",
        workspacePath: "/x",
      }),
    ).toThrow();
  });
});

describe("getDeploymentById", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns the deployment by id", () => {
    const repo = seedRepo(db);
    const dep = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 10,
      branchName: "issue-10",
      workspaceMode: "clone",
      workspacePath: "/tmp/clone",
    });

    const found = getDeploymentById(db, dep.id);
    expect(found).toEqual(dep);
  });

  it("returns undefined for non-existent id", () => {
    expect(getDeploymentById(db, 999)).toBeUndefined();
  });
});

describe("getDeploymentsForIssue", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns only deployments matching repo and issue number", () => {
    const repo = seedRepo(db);

    recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 1,
      branchName: "a",
      workspaceMode: "existing",
      workspacePath: "/a",
    });
    recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 1,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/b",
    });
    recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 2,
      branchName: "c",
      workspaceMode: "existing",
      workspacePath: "/c",
    });

    const deps = getDeploymentsForIssue(db, repo.id, 1);
    expect(deps).toHaveLength(2);
    expect(deps.every((d) => d.issueNumber === 1)).toBe(true);
  });

  it("returns results ordered by launched_at DESC", () => {
    const repo = seedRepo(db);

    // Explicit timestamps so ordering is deterministic (datetime('now') has second-level precision)
    db.prepare(
      `INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path, launched_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(repo.id, 1, "first", "existing", "/first", "2025-01-01T00:00:00");
    db.prepare(
      `INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path, launched_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(repo.id, 1, "second", "existing", "/second", "2025-01-02T00:00:00");

    const deps = getDeploymentsForIssue(db, repo.id, 1);
    expect(deps[0].branchName).toBe("second");
    expect(deps[1].branchName).toBe("first");
  });
});

describe("getDeploymentsByRepo", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns all deployments for a repo", () => {
    const repo = seedRepo(db);
    const other = addRepo(db, { owner: "acme", name: "web" });

    recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 1,
      branchName: "a",
      workspaceMode: "existing",
      workspacePath: "/a",
    });
    recordDeployment(db, {
      repoId: other.id,
      issueNumber: 2,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/b",
    });

    const deps = getDeploymentsByRepo(db, repo.id);
    expect(deps).toHaveLength(1);
    expect(deps[0].repoId).toBe(repo.id);
  });
});

describe("updateLinkedPR", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("links a PR number to a deployment", () => {
    const repo = seedRepo(db);
    const dep = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 5,
      branchName: "issue-5",
      workspaceMode: "existing",
      workspacePath: "/x",
    });

    updateLinkedPR(db, dep.id, 123);

    const updated = getDeploymentById(db, dep.id);
    expect(updated!.linkedPrNumber).toBe(123);
  });

  it("throws when deployment does not exist", () => {
    expect(() => updateLinkedPR(db, 999, 1)).toThrow(
      "No deployment found with id 999 to link PR",
    );
  });
});

describe("endDeployment", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("sets ended_at on a deployment", () => {
    const repo = seedRepo(db);
    const dep = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 1,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
    });

    expect(dep.endedAt).toBeNull();
    endDeployment(db, dep.id);

    const updated = getDeploymentById(db, dep.id);
    expect(updated!.endedAt).toBeTruthy();
  });

  it("throws when deployment does not exist", () => {
    expect(() => endDeployment(db, 999)).toThrow(
      "No deployment found with id 999",
    );
  });
});

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
