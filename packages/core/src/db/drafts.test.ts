import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import { createDraft } from "./drafts.js";

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
