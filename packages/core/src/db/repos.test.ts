import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import {
  addRepo,
  removeRepo,
  getRepo,
  getRepoById,
  listRepos,
  updateRepo,
} from "./repos.js";
import { recordDeployment, getDeploymentsByRepo } from "./deployments.js";

describe("addRepo", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("inserts a repo and returns it with an id", () => {
    const repo = addRepo(db, { owner: "acme", name: "api" });
    expect(repo.id).toBeGreaterThan(0);
    expect(repo.owner).toBe("acme");
    expect(repo.name).toBe("api");
    expect(repo.localPath).toBeNull();
    expect(repo.branchPattern).toBeNull();
    expect(repo.createdAt).toBeTruthy();
  });

  it("stores optional localPath and branchPattern", () => {
    const repo = addRepo(db, {
      owner: "acme",
      name: "web",
      localPath: "/home/dev/web",
      branchPattern: "feat/{number}-{slug}",
    });
    expect(repo.localPath).toBe("/home/dev/web");
    expect(repo.branchPattern).toBe("feat/{number}-{slug}");
  });

  it("rejects duplicate owner+name", () => {
    addRepo(db, { owner: "acme", name: "api" });
    expect(() => addRepo(db, { owner: "acme", name: "api" })).toThrow();
  });

  it("allows same name under different owners", () => {
    const a = addRepo(db, { owner: "acme", name: "api" });
    const b = addRepo(db, { owner: "other", name: "api" });
    expect(a.id).not.toBe(b.id);
  });
});

describe("getRepo", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns the repo by owner and name", () => {
    addRepo(db, { owner: "acme", name: "api" });
    const found = getRepo(db, "acme", "api");
    expect(found).toBeDefined();
    expect(found!.owner).toBe("acme");
  });

  it("returns undefined for non-existent repo", () => {
    expect(getRepo(db, "nope", "nada")).toBeUndefined();
  });
});

describe("getRepoById", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns the repo by id", () => {
    const repo = addRepo(db, { owner: "acme", name: "api" });
    const found = getRepoById(db, repo.id);
    expect(found).toEqual(repo);
  });

  it("returns undefined for non-existent id", () => {
    expect(getRepoById(db, 999)).toBeUndefined();
  });
});

describe("listRepos", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns empty array when no repos exist", () => {
    expect(listRepos(db)).toEqual([]);
  });

  it("returns all repos ordered by created_at DESC", () => {
    // Explicit timestamps so ordering is deterministic (datetime('now') has second-level precision)
    db.prepare(
      "INSERT INTO repos (owner, name, created_at) VALUES (?, ?, ?)",
    ).run("acme", "first", "2025-01-01T00:00:00");
    db.prepare(
      "INSERT INTO repos (owner, name, created_at) VALUES (?, ?, ?)",
    ).run("acme", "second", "2025-01-02T00:00:00");

    const repos = listRepos(db);
    expect(repos).toHaveLength(2);
    expect(repos[0].name).toBe("second");
    expect(repos[1].name).toBe("first");
  });
});

describe("removeRepo", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("deletes a repo by id", () => {
    const repo = addRepo(db, { owner: "acme", name: "api" });
    removeRepo(db, repo.id);
    expect(getRepoById(db, repo.id)).toBeUndefined();
  });

  it("throws when repo does not exist", () => {
    expect(() => removeRepo(db, 999)).toThrow(
      "No repo found with id 999 to remove",
    );
  });

  it("cascades to deployment rows (no FK block)", () => {
    // A2 fix: deployments.repo_id now has ON DELETE CASCADE, so removing
    // a repo with launch history is allowed and drops the orphaned rows.
    const repo = addRepo(db, { owner: "acme", name: "fk-test" });
    recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 1,
      branchName: "b",
      workspaceMode: "existing",
      workspacePath: "/x",
    });
    expect(getDeploymentsByRepo(db, repo.id)).toHaveLength(1);

    removeRepo(db, repo.id);

    expect(getRepoById(db, repo.id)).toBeUndefined();
    expect(getDeploymentsByRepo(db, repo.id)).toHaveLength(0);
  });
});

describe("updateRepo", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("updates localPath", () => {
    const repo = addRepo(db, { owner: "acme", name: "api" });
    const updated = updateRepo(db, repo.id, { localPath: "/new/path" });
    expect(updated.localPath).toBe("/new/path");
  });

  it("updates branchPattern", () => {
    const repo = addRepo(db, { owner: "acme", name: "api" });
    const updated = updateRepo(db, repo.id, {
      branchPattern: "fix/{number}",
    });
    expect(updated.branchPattern).toBe("fix/{number}");
  });

  it("updates both fields at once", () => {
    const repo = addRepo(db, { owner: "acme", name: "api" });
    const updated = updateRepo(db, repo.id, {
      localPath: "/updated",
      branchPattern: "chore/{slug}",
    });
    expect(updated.localPath).toBe("/updated");
    expect(updated.branchPattern).toBe("chore/{slug}");
  });

  it("returns unchanged repo when no updates provided", () => {
    const repo = addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/original",
    });
    const updated = updateRepo(db, repo.id, {});
    expect(updated.localPath).toBe("/original");
  });

  it("throws when repo does not exist", () => {
    expect(() => updateRepo(db, 999, { localPath: "/x" })).toThrow(
      "Repo with id 999 not found",
    );
  });
});
