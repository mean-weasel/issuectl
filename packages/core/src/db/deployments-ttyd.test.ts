import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import { addRepo } from "./repos.js";
import { seedRepo } from "./deployments-test-helpers.js";
import {
  recordDeployment,
  getDeploymentById,
  hasLiveDeploymentForIssue,
  getActiveDeploymentByPort,
  reserveTtydPort,
  updateTtydInfo,
  endDeployment,
  deletePendingDeployment,
  setIdleSince,
  clearIdleSince,
} from "./deployments.js";

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
