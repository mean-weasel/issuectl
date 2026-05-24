import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import { addRepo } from "./repos.js";
import { seedRepo } from "./deployments-test-helpers.js";
import { recordDeployment, getDeploymentById, getDeploymentsForIssue, getDeploymentsByRepo, updateLinkedPR, endDeployment, setIdleSince } from "./deployments.js";

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
    expect(dep).toMatchObject({
      repoId, issueNumber: 42, targetType: "issue", targetNumber: 42, agent: "claude", triggeredBy: "manual",
      branchName: "issue-42-fix-bug", workspaceMode: "existing", workspacePath: "/home/dev/api",
      linkedPrNumber: null, endedAt: null, terminalReason: null,
      completionToken: null, completionResultJson: null, notificationSentAt: null,
    });
    expect(dep.launchedAt).toBeTruthy();
  });

  it("records webhook provenance, completion token, and PR target identity without fake issue numbers", () => {
    const dep = recordDeployment(db, {
      repoId,
      targetType: "pr",
      targetNumber: 44,
      branchName: "pr-44-review",
      workspaceMode: "worktree",
      workspacePath: "/home/dev/api",
      triggeredBy: "webhook",
      completionToken: "token-123",
    });

    expect(dep.triggeredBy).toBe("webhook");
    expect(dep.issueNumber).toBeNull();
    expect(dep.targetType).toBe("pr");
    expect(dep.targetNumber).toBe(44);
    expect(dep.completionToken).toBe("token-123");
    expect(getDeploymentById(db, dep.id)).toEqual(
      expect.objectContaining({ issueNumber: null, targetType: "pr", targetNumber: 44, triggeredBy: "webhook", completionToken: "token-123" }),
    );
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
    endDeployment(db, d1.id, "ended_manual");

    const d2 = recordDeployment(db, {
      repoId,
      issueNumber: 1,
      branchName: "issue-1-b",
      workspaceMode: "worktree",
      workspacePath: "/b",
    });

    expect(d1.id).not.toBe(d2.id);
    expect(getDeploymentById(db, d1.id)?.terminalReason).toBe("ended_manual");
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
    ).toThrow(/UNIQUE constraint failed: deployments\.repo_id, deployments\.target_type, deployments\.target_number/);
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
      `INSERT INTO deployments (repo_id, issue_number, target_type, target_number, branch_name, workspace_mode, workspace_path, launched_at, ended_at)
       VALUES (?, ?, 'issue', ?, ?, ?, ?, ?, ?)`,
    ).run(
      repo.id,
      1,
      1,
      "first",
      "existing",
      "/first",
      "2025-01-01T00:00:00",
      "2025-01-01T12:00:00",
    );
    db.prepare(
      `INSERT INTO deployments (repo_id, issue_number, target_type, target_number, branch_name, workspace_mode, workspace_path, launched_at)
       VALUES (?, ?, 'issue', ?, ?, ?, ?, ?)`,
    ).run(repo.id, 1, 1, "second", "existing", "/second", "2025-01-02T00:00:00");

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
