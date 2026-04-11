# Paper Reskin Implementation Plan — Phase 1 & 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the foundation for the Paper reskin by adding the data-layer support for local drafts and per-issue priority, plus the Paper visual design tokens and shared primitives that every Phase 3+ screen will build on.

**Architecture:** Phase 1 is pure backend — new SQLite tables, CRUD functions, and a workflow function that pushes a draft to GitHub. Phase 2 is pure CSS + atomic React components — no routes change, no data flows, just new primitives ready to use. After these two phases, the app still runs unchanged visually but has everything needed for Phase 3 to replace the dashboard.

**Tech Stack:** pnpm workspaces + Turborepo · TypeScript (strict) · better-sqlite3 · Vitest (already set up in `@issuectl/core`) · Octokit · Next.js App Router · CSS Modules.

**Scope:** Phase 1 (Data Layer) + Phase 2 (Paper Tokens + Primitives) from the 8-phase rollout in `docs/specs/2026-04-10-todo-reskin-design.md`. Phases 3–8 will be planned in follow-up documents once these foundations land.

---

## Overview

This plan implements two of the eight phases from the Paper reskin spec. Each task is a bite-sized TDD cycle where applicable, with exact file paths, complete code, and explicit commands.

**Phase 1 — Data Layer.** Add `drafts` and `issue_metadata` tables, their CRUD functions, and the `assignDraftToRepo` workflow function that pushes a draft to GitHub via Octokit. Follows the existing core package convention: explicit `db` parameter, explicit `octokit` parameter, Vitest unit tests alongside each file.

**Phase 2 — Paper Tokens + Shared Primitives.** Replace the existing `globals.css` light/dark theme with the Paper palette (warm cream + forest green accent + italic serif display). Add Google Fonts imports via `next/font`. Create atomic primitives — `Chip`, `Button`, `Sheet`, `Drawer` — that Phase 3 screens will compose. No component tests (existing web convention).

**Convention reminders** (from `CLAUDE.md`):
- ESM everywhere. Strict TypeScript.
- No classes — plain functions and objects.
- DB functions take `db: Database.Database` as first param. GitHub functions take `octokit: Octokit` as first param. No globals.
- Test files live next to the code (`foo.test.ts` alongside `foo.ts`).
- CSS Modules per component, tokens in `app/globals.css`.

## Prerequisites

- [ ] Clean working tree on `main`: run `git status` — should show no modifications
- [ ] `pnpm install` completes without errors
- [ ] `pnpm turbo typecheck` passes
- [ ] `pnpm turbo build` passes
- [ ] `pnpm -F @issuectl/core test` passes (existing Vitest suite is green)
- [ ] `gh auth status` shows an authenticated user

Read these before starting:

1. `docs/specs/2026-04-10-todo-reskin-design.md` — the spec this plan implements
2. `docs/mockups/paper-reskin.html` — the visual reference (open in a browser; see anchors `#flow1`–`#flow12`)
3. `packages/core/src/db/schema.ts` — current schema + version
4. `packages/core/src/db/migrations.ts` — migration pattern to follow
5. `packages/core/src/db/settings.ts` + `settings.test.ts` — CRUD + test pattern to follow
6. `packages/core/src/db/test-helpers.ts` — the `createTestDb()` helper
7. `packages/core/src/types.ts` — where to add new types
8. `packages/core/src/index.ts` — where to add new exports
9. `packages/web/app/globals.css` — the file you'll rewrite in Phase 2
10. `packages/web/app/layout.tsx` — where font imports go

---

## Phase 1: Data Layer

Twelve tasks. Order matters — tasks build on each other (types → migration → CRUD → workflow → exports). Each task is a single TDD cycle ending in a commit.

---

### Task 1.1: Add `Draft` and `Priority` types

**Files:**
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Open `packages/core/src/types.ts` and append the new types at the bottom of the file**

```typescript
export type Priority = "low" | "normal" | "high";

export type Draft = {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  createdAt: number; // unix seconds
  updatedAt: number; // unix seconds
};

export type DraftInput = {
  title: string;
  body?: string;
  priority?: Priority;
};

export type IssuePriority = {
  repoId: number;
  issueNumber: number;
  priority: Priority;
  updatedAt: number; // unix seconds
};
```

- [ ] **Step 2: Run typecheck to verify the file still compiles**

Run: `pnpm -F @issuectl/core typecheck`
Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add Draft and Priority types"
```

---

### Task 1.2: Add v5 schema migration (drafts + issue_metadata tables)

**Files:**
- Modify: `packages/core/src/db/schema.ts`
- Modify: `packages/core/src/db/migrations.ts`
- Modify: `packages/core/src/db/schema.test.ts` (or create if structure differs)

- [ ] **Step 1: Read `packages/core/src/db/schema.test.ts` to understand the existing test pattern for schema**

Run: `cat packages/core/src/db/schema.test.ts`
Keep the file open mentally as a template for the new test.

- [ ] **Step 2: Write a failing test for the v5 migration**

Append to `packages/core/src/db/schema.test.ts` (or add a new `describe` block):

```typescript
import { describe, it, expect } from "vitest";
import { createTestDb, createRawTestDb } from "./test-helpers.js";
import { initSchema, getSchemaVersion } from "./schema.js";
import { runMigrations } from "./migrations.js";

describe("schema v5 — drafts and issue_metadata", () => {
  it("initSchema on a fresh DB produces schema version 5", () => {
    const db = createRawTestDb();
    initSchema(db);
    expect(getSchemaVersion(db)).toBe(5);
  });

  it("fresh schema includes the drafts table", () => {
    const db = createTestDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drafts'",
      )
      .get();
    expect(row).toBeDefined();
  });

  it("fresh schema includes the issue_metadata table", () => {
    const db = createTestDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'issue_metadata'",
      )
      .get();
    expect(row).toBeDefined();
  });

  it("drafts table enforces the priority CHECK constraint", () => {
    const db = createTestDb();
    expect(() =>
      db
        .prepare(
          "INSERT INTO drafts (id, title, body, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("abc", "t", "b", "bogus", 1, 1),
    ).toThrow();
  });

  it("migration from v4 → v5 adds drafts and issue_metadata to an existing DB", () => {
    const db = createRawTestDb();
    // Simulate a v4 DB: run the v4-era schema manually
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (4);
      CREATE TABLE repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        local_path TEXT,
        branch_pattern TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(owner, name)
      );
    `);
    expect(getSchemaVersion(db)).toBe(4);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(5);
    const drafts = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drafts'",
      )
      .get();
    expect(drafts).toBeDefined();
    const meta = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'issue_metadata'",
      )
      .get();
    expect(meta).toBeDefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm -F @issuectl/core test schema`
Expected: Failures mentioning `drafts` and `issue_metadata` tables not existing, and the schema version still being 4.

- [ ] **Step 4: Update `packages/core/src/db/schema.ts` — bump SCHEMA_VERSION to 5 and add the new tables to `CREATE_TABLES`**

Replace the `SCHEMA_VERSION = 4` line and the `CREATE_TABLES` string:

```typescript
import type Database from "better-sqlite3";

const SCHEMA_VERSION = 5;

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS repos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    owner          TEXT NOT NULL,
    name           TEXT NOT NULL,
    local_path     TEXT,
    branch_pattern TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(owner, name)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deployments (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id          INTEGER NOT NULL REFERENCES repos(id),
    issue_number     INTEGER NOT NULL,
    branch_name      TEXT NOT NULL,
    workspace_mode   TEXT NOT NULL,
    workspace_path   TEXT NOT NULL,
    linked_pr_number INTEGER,
    launched_at      TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at         TEXT
  );

  CREATE TABLE IF NOT EXISTS cache (
    key        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS drafts (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    priority   TEXT NOT NULL DEFAULT 'normal'
               CHECK (priority IN ('low', 'normal', 'high')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS issue_metadata (
    repo_id      INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    issue_number INTEGER NOT NULL,
    priority     TEXT NOT NULL DEFAULT 'normal'
                 CHECK (priority IN ('low', 'normal', 'high')),
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY (repo_id, issue_number)
  );

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );
`;

export function initSchema(db: Database.Database): void {
  db.exec(CREATE_TABLES);

  const row = db.prepare("SELECT version FROM schema_version").get() as
    | { version: number }
    | undefined;

  if (!row) {
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(
      SCHEMA_VERSION,
    );
  }
}

export function getSchemaVersion(db: Database.Database): number {
  const row = db.prepare("SELECT version FROM schema_version").get() as
    | { version: number }
    | undefined;
  return row?.version ?? 0;
}
```

- [ ] **Step 5: Add the v5 migration entry to `packages/core/src/db/migrations.ts`**

Append a new entry to the `migrations` array (after the existing `version: 4` entry):

```typescript
  {
    version: 5,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS drafts (
          id         TEXT PRIMARY KEY,
          title      TEXT NOT NULL,
          body       TEXT NOT NULL DEFAULT '',
          priority   TEXT NOT NULL DEFAULT 'normal'
                     CHECK (priority IN ('low', 'normal', 'high')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS issue_metadata (
          repo_id      INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          issue_number INTEGER NOT NULL,
          priority     TEXT NOT NULL DEFAULT 'normal'
                       CHECK (priority IN ('low', 'normal', 'high')),
          updated_at   INTEGER NOT NULL,
          PRIMARY KEY (repo_id, issue_number)
        );
      `);
    },
  },
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm -F @issuectl/core test schema`
Expected: All schema tests pass, including the new v5 tests.

- [ ] **Step 7: Run the full core test suite to verify no regressions**

Run: `pnpm -F @issuectl/core test`
Expected: All existing tests still pass.

- [ ] **Step 8: Run typecheck and lint**

Run: `pnpm -F @issuectl/core typecheck && pnpm -F @issuectl/core lint`
Expected: Zero errors.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/db/schema.ts packages/core/src/db/schema.test.ts packages/core/src/db/migrations.ts
git commit -m "feat(core): schema v5 — drafts and issue_metadata tables"
```

---

### Task 1.3: Implement `createDraft`

**Files:**
- Create: `packages/core/src/db/drafts.ts`
- Create: `packages/core/src/db/drafts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/db/drafts.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @issuectl/core test drafts`
Expected: Failure — module `./drafts.js` not found.

- [ ] **Step 3: Implement `createDraft`**

Create `packages/core/src/db/drafts.ts`:

```typescript
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Draft, DraftInput, Priority } from "../types.js";

type DraftRow = {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  created_at: number;
  updated_at: number;
};

function rowToDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createDraft(db: Database.Database, input: DraftInput): Draft {
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const body = input.body ?? "";
  const priority = input.priority ?? "normal";

  db.prepare(
    `INSERT INTO drafts (id, title, body, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, input.title, body, priority, now, now);

  return {
    id,
    title: input.title,
    body,
    priority,
    createdAt: now,
    updatedAt: now,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F @issuectl/core test drafts`
Expected: All `createDraft` tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/drafts.ts packages/core/src/db/drafts.test.ts
git commit -m "feat(core): implement createDraft"
```

---

### Task 1.4: Implement `listDrafts`

**Files:**
- Modify: `packages/core/src/db/drafts.ts`
- Modify: `packages/core/src/db/drafts.test.ts`

- [ ] **Step 1: Append a failing test**

Add to `packages/core/src/db/drafts.test.ts`:

```typescript
import { createDraft, listDrafts } from "./drafts.js";

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
```

**Important:** Update the import at the top of the existing import block in `drafts.test.ts` so both `createDraft` and `listDrafts` are imported together. Replace the line `import { createDraft } from "./drafts.js";` (added in Task 1.3) with `import { createDraft, listDrafts } from "./drafts.js";`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @issuectl/core test drafts`
Expected: Failure — `listDrafts` is not exported.

- [ ] **Step 3: Implement `listDrafts` in `packages/core/src/db/drafts.ts`**

Append after `createDraft`:

```typescript
export function listDrafts(db: Database.Database): Draft[] {
  const rows = db
    .prepare(
      `SELECT id, title, body, priority, created_at, updated_at
       FROM drafts
       ORDER BY updated_at DESC`,
    )
    .all() as DraftRow[];
  return rows.map(rowToDraft);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F @issuectl/core test drafts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/drafts.ts packages/core/src/db/drafts.test.ts
git commit -m "feat(core): implement listDrafts"
```

---

### Task 1.5: Implement `getDraft`

**Files:**
- Modify: `packages/core/src/db/drafts.ts`
- Modify: `packages/core/src/db/drafts.test.ts`

- [ ] **Step 1: Append a failing test to `drafts.test.ts`**

```typescript
import { createDraft, listDrafts, getDraft } from "./drafts.js";

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
```

Update the import line for `./drafts.js` in the test file to include `getDraft`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @issuectl/core test drafts`
Expected: Failure — `getDraft` not exported.

- [ ] **Step 3: Implement `getDraft` in `drafts.ts`**

Append:

```typescript
export function getDraft(db: Database.Database, id: string): Draft | null {
  const row = db
    .prepare(
      `SELECT id, title, body, priority, created_at, updated_at
       FROM drafts
       WHERE id = ?`,
    )
    .get(id) as DraftRow | undefined;
  return row ? rowToDraft(row) : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F @issuectl/core test drafts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/drafts.ts packages/core/src/db/drafts.test.ts
git commit -m "feat(core): implement getDraft"
```

---

### Task 1.6: Implement `updateDraft`

**Files:**
- Modify: `packages/core/src/db/drafts.ts`
- Modify: `packages/core/src/db/drafts.test.ts`

- [ ] **Step 1: Append a failing test**

```typescript
import { createDraft, listDrafts, getDraft, updateDraft } from "./drafts.js";

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
```

Update the import line to include `updateDraft`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @issuectl/core test drafts`
Expected: Failure — `updateDraft` not exported.

- [ ] **Step 3: Implement `updateDraft` in `drafts.ts`**

Append:

```typescript
export type DraftUpdate = Partial<Pick<Draft, "title" | "body" | "priority">>;

export function updateDraft(
  db: Database.Database,
  id: string,
  update: DraftUpdate,
): Draft | null {
  const existing = getDraft(db, id);
  if (!existing) return null;

  const next: Draft = {
    ...existing,
    ...update,
    updatedAt: Math.floor(Date.now() / 1000),
  };

  db.prepare(
    `UPDATE drafts
     SET title = ?, body = ?, priority = ?, updated_at = ?
     WHERE id = ?`,
  ).run(next.title, next.body, next.priority, next.updatedAt, id);

  return next;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F @issuectl/core test drafts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/drafts.ts packages/core/src/db/drafts.test.ts
git commit -m "feat(core): implement updateDraft"
```

---

### Task 1.7: Implement `deleteDraft`

**Files:**
- Modify: `packages/core/src/db/drafts.ts`
- Modify: `packages/core/src/db/drafts.test.ts`

- [ ] **Step 1: Append a failing test**

```typescript
import {
  createDraft,
  listDrafts,
  getDraft,
  updateDraft,
  deleteDraft,
} from "./drafts.js";

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
```

Update the import line to include `deleteDraft`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @issuectl/core test drafts`
Expected: Failure — `deleteDraft` not exported.

- [ ] **Step 3: Implement `deleteDraft`**

Append to `drafts.ts`:

```typescript
export function deleteDraft(db: Database.Database, id: string): boolean {
  const info = db.prepare("DELETE FROM drafts WHERE id = ?").run(id);
  return info.changes > 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F @issuectl/core test drafts`
Expected: All tests pass.

- [ ] **Step 5: Run the full core suite to check for regressions**

Run: `pnpm -F @issuectl/core test`
Expected: Everything green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/db/drafts.ts packages/core/src/db/drafts.test.ts
git commit -m "feat(core): implement deleteDraft"
```

---

### Task 1.8: Implement `setPriority`

**Files:**
- Create: `packages/core/src/db/priority.ts`
- Create: `packages/core/src/db/priority.test.ts`

- [ ] **Step 1: Write a failing test**

Create `packages/core/src/db/priority.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import { addRepo } from "./repos.js";
import { setPriority } from "./priority.js";

describe("setPriority", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    // addRepo signature: takes { owner, name, localPath?, branchPattern? }.
    // localPath and branchPattern are optional — pass as undefined (or omit).
    const repo = addRepo(db, {
      owner: "neonwatty",
      name: "test",
    });
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @issuectl/core test priority`
Expected: Failure — module `./priority.js` not found.

- [ ] **Step 3: Implement `setPriority`**

Create `packages/core/src/db/priority.ts`:

```typescript
import type Database from "better-sqlite3";
import type { Priority, IssuePriority } from "../types.js";

type IssuePriorityRow = {
  repo_id: number;
  issue_number: number;
  priority: Priority;
  updated_at: number;
};

function rowToIssuePriority(row: IssuePriorityRow): IssuePriority {
  return {
    repoId: row.repo_id,
    issueNumber: row.issue_number,
    priority: row.priority,
    updatedAt: row.updated_at,
  };
}

export function setPriority(
  db: Database.Database,
  repoId: number,
  issueNumber: number,
  priority: Priority,
): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO issue_metadata (repo_id, issue_number, priority, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (repo_id, issue_number)
     DO UPDATE SET priority = excluded.priority, updated_at = excluded.updated_at`,
  ).run(repoId, issueNumber, priority, now);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F @issuectl/core test priority`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/priority.ts packages/core/src/db/priority.test.ts
git commit -m "feat(core): implement setPriority"
```

---

### Task 1.9: Implement `getPriority` (with `normal` fallback)

**Files:**
- Modify: `packages/core/src/db/priority.ts`
- Modify: `packages/core/src/db/priority.test.ts`

- [ ] **Step 1: Append a failing test**

Append to `priority.test.ts`:

```typescript
import { setPriority, getPriority } from "./priority.js";

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
```

Update the import to include `getPriority`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @issuectl/core test priority`
Expected: Failure — `getPriority` not exported.

- [ ] **Step 3: Implement `getPriority`**

Append to `priority.ts`:

```typescript
export function getPriority(
  db: Database.Database,
  repoId: number,
  issueNumber: number,
): Priority {
  const row = db
    .prepare(
      `SELECT priority FROM issue_metadata
       WHERE repo_id = ? AND issue_number = ?`,
    )
    .get(repoId, issueNumber) as { priority: Priority } | undefined;
  return row?.priority ?? "normal";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F @issuectl/core test priority`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/priority.ts packages/core/src/db/priority.test.ts
git commit -m "feat(core): implement getPriority with normal fallback"
```

---

### Task 1.10: Implement `deletePriority` and `listPrioritiesForRepo`

**Files:**
- Modify: `packages/core/src/db/priority.ts`
- Modify: `packages/core/src/db/priority.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `priority.test.ts`:

```typescript
import {
  setPriority,
  getPriority,
  deletePriority,
  listPrioritiesForRepo,
} from "./priority.js";

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
```

Update the import to include `deletePriority` and `listPrioritiesForRepo`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @issuectl/core test priority`
Expected: Failure — functions not exported.

- [ ] **Step 3: Implement the functions**

Append to `priority.ts`:

```typescript
export function deletePriority(
  db: Database.Database,
  repoId: number,
  issueNumber: number,
): boolean {
  const info = db
    .prepare(
      `DELETE FROM issue_metadata WHERE repo_id = ? AND issue_number = ?`,
    )
    .run(repoId, issueNumber);
  return info.changes > 0;
}

export function listPrioritiesForRepo(
  db: Database.Database,
  repoId: number,
): IssuePriority[] {
  const rows = db
    .prepare(
      `SELECT repo_id, issue_number, priority, updated_at
       FROM issue_metadata
       WHERE repo_id = ?`,
    )
    .all(repoId) as IssuePriorityRow[];
  return rows.map(rowToIssuePriority);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F @issuectl/core test priority`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/priority.ts packages/core/src/db/priority.test.ts
git commit -m "feat(core): implement deletePriority and listPrioritiesForRepo"
```

---

### Task 1.11: Implement `assignDraftToRepo` (the workflow function)

**Files:**
- Modify: `packages/core/src/db/drafts.ts`
- Modify: `packages/core/src/db/drafts.test.ts`

This is the workflow function that pushes a draft to GitHub and deletes the local draft on success. It takes both a `db` and an `octokit` parameter. Follows the pattern used by `launch/launch.ts` — workflow functions live alongside their primary store.

- [ ] **Step 1: Read the existing `createIssue` signature to know what to call**

Run: `cat packages/core/src/github/issues.ts`
Identify the `createIssue` function: it should take `(octokit, owner, repo, { title, body, labels? })` and return a `GitHubIssue`.

- [ ] **Step 2: Write a failing test**

Append to `drafts.test.ts`:

```typescript
import { assignDraftToRepo } from "./drafts.js";
import { addRepo, getRepoById } from "./repos.js";

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
```

**Note:** `getRepoById` is imported for readability but not directly used in the test — the `addRepo` return value provides `repoId`. Remove the unused import if lint complains.

Update the `./drafts.js` import to include `assignDraftToRepo`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm -F @issuectl/core test drafts`
Expected: Failure — `assignDraftToRepo` not exported.

- [ ] **Step 4: Implement `assignDraftToRepo`**

Add to `drafts.ts`. First, add the imports at the top:

```typescript
import type { Octokit } from "@octokit/rest";
import { getRepoById } from "./repos.js";
import { setPriority } from "./priority.js";
```

Then append the function:

```typescript
export type AssignDraftResult = {
  repoId: number;
  issueNumber: number;
  issueUrl: string;
};

export async function assignDraftToRepo(
  db: Database.Database,
  octokit: Octokit,
  draftId: string,
  repoId: number,
): Promise<AssignDraftResult> {
  const draft = getDraft(db, draftId);
  if (!draft) {
    throw new Error(`No draft with id '${draftId}'`);
  }

  const repo = getRepoById(db, repoId);
  if (!repo) {
    throw new Error(`No tracked repo with id ${repoId}`);
  }

  // Create the issue on GitHub first. If this throws, we leave the draft
  // in place so the user can retry — do not delete the draft until we know
  // the push succeeded.
  const response = await octokit.rest.issues.create({
    owner: repo.owner,
    repo: repo.name,
    title: draft.title,
    body: draft.body,
  });

  const issueNumber = response.data.number;
  const issueUrl = response.data.html_url;

  // Carry the local priority over to issue_metadata if it wasn't 'normal'.
  // Priority is local-only metadata — the GitHub issue itself has no concept
  // of it, so we key it under (repoId, issueNumber) on this side.
  if (draft.priority !== "normal") {
    setPriority(db, repoId, issueNumber, draft.priority);
  }

  // Finally, remove the local draft now that the GitHub issue exists.
  deleteDraft(db, draftId);

  return { repoId, issueNumber, issueUrl };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm -F @issuectl/core test drafts`
Expected: All tests pass.

- [ ] **Step 6: Run the full core suite for regressions**

Run: `pnpm -F @issuectl/core test`
Expected: Everything green.

- [ ] **Step 7: Run typecheck + lint**

Run: `pnpm -F @issuectl/core typecheck && pnpm -F @issuectl/core lint`
Expected: Zero errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/db/drafts.ts packages/core/src/db/drafts.test.ts
git commit -m "feat(core): implement assignDraftToRepo workflow"
```

---

### Task 1.12: Export new functions from the core package index

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the new type exports**

In `packages/core/src/index.ts`, find the first `export type` line at the top:

```typescript
export type { Repo, Setting, SettingKey, Deployment, CacheEntry } from "./types.js";
```

Replace it with:

```typescript
export type {
  Repo,
  Setting,
  SettingKey,
  Deployment,
  CacheEntry,
  Draft,
  DraftInput,
  Priority,
  IssuePriority,
} from "./types.js";
```

- [ ] **Step 2: Add the new function exports**

Find the `export { ... } from "./db/settings.js";` block and add two new blocks after it (before the GitHub client exports):

```typescript
export {
  createDraft,
  listDrafts,
  getDraft,
  updateDraft,
  deleteDraft,
  assignDraftToRepo,
  type DraftUpdate,
  type AssignDraftResult,
} from "./db/drafts.js";
export {
  setPriority,
  getPriority,
  deletePriority,
  listPrioritiesForRepo,
} from "./db/priority.js";
```

- [ ] **Step 3: Run build to verify the package still builds cleanly**

Run: `pnpm -F @issuectl/core build`
Expected: Build succeeds with new exports in the generated `.d.ts`.

- [ ] **Step 4: Run typecheck on the full monorepo to catch any downstream issues**

Run: `pnpm turbo typecheck`
Expected: Zero errors across core, cli, and web.

- [ ] **Step 5: Run the full core test suite**

Run: `pnpm -F @issuectl/core test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export drafts and priority functions"
```

---

## Phase 2: Paper Design Tokens + Shared Primitives

Seven tasks. No test-first here — Phase 2 is pure visual work and the existing `packages/web/` has no component test convention. Primitives are validated in Phase 3 when screens compose them.

Before starting Phase 2, open `docs/mockups/paper-reskin.html` in a browser and scroll to Flow 01 and Flow 11 — they're the visual reference for the tokens and the `Chip` / `Button` / `Sheet` / `Drawer` primitives respectively.

---

### Task 2.1: Add Paper tokens to `globals.css` (additively)

**Files:**
- Modify: `packages/web/app/globals.css`

The current `globals.css` has a dual light/dark theme system with an orange accent that existing components (Sidebar, dashboard, everything else) depend on. Per the spec's Phase 2 guarantee — *"Paper design tokens + primitives can coexist with the old UI"* — we add Paper tokens additively under a `--paper-*` prefix instead of replacing. The old dashboard continues to work unchanged. Phase 8 cleanup will strip the prefix once the old tokens are gone.

- [ ] **Step 1: Open `packages/web/app/globals.css` and append the Paper block at the bottom of the `:root` selector**

Find the existing `:root { ... }` block in `globals.css`. Immediately **inside** the closing `}` of `:root`, append the following Paper tokens:

```css
  /* ═══ PAPER palette (2026-04-10 reskin) ═══════════════════════════
   * Additive — coexists with the legacy light/dark tokens above.
   * Used by components under packages/web/components/paper/.
   * Phase 8 cleanup will strip the --paper- prefix once the legacy
   * tokens are gone. */
  --paper-bg:           #f3ecd9;
  --paper-bg-warm:      #ede5cf;
  --paper-bg-warmer:    #e6dec4;
  --paper-ink:          #1a1712;
  --paper-ink-soft:     #3a342a;
  --paper-ink-muted:    #8a7f63;
  --paper-ink-faint:    #b5a88a;
  --paper-line:         #e0d6bc;
  --paper-line-soft:    #e9dfc6;
  --paper-accent:       #2d5f3f;
  --paper-accent-dim:   #4a7a5c;
  --paper-accent-soft:  #dce8de;
  --paper-brick:        #b84a2e;
  --paper-butter:       #d9a54d;

  --paper-radius-sm:    3px;
  --paper-radius-md:    6px;
  --paper-radius-lg:    10px;
  --paper-radius-xl:    14px;

  --paper-shadow-card:  0 12px 30px rgba(26, 23, 18, 0.08);
  --paper-shadow-modal: 0 40px 100px rgba(26, 23, 18, 0.35);

  /* Font families — these reference the next/font variables injected
   * in Task 2.2. Falls back to system fonts if next/font isn't wired yet. */
  --paper-serif:  var(--font-serif), Georgia, serif;
  --paper-sans:   var(--font-sans), system-ui, -apple-system, sans-serif;
  --paper-mono:   var(--font-mono), ui-monospace, SFMono-Regular, monospace;
```

Do NOT touch any existing token. Do NOT remove or modify `--bg-base`, `--text-primary`, `--accent` (orange), or any other existing token. Old components must continue to render correctly.

- [ ] **Step 2: At the very end of `globals.css` (after all existing rules), append the paper-surface utility class**

```css
/* ═══ Paper noise surface utility ═══════════════════════════
 * Apply class="paperSurface" (or composed via CSS Modules) to a
 * container to give it a subtle fractal-noise texture on a cream
 * background. Positions children above the noise layer. */
.paperSurface {
  position: relative;
  background: var(--paper-bg);
  color: var(--paper-ink);
}

.paperSurface::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.18;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.28'/></svg>");
  background-size: 200px;
}

.paperSurface > * {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 3: Start the dev server and verify nothing broke**

Run (separate terminal): `pnpm -F @issuectl/web dev`
Open `http://localhost:3847` in a browser.
Expected: The existing dashboard looks **identical to before**. The Paper tokens are present in the CSS but no component uses them yet, so there's no visible difference. If anything looks different, the additive change broke something — stop and investigate. Stop the dev server after verifying (Ctrl+C).

- [ ] **Step 4: Run typecheck and build**

Run: `pnpm turbo typecheck && pnpm -F @issuectl/web build`
Expected: Both pass cleanly.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/globals.css
git commit -m "feat(web): add Paper palette tokens (additive) and paperSurface utility"
```

---

### Task 2.2: Add Paper fonts via `next/font` (surgical swap in `layout.tsx`)

**Files:**
- Modify: `packages/web/app/layout.tsx`

The existing `layout.tsx` imports Karla, Syne, and Source Code Pro (for the old UI), and wraps children in `ThemeProvider`, `ToastProvider`, `Sidebar`, etc. Phase 2 is purely additive — we add the three Paper font imports (`Fraunces`, `Inter`, `IBM_Plex_Mono`) alongside the existing ones, expose their CSS variables on `<html>`, and leave everything else untouched. Old components continue to use Karla/Syne/Source Code Pro. New Paper primitives will reference the `--font-serif`, `--font-sans`, `--font-mono` CSS variables (which `globals.css` aliases to `--paper-serif`, `--paper-sans`, `--paper-mono`).

- [ ] **Step 1: Add the three Paper font imports at the top of `packages/web/app/layout.tsx`**

Find this import line in `layout.tsx`:

```typescript
import { Karla, Syne, Source_Code_Pro } from "next/font/google";
```

Replace it with:

```typescript
import {
  Karla,
  Syne,
  Source_Code_Pro,
  Fraunces,
  Inter,
  IBM_Plex_Mono,
} from "next/font/google";
```

- [ ] **Step 2: Add the three Paper font configurations below the existing ones**

Find this block near the top of `layout.tsx`:

```typescript
const karla = Karla({
  subsets: ["latin"],
  variable: "--font-karla",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-display",
});

const sourceCodePro = Source_Code_Pro({
  subsets: ["latin"],
  variable: "--font-mono",
});
```

**Carefully** insert the three Paper font configurations immediately after. Note: the existing `sourceCodePro` already uses variable `--font-mono`. To avoid collision, the Paper IBM Plex Mono will use variable `--font-mono-paper` and `globals.css` will be updated in Step 4 to reference it. Append this block after the `sourceCodePro` declaration:

```typescript
// Paper fonts (2026-04-10 reskin) — used by components under
// packages/web/components/paper/. Loaded alongside the legacy fonts so
// the old UI stays intact during Phase 2.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-paper",
  display: "swap",
});
```

- [ ] **Step 3: Add the three new font variable classes to the `<html>` element**

Find the `<html>` element inside `RootLayout`. It currently looks like this:

```typescript
<html lang="en" data-theme={theme === "system" ? undefined : theme} className={`${karla.variable} ${syne.variable} ${sourceCodePro.variable}`}>
```

Replace it with (appending the three new variable classes, preserving the existing ones):

```typescript
<html
  lang="en"
  data-theme={theme === "system" ? undefined : theme}
  className={`${karla.variable} ${syne.variable} ${sourceCodePro.variable} ${fraunces.variable} ${inter.variable} ${ibmPlexMono.variable}`}
>
```

Do NOT touch the `<head>`, `<body>`, `ThemeProvider`, `ToastProvider`, `Sidebar`, `AuthErrorScreen`, or the `THEME_SCRIPT`. Only the import block, font configs, and the `<html>` className attribute change.

- [ ] **Step 4: Update the Paper font variable references in `globals.css`**

In `packages/web/app/globals.css`, find the Paper font block added in Task 2.1:

```css
  --paper-serif:  var(--font-serif), Georgia, serif;
  --paper-sans:   var(--font-sans), system-ui, -apple-system, sans-serif;
  --paper-mono:   var(--font-mono), ui-monospace, SFMono-Regular, monospace;
```

The `--font-mono` reference collides with the legacy Source Code Pro mono variable (both configured to `--font-mono` in the original `layout.tsx`). Since the Paper IBM Plex Mono was configured to `--font-mono-paper` in Step 2 above, update the Paper mono alias to use the right variable:

```css
  --paper-serif:  var(--font-serif), Georgia, serif;
  --paper-sans:   var(--font-sans), system-ui, -apple-system, sans-serif;
  --paper-mono:   var(--font-mono-paper), ui-monospace, SFMono-Regular, monospace;
```

- [ ] **Step 5: Run typecheck and build**

Run: `pnpm turbo typecheck && pnpm -F @issuectl/web build`
Expected: Both pass cleanly.

- [ ] **Step 6: Start the dev server and verify the old UI still looks correct**

Run (separate terminal): `pnpm -F @issuectl/web dev`
Open `http://localhost:3847` in a browser.
Expected: The existing dashboard looks **identical to before** — Karla body text, Syne headers, Source Code Pro monospace. The Paper fonts are loaded (check the Network tab for `fraunces-*.woff2`, `inter-*.woff2`, `ibm-plex-mono-*.woff2` under `/_next/static/media/`) but no component uses them yet. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add packages/web/app/layout.tsx packages/web/app/globals.css
git commit -m "feat(web): load Fraunces, Inter, IBM Plex Mono alongside legacy fonts"
```

---

### Task 2.3: Create the `Chip` primitive

**Files:**
- Create: `packages/web/components/paper/Chip.tsx`
- Create: `packages/web/components/paper/Chip.module.css`

The `Chip` primitive represents a compact tag or label. Used for repo chips (`api`, `web`), labels (`bug`, `feat`), and status markers (`no repo`, `draft`, `open`). Three visual variants: `default` (warm beige), `dashed` (italic green dashed outline, used for "no repo"), and `tinted` (a colored background matching the variant color — used for labels).

- [ ] **Step 1: Create the CSS module**

Create `packages/web/components/paper/Chip.module.css`:

```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--paper-radius-sm);
  font-family: var(--paper-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.3px;
  white-space: nowrap;
  line-height: 1.4;
}

.default {
  background: var(--paper-bg-warmer);
  color: var(--paper-ink-soft);
}

.dashed {
  background: transparent;
  color: var(--paper-accent);
  border: 1px dashed var(--paper-accent);
  font-family: var(--paper-serif);
  font-style: italic;
  font-weight: 500;
  letter-spacing: 0;
}

.tinted {
  font-family: var(--paper-mono);
  font-weight: 600;
}

.tinted.brick {
  background: rgba(184, 74, 46, 0.08);
  color: var(--paper-brick);
}

.tinted.butter {
  background: rgba(217, 165, 77, 0.12);
  color: #9a6b1f; /* darker butter for readability on cream */
}

.tinted.accent {
  background: var(--paper-accent-soft);
  color: var(--paper-accent);
}
```

- [ ] **Step 2: Create the component**

Create `packages/web/components/paper/Chip.tsx`:

```typescript
import type { ReactNode } from "react";
import styles from "./Chip.module.css";

type ChipVariant = "default" | "dashed" | "tinted";
type ChipTint = "brick" | "butter" | "accent";

type Props = {
  children: ReactNode;
  variant?: ChipVariant;
  tint?: ChipTint; // only meaningful when variant === "tinted"
};

export function Chip({ children, variant = "default", tint }: Props) {
  const className =
    variant === "tinted" && tint
      ? `${styles.chip} ${styles.tinted} ${styles[tint]}`
      : `${styles.chip} ${styles[variant]}`;

  return <span className={className}>{children}</span>;
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm -F @issuectl/web typecheck`
Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/paper/Chip.tsx packages/web/components/paper/Chip.module.css
git commit -m "feat(web): add Chip primitive (default, dashed, tinted)"
```

---

### Task 2.4: Create the `Button` primitive (four variants)

**Files:**
- Create: `packages/web/components/paper/Button.tsx`
- Create: `packages/web/components/paper/Button.module.css`

Four variants: `primary` (ink background, cream text — neutral primary like "save"), `accent` (forest green — "launch", "apply"), `ghost` (transparent with border — "cancel"), `destructive` (brick red — "close issue"). Titles are italic serif, matching Paper's editorial voice.

- [ ] **Step 1: Create the CSS module**

Create `packages/web/components/paper/Button.module.css`:

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: var(--paper-radius-md);
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.1px;
  border: 1px solid transparent;
  transition: opacity 120ms ease, transform 120ms ease;
  white-space: nowrap;
}

.btn:hover:not(:disabled) {
  opacity: 0.92;
}

.btn:active:not(:disabled) {
  transform: translateY(1px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary {
  background: var(--paper-ink);
  color: var(--paper-bg);
}

.accent {
  background: var(--paper-accent);
  color: var(--paper-bg);
}

.ghost {
  background: transparent;
  color: var(--paper-ink-soft);
  border-color: var(--paper-line);
}

.ghost:hover:not(:disabled) {
  color: var(--paper-accent);
  border-color: var(--paper-accent);
  opacity: 1;
}

.destructive {
  background: var(--paper-brick);
  color: var(--paper-bg);
}

/* size variants */
.sm {
  padding: 7px 14px;
  font-size: 12.5px;
}

.md {
  /* default — already set on .btn */
}

.lg {
  padding: 13px 28px;
  font-size: 15px;
}

.fullWidth {
  width: 100%;
}
```

- [ ] **Step 2: Create the component**

Create `packages/web/components/paper/Button.tsx`:

```typescript
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "accent" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth,
  className,
  ...rest
}: Props) {
  const classes = [
    styles.btn,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm -F @issuectl/web typecheck`
Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/paper/Button.tsx packages/web/components/paper/Button.module.css
git commit -m "feat(web): add Button primitive (primary, accent, ghost, destructive)"
```

---

### Task 2.5: Create the `Sheet` primitive (bottom sheet)

**Files:**
- Create: `packages/web/components/paper/Sheet.tsx`
- Create: `packages/web/components/paper/Sheet.module.css`

The bottom sheet is used for the assign flow (Flow 01, second phone), the priority picker (Flow 12), and future "choose one of many" patterns. It renders a dimmed scrim covering the viewport + a warm paper card that slides up from the bottom.

For v1, no animation library — CSS transitions are fine.

- [ ] **Step 1: Create the CSS module**

Create `packages/web/components/paper/Sheet.module.css`:

```css
.scrim {
  position: fixed;
  inset: 0;
  background: rgba(26, 23, 18, 0.4);
  z-index: 1000;
}

.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--paper-bg);
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  border-top: 1px solid var(--paper-line);
  box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.25);
  padding: 12px 0 28px;
  z-index: 1001;
  max-height: 85vh;
  overflow-y: auto;
}

.grab {
  width: 44px;
  height: 4px;
  background: var(--paper-ink-faint);
  border-radius: 3px;
  margin: 0 auto 10px;
}

.head {
  padding: 10px 28px 14px;
}

.title {
  font-family: var(--paper-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.3px;
  color: var(--paper-ink);
  margin-bottom: 4px;
}

.description {
  font-family: var(--paper-serif);
  font-size: 13px;
  color: var(--paper-ink-muted);
}

.description em {
  color: var(--paper-ink-soft);
  font-style: italic;
}

.body {
  padding: 0;
}

/* Desktop adaptation — cap the width and center */
@media (min-width: 768px) {
  .sheet {
    left: 50%;
    right: auto;
    bottom: 40px;
    transform: translateX(-50%);
    width: 560px;
    max-width: calc(100vw - 64px);
    border-radius: 16px;
    border: 1px solid var(--paper-line);
  }
}
```

- [ ] **Step 2: Create the component**

Create `packages/web/components/paper/Sheet.tsx`:

```typescript
"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import styles from "./Sheet.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
};

export function Sheet({ open, onClose, title, description, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className={styles.scrim}
        onClick={onClose}
        role="presentation"
      />
      <div className={styles.sheet} role="dialog" aria-modal="true">
        <div className={styles.grab} />
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm -F @issuectl/web typecheck`
Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/paper/Sheet.tsx packages/web/components/paper/Sheet.module.css
git commit -m "feat(web): add Sheet primitive (bottom sheet with scrim)"
```

---

### Task 2.6: Create the `Drawer` primitive (right-side drawer)

**Files:**
- Create: `packages/web/components/paper/Drawer.tsx`
- Create: `packages/web/components/paper/Drawer.module.css`

Used for the mobile navigation drawer (Flow 12a). Slides in from the right, covering ~80% of the width with a dimmed scrim behind. Same scrim + Escape-to-close pattern as `Sheet`.

- [ ] **Step 1: Create the CSS module**

Create `packages/web/components/paper/Drawer.module.css`:

```css
.scrim {
  position: fixed;
  inset: 0;
  background: rgba(26, 23, 18, 0.5);
  z-index: 1000;
}

.drawer {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 300px;
  max-width: 85vw;
  background: var(--paper-bg);
  border-left: 1px solid var(--paper-line);
  box-shadow: -20px 0 60px rgba(0, 0, 0, 0.3);
  z-index: 1001;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.head {
  padding: 52px 22px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--paper-line);
  flex-shrink: 0;
}

.title {
  font-family: var(--paper-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.4px;
  color: var(--paper-ink);
}

.close {
  background: transparent;
  border: none;
  color: var(--paper-ink-muted);
  font-size: 22px;
  line-height: 1;
  padding: 4px 8px;
  cursor: pointer;
}

.body {
  flex: 1;
  padding: 0;
}
```

- [ ] **Step 2: Create the component**

Create `packages/web/components/paper/Drawer.tsx`:

```typescript
"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import styles from "./Drawer.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
};

export function Drawer({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className={styles.scrim} onClick={onClose} role="presentation" />
      <aside className={styles.drawer} role="dialog" aria-modal="true">
        <div className={styles.head}>
          <div className={styles.title}>{title}</div>
          <button
            className={styles.close}
            onClick={onClose}
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </aside>
    </>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm -F @issuectl/web typecheck`
Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/paper/Drawer.tsx packages/web/components/paper/Drawer.module.css
git commit -m "feat(web): add Drawer primitive (right-side with scrim)"
```

---

### Task 2.7: Create the `paper` barrel export + final verification

**Files:**
- Create: `packages/web/components/paper/index.ts`

- [ ] **Step 1: Create the barrel export**

Create `packages/web/components/paper/index.ts`:

```typescript
export { Chip } from "./Chip.js";
export { Button } from "./Button.js";
export { Sheet } from "./Sheet.js";
export { Drawer } from "./Drawer.js";
```

**Note:** the `.js` extensions are required for ESM even though the source files are `.ts` — Next.js / TypeScript handle this automatically in this project. Confirm by checking an existing barrel file like `packages/core/src/index.ts`.

- [ ] **Step 2: Run full monorepo typecheck**

Run: `pnpm turbo typecheck`
Expected: Zero errors across core, cli, web.

- [ ] **Step 3: Run the full build**

Run: `pnpm turbo build`
Expected: All packages build.

- [ ] **Step 4: Run lint across all packages**

Run: `pnpm turbo lint`
Expected: Zero errors.

- [ ] **Step 5: Run the core test suite one final time**

Run: `pnpm -F @issuectl/core test`
Expected: All 20+ new tests plus existing tests pass.

- [ ] **Step 6: Eyeball the dev server**

Run (separate terminal): `pnpm -F @issuectl/web dev`
Open `http://localhost:3847`.
Expected: The app loads on a warm cream background with the Paper fonts active. The existing dashboard's layout is broken (this is expected — Phase 3 will fix it) but nothing crashes. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add packages/web/components/paper/index.ts
git commit -m "feat(web): add paper primitives barrel export"
```

---

## Phase 1 + 2 complete — what's next

After all 19 tasks land, you have:

- A schema at version 5 with `drafts` and `issue_metadata` tables
- Fully tested draft CRUD: `createDraft`, `listDrafts`, `getDraft`, `updateDraft`, `deleteDraft`
- Fully tested priority CRUD: `setPriority`, `getPriority`, `deletePriority`, `listPrioritiesForRepo`
- The `assignDraftToRepo` workflow function that pushes to GitHub and carries priority over
- Paper palette + fonts in `globals.css` + `layout.tsx`
- Four primitives — `Chip`, `Button`, `Sheet`, `Drawer` — ready for Phase 3 screens
- Everything exported and accessible

The app will render on the new Paper background but the existing dashboard will look broken. That's expected and acceptable per the spec's single-user rollout decision.

**Follow-up plans will be written** for Phase 3 (main list) → Phase 4 (issue + PR detail) → Phase 5 (launch flow UI) → Phase 6 (settings + quick create) → Phase 7 (supplements) → Phase 8 (cleanup). Each phase gets its own plan document once the preceding phase lands so the plan reflects actual code state, not guesses.

---

## Self-Review Checklist

Before executing this plan, verify:

- [ ] **Spec coverage** — every line item from §"Data model changes" and §"Visual language" of the spec maps to a task here. Section-by-section:
  - Draft table → Task 1.2 ✓
  - issue_metadata table → Task 1.2 ✓
  - Draft CRUD → Tasks 1.3–1.7 ✓
  - Priority CRUD → Tasks 1.8–1.10 ✓
  - assignDraftToRepo workflow → Task 1.11 ✓
  - Package exports → Task 1.12 ✓
  - Color tokens → Task 2.1 ✓
  - Typography (Fraunces, Inter, IBM Plex Mono) → Task 2.2 ✓
  - Paper noise overlay → Task 2.1 (embedded in `body::before`) ✓
  - Chip primitive → Task 2.3 ✓
  - Button variants → Task 2.4 ✓
  - Sheet primitive → Task 2.5 ✓
  - Drawer primitive → Task 2.6 ✓

- [ ] **Placeholders** — no "TBD", "TODO", "fill in details" anywhere

- [ ] **Type consistency** — `Draft`, `DraftInput`, `DraftUpdate`, `Priority`, `IssuePriority` used consistently. `AssignDraftResult` defined and used.

- [ ] **Test conventions** — all Phase 1 tests use `createTestDb()` from `test-helpers.ts`, match the `describe`/`beforeEach` pattern in `settings.test.ts`

- [ ] **Commands** — every "Run:" line is an actual command that exists in this monorepo (`pnpm -F @issuectl/core test`, `pnpm -F @issuectl/web dev`, `pnpm turbo typecheck`, `pnpm turbo build`, `pnpm turbo lint`)

- [ ] **Phase 2 scope discipline** — no Phase 3 work leaks in. No routes created, no existing components deleted, no list/detail components built.

If any of the above fail, fix inline before starting execution.
