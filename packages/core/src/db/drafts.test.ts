import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import {
  createDraft,
  listDrafts,
  getDraft,
  updateDraft,
  deleteDraft,
  assignDraftToRepo,
} from "./drafts.js";
import { addRepo } from "./repos.js";

describe("createDraft", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("creates a draft with the given title and default body/priority", () => {
    const draft = createDraft(db, { title: "Fix the bug" });

    expect(draft.id).toMatch(/^[0-9a-f-]{36}$/); // uuid v4
    expect(draft.title).toBe("Fix the bug");
    expect(draft.body).toBe("");
    expect(draft.priority).toBe("normal");
    expect(draft.createdAt).toBeGreaterThan(0);
    expect(draft.updatedAt).toBe(draft.createdAt);
  });

  it("respects a provided body and priority", () => {
    const draft = createDraft(db, {
      title: "Add retry logic",
      body: "Webhook dispatcher needs exponential backoff.",
      priority: "high",
    });

    expect(draft.body).toBe("Webhook dispatcher needs exponential backoff.");
    expect(draft.priority).toBe("high");
  });

  it("persists the draft to the database", () => {
    const draft = createDraft(db, { title: "Persisted" });
    const row = db
      .prepare("SELECT * FROM drafts WHERE id = ?")
      .get(draft.id) as { id: string; title: string } | undefined;
    expect(row).toBeDefined();
    expect(row?.title).toBe("Persisted");
  });
});

describe("listDrafts", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns an empty array when no drafts exist", () => {
    expect(listDrafts(db)).toEqual([]);
  });

  it("returns all drafts ordered by updated_at DESC", () => {
    const d1 = createDraft(db, { title: "First" });
    // Force distinct timestamps by advancing the DB value
    db.prepare("UPDATE drafts SET updated_at = ? WHERE id = ?").run(
      100,
      d1.id,
    );
    const d2 = createDraft(db, { title: "Second" });
    db.prepare("UPDATE drafts SET updated_at = ? WHERE id = ?").run(
      200,
      d2.id,
    );

    const all = listDrafts(db);
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe(d2.id); // newest first
    expect(all[1].id).toBe(d1.id);
  });
});

describe("getDraft", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns the draft with the given id", () => {
    const created = createDraft(db, { title: "Find me" });
    const found = getDraft(db, created.id);
    expect(found).toEqual(created);
  });

  it("returns null for a non-existent id", () => {
    expect(getDraft(db, "does-not-exist")).toBeNull();
  });
});

describe("updateDraft", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("updates the provided fields and bumps updated_at", () => {
    const created = createDraft(db, { title: "Original", body: "old" });
    // Force updated_at to a known past value
    db.prepare("UPDATE drafts SET updated_at = ? WHERE id = ?").run(
      100,
      created.id,
    );

    const updated = updateDraft(db, created.id, {
      title: "New title",
      body: "new body",
      priority: "high",
    });

    expect(updated).not.toBeNull();
    expect(updated?.title).toBe("New title");
    expect(updated?.body).toBe("new body");
    expect(updated?.priority).toBe("high");
    expect(updated?.updatedAt).toBeGreaterThan(100);
    expect(updated?.createdAt).toBe(created.createdAt);
  });

  it("supports partial updates — only provided fields change", () => {
    const created = createDraft(db, {
      title: "Keep",
      body: "keep body",
      priority: "low",
    });
    const updated = updateDraft(db, created.id, { title: "Changed only" });
    expect(updated?.title).toBe("Changed only");
    expect(updated?.body).toBe("keep body");
    expect(updated?.priority).toBe("low");
  });

  it("returns null when the draft doesn't exist", () => {
    expect(updateDraft(db, "missing", { title: "x" })).toBeNull();
  });
});

describe("deleteDraft", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("removes the draft and returns true", () => {
    const created = createDraft(db, { title: "Goodbye" });
    const removed = deleteDraft(db, created.id);
    expect(removed).toBe(true);
    expect(getDraft(db, created.id)).toBeNull();
  });

  it("returns false when the draft doesn't exist", () => {
    expect(deleteDraft(db, "missing")).toBe(false);
  });
});

describe("assignDraftToRepo", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    const repo = addRepo(db, { owner: "neonwatty", name: "api" });
    repoId = repo.id;
  });

  it("pushes the draft to GitHub, deletes the draft, and returns the created issue info", async () => {
    const draft = createDraft(db, {
      title: "Fix the bug",
      body: "full body text",
      priority: "high",
    });

    // Fake octokit: record the call and return a fake issue
    const calls: Array<{
      owner: string;
      repo: string;
      title: string;
      body: string;
    }> = [];
    const fakeOctokit = {
      rest: {
        issues: {
          create: async (params: {
            owner: string;
            repo: string;
            title: string;
            body: string;
          }) => {
            calls.push(params);
            return {
              data: {
                number: 214,
                title: params.title,
                body: params.body,
                state: "open",
                html_url: `https://github.com/${params.owner}/${params.repo}/issues/214`,
              },
            };
          },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await assignDraftToRepo(db, fakeOctokit, draft.id, repoId);

    // 1. Octokit was called with the right args
    expect(calls).toHaveLength(1);
    expect(calls[0].owner).toBe("neonwatty");
    expect(calls[0].repo).toBe("api");
    expect(calls[0].title).toBe("Fix the bug");
    expect(calls[0].body).toBe("full body text");

    // 2. Returned issue info
    expect(result.issueNumber).toBe(214);
    expect(result.repoId).toBe(repoId);

    // 3. Draft is deleted
    expect(getDraft(db, draft.id)).toBeNull();

    // 4. Priority carried over to issue_metadata
    const metaRow = db
      .prepare(
        "SELECT priority FROM issue_metadata WHERE repo_id = ? AND issue_number = ?",
      )
      .get(repoId, 214) as { priority: string } | undefined;
    expect(metaRow?.priority).toBe("high");
  });

  it("leaves the draft in place if the GitHub call throws", async () => {
    const draft = createDraft(db, { title: "Will fail" });

    const fakeOctokit = {
      rest: {
        issues: {
          create: async () => {
            throw new Error("network down");
          },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(
      assignDraftToRepo(db, fakeOctokit, draft.id, repoId),
    ).rejects.toThrow("network down");

    expect(getDraft(db, draft.id)).not.toBeNull();
  });

  it("throws if the draft doesn't exist", async () => {
    const fakeOctokit = {
      rest: { issues: { create: async () => ({ data: {} }) } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(
      assignDraftToRepo(db, fakeOctokit, "missing", repoId),
    ).rejects.toThrow(/draft/i);
  });

  it("throws if the repo doesn't exist", async () => {
    const draft = createDraft(db, { title: "x" });

    const fakeOctokit = {
      rest: { issues: { create: async () => ({ data: {} }) } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(
      assignDraftToRepo(db, fakeOctokit, draft.id, 99999),
    ).rejects.toThrow(/repo/i);
  });
});
