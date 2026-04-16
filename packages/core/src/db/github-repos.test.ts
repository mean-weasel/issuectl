import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import {
  listCachedAccessibleRepos,
  getAccessibleReposSyncedAt,
  replaceAccessibleRepos,
} from "./github-repos.js";
import type { GitHubAccessibleRepo } from "../github/types.js";

const alpha: GitHubAccessibleRepo = {
  owner: "acme",
  name: "alpha",
  private: false,
  pushedAt: "2026-04-10T12:00:00Z",
};
const beta: GitHubAccessibleRepo = {
  owner: "acme",
  name: "beta",
  private: true,
  pushedAt: "2026-04-12T09:00:00Z",
};
const gamma: GitHubAccessibleRepo = {
  owner: "acme",
  name: "gamma",
  private: false,
  pushedAt: null,
};

describe("github-repos DB helpers", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createTestDb();
  });

  describe("listCachedAccessibleRepos", () => {
    it("returns empty snapshot on fresh DB", () => {
      expect(listCachedAccessibleRepos(db)).toEqual({
        repos: [],
        syncedAt: null,
      });
    });

    it("orders by pushed_at DESC then owner/name ASC, nulls last", () => {
      replaceAccessibleRepos(db, [alpha, beta, gamma]);
      const { repos } = listCachedAccessibleRepos(db);
      expect(repos.map((r) => r.name)).toEqual(["beta", "alpha", "gamma"]);
    });

    it("round-trips private flag and pushed_at", () => {
      replaceAccessibleRepos(db, [alpha, beta, gamma]);
      const { repos } = listCachedAccessibleRepos(db);
      const byName = Object.fromEntries(repos.map((r) => [r.name, r]));
      expect(byName.alpha.private).toBe(false);
      expect(byName.beta.private).toBe(true);
      expect(byName.gamma.pushedAt).toBeNull();
    });
  });

  describe("replaceAccessibleRepos", () => {
    it("sets uniform synced_at for the whole batch", () => {
      const now = replaceAccessibleRepos(db, [alpha, beta]);
      expect(listCachedAccessibleRepos(db).syncedAt).toBe(now);
      expect(getAccessibleReposSyncedAt(db)).toBe(now);
    });

    it("fully replaces previous rows (no leftover from prior sync)", () => {
      replaceAccessibleRepos(db, [alpha, beta]);
      replaceAccessibleRepos(db, [gamma]);
      const { repos } = listCachedAccessibleRepos(db);
      expect(repos.map((r) => r.name)).toEqual(["gamma"]);
    });

    it("empty replace clears the table but still updates synced_at", () => {
      replaceAccessibleRepos(db, [alpha]);
      const secondSync = replaceAccessibleRepos(db, []);
      expect(listCachedAccessibleRepos(db).repos).toEqual([]);
      // An empty replace leaves MAX(synced_at) = null since no rows, but
      // the function still returns the intended timestamp so callers can
      // report it.
      expect(getAccessibleReposSyncedAt(db)).toBeNull();
      expect(typeof secondSync).toBe("number");
    });

    it("atomic: a duplicate-key INSERT rolls back the DELETE", () => {
      replaceAccessibleRepos(db, [alpha, beta]);
      // Simulate pathological input: GitHub response contains the same
      // (owner, name) twice. PRIMARY KEY violation should roll back the
      // DELETE so the prior state is preserved.
      expect(() =>
        replaceAccessibleRepos(db, [gamma, gamma]),
      ).toThrow();
      const { repos } = listCachedAccessibleRepos(db);
      expect(repos.map((r) => r.name).sort()).toEqual(["alpha", "beta"]);
    });
  });

  describe("getAccessibleReposSyncedAt", () => {
    it("returns null when the table is empty", () => {
      expect(getAccessibleReposSyncedAt(db)).toBeNull();
    });

    it("returns MAX(synced_at) after a populated replace", () => {
      const t = replaceAccessibleRepos(db, [alpha, beta]);
      expect(getAccessibleReposSyncedAt(db)).toBe(t);
    });
  });
});
