import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import { createDraft, listDrafts, getDraft, updateDraft } from "./drafts.js";

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
