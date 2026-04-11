import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import { addRepo } from "./repos.js";
import {
  setPriority,
  getPriority,
  deletePriority,
  listPrioritiesForRepo,
} from "./priority.js";

describe("setPriority", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    const repo = addRepo(db, { owner: "neonwatty", name: "test" });
    repoId = repo.id;
  });

  it("inserts a new priority row", () => {
    setPriority(db, repoId, 42, "high");
    const row = db
      .prepare(
        "SELECT * FROM issue_metadata WHERE repo_id = ? AND issue_number = ?",
      )
      .get(repoId, 42) as { priority: string } | undefined;
    expect(row?.priority).toBe("high");
  });

  it("upserts — overwrites an existing priority", () => {
    setPriority(db, repoId, 42, "high");
    setPriority(db, repoId, 42, "low");
    const row = db
      .prepare(
        "SELECT priority FROM issue_metadata WHERE repo_id = ? AND issue_number = ?",
      )
      .get(repoId, 42) as { priority: string };
    expect(row.priority).toBe("low");
  });
});

describe("getPriority", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    const repo = addRepo(db, { owner: "neonwatty", name: "test" });
    repoId = repo.id;
  });

  it("returns 'normal' when no row exists for the issue", () => {
    expect(getPriority(db, repoId, 999)).toBe("normal");
  });

  it("returns the stored priority when a row exists", () => {
    setPriority(db, repoId, 42, "high");
    expect(getPriority(db, repoId, 42)).toBe("high");
  });

  it("returns the stored priority after an upsert", () => {
    setPriority(db, repoId, 42, "high");
    setPriority(db, repoId, 42, "low");
    expect(getPriority(db, repoId, 42)).toBe("low");
  });
});

describe("deletePriority", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    const repo = addRepo(db, { owner: "neonwatty", name: "test" });
    repoId = repo.id;
  });

  it("removes the row and returns true", () => {
    setPriority(db, repoId, 42, "high");
    expect(deletePriority(db, repoId, 42)).toBe(true);
    expect(getPriority(db, repoId, 42)).toBe("normal");
  });

  it("returns false when no row exists", () => {
    expect(deletePriority(db, repoId, 999)).toBe(false);
  });
});

describe("listPrioritiesForRepo", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    const repo = addRepo(db, { owner: "neonwatty", name: "test" });
    repoId = repo.id;
  });

  it("returns all priority rows for the repo", () => {
    setPriority(db, repoId, 1, "high");
    setPriority(db, repoId, 2, "low");
    setPriority(db, repoId, 3, "normal");

    const all = listPrioritiesForRepo(db, repoId);
    expect(all).toHaveLength(3);
    const byNum = new Map(all.map((r) => [r.issueNumber, r.priority]));
    expect(byNum.get(1)).toBe("high");
    expect(byNum.get(2)).toBe("low");
    expect(byNum.get(3)).toBe("normal");
  });

  it("returns an empty array when no priorities exist", () => {
    expect(listPrioritiesForRepo(db, repoId)).toEqual([]);
  });
});
