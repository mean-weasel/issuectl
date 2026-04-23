import { describe, it, expect, vi, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "../db/test-helpers.js";
import { setCached } from "../db/cache.js";
import { getCurrentUserLogin } from "./user.js";

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

function makeOctokit(login: string) {
  return {
    rest: {
      users: {
        getAuthenticated: vi.fn().mockResolvedValue({
          data: { login },
        }),
      },
    },
  } as unknown as Parameters<typeof getCurrentUserLogin>[1];
}

describe("getCurrentUserLogin", () => {
  it("returns the authenticated user login", async () => {
    const octokit = makeOctokit("alice");

    const login = await getCurrentUserLogin(db, octokit);
    expect(login).toBe("alice");
  });

  it("caches the result", async () => {
    const octokit = makeOctokit("alice");

    await getCurrentUserLogin(db, octokit);
    await getCurrentUserLogin(db, octokit);

    // Should only call the API once
    expect(octokit.rest.users.getAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("returns from cache on subsequent calls", async () => {
    const octokit = makeOctokit("alice");

    // Prime the cache
    setCached(db, "current-user", "alice");

    const login = await getCurrentUserLogin(db, octokit);
    expect(login).toBe("alice");
    // Should not call the API — served from cache
    expect(octokit.rest.users.getAuthenticated).not.toHaveBeenCalled();
  });
});
