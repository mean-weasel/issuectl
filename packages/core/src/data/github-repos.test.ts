import { describe, it, expect } from "vitest";
import { createTestDb } from "../db/test-helpers.js";
import { replaceAccessibleRepos } from "../db/github-repos.js";
import {
  ACCESSIBLE_REPOS_TTL_SECONDS,
  readCachedAccessibleRepos,
} from "./github-repos.js";
import type { GitHubAccessibleRepo } from "../github/types.js";

const alpha: GitHubAccessibleRepo = {
  owner: "acme",
  name: "alpha",
  private: false,
  pushedAt: "2026-04-10T12:00:00Z",
};

describe("readCachedAccessibleRepos", () => {
  it("empty cache is always stale", () => {
    const db = createTestDb();
    const snapshot = readCachedAccessibleRepos(db, 1_000_000);
    expect(snapshot).toEqual({ repos: [], syncedAt: null, isStale: true });
  });

  it("fresh cache (just synced) is not stale", () => {
    const db = createTestDb();
    const syncedAt = replaceAccessibleRepos(db, [alpha]);
    const snapshot = readCachedAccessibleRepos(db, syncedAt);
    expect(snapshot.isStale).toBe(false);
    expect(snapshot.syncedAt).toBe(syncedAt);
    expect(snapshot.repos).toHaveLength(1);
  });

  it("exactly at TTL boundary is not stale", () => {
    const db = createTestDb();
    const syncedAt = replaceAccessibleRepos(db, [alpha]);
    const now = syncedAt + ACCESSIBLE_REPOS_TTL_SECONDS;
    expect(readCachedAccessibleRepos(db, now).isStale).toBe(false);
  });

  it("one second past TTL is stale", () => {
    const db = createTestDb();
    const syncedAt = replaceAccessibleRepos(db, [alpha]);
    const now = syncedAt + ACCESSIBLE_REPOS_TTL_SECONDS + 1;
    expect(readCachedAccessibleRepos(db, now).isStale).toBe(true);
  });
});
