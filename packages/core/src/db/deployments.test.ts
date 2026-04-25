import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import { addRepo } from "./repos.js";
import {
  recordDeployment,
  getDeploymentById,
  getDeploymentsForIssue,
  getDeploymentsByRepo,
  hasLiveDeploymentForIssue,
  getActiveDeploymentByPort,
  updateLinkedPR,
  reserveTtydPort,
  updateTtydInfo,
  endDeployment,
  activateDeployment,
  deletePendingDeployment,
  setIdleSince,
  clearIdleSince,
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

  it("allows re-deploying an issue after the prior deployment has ended", () => {
    // The live-unique index forbids two live rows for the same
    // (repo, issue), but ended rows do not count — ending d1 frees up
    // the slot for d2.
    const d1 = recordDeployment(db, {
      repoId,
      issueNumber: 1,
      branchName: "issue-1-a",
      workspaceMode: "existing",
      workspacePath: "/a",
    });
    endDeployment(db, d1.id);

    const d2 = recordDeployment(db, {
      repoId,
      issueNumber: 1,
      branchName: "issue-1-b",
      workspaceMode: "worktree",
      workspacePath: "/b",
    });

    expect(d1.id).not.toBe(d2.id);
  });

  it("blocks a second live deployment for the same (repo, issue)", () => {
    recordDeployment(db, {
      repoId,
      issueNumber: 1,
      branchName: "issue-1-a",
      workspaceMode: "existing",
      workspacePath: "/a",
    });
    expect(() =>
      recordDeployment(db, {
        repoId,
        issueNumber: 1,
        branchName: "issue-1-b",
        workspaceMode: "worktree",
        workspacePath: "/b",
      }),
    ).toThrow(/UNIQUE constraint failed: deployments\.repo_id, deployments\.issue_number/);
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

    // The live-unique index forbids two live rows for the same
    // (repo, issue), so end the first before launching a second. Ended
    // rows stay visible to getDeploymentsForIssue (the `state='active'`
    // filter does not exclude ended_at).
    const first = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 1,
      branchName: "a",
      workspaceMode: "existing",
      workspacePath: "/a",
    });
    endDeployment(db, first.id);
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

    // Explicit timestamps so ordering is deterministic (datetime('now')
    // has second-level precision). The older row is also marked ended
    // to satisfy the live-unique index; getDeploymentsForIssue still
    // surfaces ended rows for history.
    db.prepare(
      `INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path, launched_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      repo.id,
      1,
      "first",
      "existing",
      "/first",
      "2025-01-01T00:00:00",
      "2025-01-01T12:00:00",
    );
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

  it("clears idle_since when ending an idle deployment", () => {
    const repo = seedRepo(db);
    const dep = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 2,
      branchName: "idle-branch",
      workspaceMode: "existing",
      workspacePath: "/x",
    });
    setIdleSince(db, dep.id);
    expect(getDeploymentById(db, dep.id)!.idleSince).toBeTruthy();

    endDeployment(db, dep.id);
    const ended = getDeploymentById(db, dep.id)!;
    expect(ended.endedAt).toBeTruthy();
    expect(ended.idleSince).toBeNull();
  });

  it("throws when deployment does not exist", () => {
    expect(() => endDeployment(db, 999)).toThrow(
      "No active deployment found with id 999",
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

describe("reserveTtydPort", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    repoId = seedRepo(db).id;
  });

  it("writes port to deployment row without requiring a PID", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 1,
      branchName: "issue-1",
      workspaceMode: "existing",
      workspacePath: "/x",
      state: "pending",
    });

    reserveTtydPort(db, dep.id, 7700);

    const updated = getDeploymentById(db, dep.id);
    expect(updated!.ttydPort).toBe(7700);
    expect(updated!.ttydPid).toBeNull();
  });

  it("makes the reserved port visible to concurrent allocatePort calls (#198)", () => {
    // Core fix for #198: after reserveTtydPort writes the port, a
    // concurrent allocatePort's SELECT must see it — closing the TOCTOU
    // window that let two launches pick the same port.
    const dep1 = recordDeployment(db, {
      repoId,
      issueNumber: 1,
      branchName: "issue-1",
      workspaceMode: "existing",
      workspacePath: "/x",
      state: "pending",
    });
    // Simulate a second concurrent launch for a different issue
    const dep2 = recordDeployment(db, {
      repoId,
      issueNumber: 2,
      branchName: "issue-2",
      workspaceMode: "existing",
      workspacePath: "/y",
      state: "pending",
    });

    // First launch reserves port 7700
    reserveTtydPort(db, dep1.id, 7700);

    // Second launch's allocatePort reads claimed ports — must see 7700.
    // This is the exact query allocatePort uses (ttyd.ts:126-130).
    const rows = db
      .prepare(
        "SELECT ttyd_port FROM deployments WHERE ended_at IS NULL AND ttyd_port IS NOT NULL",
      )
      .all() as { ttyd_port: number }[];
    const claimedPorts = new Set(rows.map((r) => r.ttyd_port));

    expect(claimedPorts.has(7700)).toBe(true);
    // dep2 has no port yet — it would pick the next free one (7701+)
    expect(dep2.ttydPort).toBeNull();
  });

  it("reserved port is freed when pending deployment is rolled back", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 1,
      branchName: "issue-1",
      workspaceMode: "existing",
      workspacePath: "/x",
      state: "pending",
    });

    reserveTtydPort(db, dep.id, 7700);

    // Simulate spawn failure → rollback deletes the pending row
    deletePendingDeployment(db, dep.id);

    // Port 7700 should no longer appear in claimed ports
    const rows = db
      .prepare(
        "SELECT ttyd_port FROM deployments WHERE ended_at IS NULL AND ttyd_port IS NOT NULL",
      )
      .all() as { ttyd_port: number }[];
    expect(rows.map((r) => r.ttyd_port)).not.toContain(7700);
  });

  it("throws for non-existent deployment ID", () => {
    expect(() => reserveTtydPort(db, 99999, 7700)).toThrow(
      "No deployment found",
    );
  });
});

describe("updateTtydInfo", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    repoId = seedRepo(db).id;
  });

  it("writes port and pid to deployment", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 1,
      branchName: "issue-1",
      workspaceMode: "existing",
      workspacePath: "/x",
    });

    updateTtydInfo(db, dep.id, 7700, 12345);

    const updated = getDeploymentById(db, dep.id);
    expect(updated!.ttydPort).toBe(7700);
    expect(updated!.ttydPid).toBe(12345);
  });

  it("throws for non-existent deployment ID", () => {
    expect(() => updateTtydInfo(db, 99999, 7700, 12345)).toThrow(
      "No deployment found",
    );
  });

  it("overwrites existing ttyd info", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 2,
      branchName: "issue-2",
      workspaceMode: "existing",
      workspacePath: "/y",
    });

    updateTtydInfo(db, dep.id, 7700, 12345);
    updateTtydInfo(db, dep.id, 7701, 99999);

    const updated = getDeploymentById(db, dep.id);
    expect(updated!.ttydPort).toBe(7701);
    expect(updated!.ttydPid).toBe(99999);
  });
});

describe("getActiveDeploymentByPort", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns the deployment when port matches an active row", () => {
    const repo = addRepo(db, { owner: "acme", name: "api", localPath: "/tmp/fake" });
    const dep = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 10,
      branchName: "test-branch",
      workspaceMode: "existing",
      workspacePath: "/tmp/ws",
    });
    db.prepare("UPDATE deployments SET ttyd_port = ? WHERE id = ?").run(7700, dep.id);

    const found = getActiveDeploymentByPort(db, 7700);
    expect(found).toBeDefined();
    expect(found!.id).toBe(dep.id);
    expect(found!.ttydPort).toBe(7700);
  });

  it("returns undefined when no deployment uses the port", () => {
    expect(getActiveDeploymentByPort(db, 7700)).toBeUndefined();
  });

  it("returns undefined for an ended deployment's port", () => {
    const repo = addRepo(db, { owner: "acme", name: "api", localPath: "/tmp/fake" });
    const dep = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 11,
      branchName: "ended-branch",
      workspaceMode: "existing",
      workspacePath: "/tmp/ws",
    });
    db.prepare("UPDATE deployments SET ttyd_port = ? WHERE id = ?").run(7701, dep.id);
    db.prepare("UPDATE deployments SET ended_at = datetime('now') WHERE id = ?").run(dep.id);

    expect(getActiveDeploymentByPort(db, 7701)).toBeUndefined();
  });

  it("returns undefined for a pending deployment's port", () => {
    const repo = addRepo(db, { owner: "acme", name: "api", localPath: "/tmp/fake" });
    const dep = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 12,
      branchName: "pending-branch",
      workspaceMode: "existing",
      workspacePath: "/tmp/ws",
      state: "pending",
    });
    db.prepare("UPDATE deployments SET ttyd_port = ? WHERE id = ?").run(7702, dep.id);

    expect(getActiveDeploymentByPort(db, 7702)).toBeUndefined();
  });
});

describe("hasLiveDeploymentForIssue", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    repoId = seedRepo(db).id;
  });

  it("returns false when no deployment exists for the issue", () => {
    expect(hasLiveDeploymentForIssue(db, repoId, 42)).toBe(false);
  });

  it("returns true when a pending deployment exists", () => {
    recordDeployment(db, {
      repoId,
      issueNumber: 42,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
      state: "pending",
    });
    expect(hasLiveDeploymentForIssue(db, repoId, 42)).toBe(true);
  });

  it("returns true when an active deployment exists", () => {
    recordDeployment(db, {
      repoId,
      issueNumber: 42,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
    });
    expect(hasLiveDeploymentForIssue(db, repoId, 42)).toBe(true);
  });

  it("returns false when only an ended deployment exists", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 42,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
    });
    endDeployment(db, dep.id);
    expect(hasLiveDeploymentForIssue(db, repoId, 42)).toBe(false);
  });

  it("scopes by (repo, issue) — other issues do not count", () => {
    recordDeployment(db, {
      repoId,
      issueNumber: 42,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
    });
    expect(hasLiveDeploymentForIssue(db, repoId, 99)).toBe(false);
  });
});

describe("setIdleSince / clearIdleSince", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    repoId = seedRepo(db).id;
  });

  it("deployment starts with idleSince null", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 1,
      branchName: "issue-1",
      workspaceMode: "existing",
      workspacePath: "/tmp",
    });
    expect(dep.idleSince).toBeNull();
  });

  it("setIdleSince marks a deployment as idle", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 2,
      branchName: "issue-2",
      workspaceMode: "existing",
      workspacePath: "/tmp",
    });
    setIdleSince(db, dep.id);
    const updated = getDeploymentById(db, dep.id)!;
    expect(updated.idleSince).toBeTruthy();
  });

  it("clearIdleSince removes idle marker", () => {
    const dep = recordDeployment(db, {
      repoId,
      issueNumber: 3,
      branchName: "issue-3",
      workspaceMode: "existing",
      workspacePath: "/tmp",
    });
    setIdleSince(db, dep.id);
    clearIdleSince(db, dep.id);
    const updated = getDeploymentById(db, dep.id)!;
    expect(updated.idleSince).toBeNull();
  });
});
