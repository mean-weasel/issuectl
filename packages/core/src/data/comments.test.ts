import { describe, it, expect, vi, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "../db/test-helpers.js";
import { setCached, getCached } from "../db/cache.js";
import { addComment } from "./comments.js";

vi.mock("../github/issues.js", () => ({
  addComment: vi.fn().mockResolvedValue({
    id: 200,
    body: "test comment",
    user: { login: "alice", avatarUrl: "https://avatar.test/alice" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    htmlUrl: "https://github.com/owner/repo/issues/1#issuecomment-200",
  }),
  getComments: vi.fn(),
}));

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

const OWNER = "owner";
const REPO = "repo";
const ISSUE = 7;

const CACHE_KEYS = [
  `comments:${OWNER}/${REPO}#${ISSUE}`,
  `issue-content:${OWNER}/${REPO}#${ISSUE}`,
  `issue-detail:${OWNER}/${REPO}#${ISSUE}`,
  `pull-detail:${OWNER}/${REPO}#${ISSUE}`,
];

// Minimal stub — the real Octokit is never hit because the github layer is mocked.
const octokit = {} as Parameters<typeof addComment>[1];

describe("addComment (data layer)", () => {
  it("clears all 4 cache keys after posting", async () => {
    for (const key of CACHE_KEYS) {
      setCached(db, key, { placeholder: true });
    }
    for (const key of CACHE_KEYS) {
      expect(getCached(db, key)).not.toBeNull();
    }

    await addComment(db, octokit, OWNER, REPO, ISSUE, "hello");

    for (const key of CACHE_KEYS) {
      expect(getCached(db, key)).toBeNull();
    }
  });
});
