# Claude Extra Args Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `claude_aliases` feature with a single free-text `claude_extra_args` setting, validated at save time (shell-syntax errors block, unknown-flag warnings pass).

**Architecture:** A pure TypeScript validator in `packages/core` is shared between the client Settings form (live feedback) and the server action (enforcement). Launch reads the setting and appends it to `claude`. The `claude_aliases` table, code, and UI are fully removed; a new migration drops the table.

**Tech Stack:** TypeScript (strict ESM), `shell-quote` (tokenizer), Next.js App Router, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-04-10-claude-extra-args-design.md`

**Issue:** [#33](https://github.com/neonwatty/issuectl/issues/33)

---

## File structure

**Create:**
- `packages/core/src/launch/claude-args.ts` — `KNOWN_CLAUDE_FLAGS`, `validateClaudeArgs`, `ValidationResult`
- `packages/core/src/launch/claude-args.test.ts` — unit tests for the validator

**Modify:**
- `packages/core/package.json` — add `shell-quote` dependency
- `packages/core/src/types.ts` — add `claude_extra_args` to `SettingKey`; remove `ClaudeAlias` (later task)
- `packages/core/src/db/settings.ts` — add `claude_extra_args` to `DEFAULT_SETTINGS`
- `packages/core/src/db/schema.ts` — bump `SCHEMA_VERSION` to 4; remove `claude_aliases` CREATE TABLE
- `packages/core/src/db/schema.test.ts` — remove `claude_aliases` from expected tables; update version assertions
- `packages/core/src/db/migrations.ts` — add migration 4 (`DROP TABLE claude_aliases`)
- `packages/core/src/launch/launch.ts` — read `claude_extra_args` instead of default alias
- `packages/core/src/index.ts` — remove alias exports; add `validateClaudeArgs` export; remove `ClaudeAlias` type export
- `packages/web/lib/actions/settings.ts` — add `claude_extra_args`, `allowEmpty` set, validator call
- `packages/web/components/settings/SettingsForm.tsx` — new "Claude" section with live validation and dynamic save-button state
- `packages/web/components/settings/SettingsForm.module.css` — `fieldError`, `fieldWarning` styles
- `packages/web/app/settings/page.tsx` — pass `claudeExtraArgs` to `SettingsForm`; remove `ClaudeAliases` usage
- `packages/web/e2e/quick-create.spec.ts` — remove `claude_aliases` CREATE TABLE from seed

**Delete:**
- `packages/core/src/db/aliases.ts`
- `packages/core/src/db/aliases.test.ts`
- `packages/web/lib/actions/aliases.ts`
- `packages/web/components/settings/ClaudeAliases.tsx`
- `packages/web/components/settings/ClaudeAliases.module.css`

---

## Task 1: Add `shell-quote` dependency

**Files:**
- Modify: `packages/core/package.json`

- [ ] **Step 1: Add `shell-quote` runtime dep + `@types/shell-quote` dev dep**

In `packages/core/package.json`, update the `dependencies` and `devDependencies` blocks:

```json
"dependencies": {
  "@octokit/rest": "^22.0.0",
  "better-sqlite3": "^11.9.1",
  "shell-quote": "^1.8.1"
},
"devDependencies": {
  "@types/better-sqlite3": "^7.6.13",
  "@types/shell-quote": "^1.7.5"
}
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: resolves `shell-quote` and `@types/shell-quote` into the workspace lockfile with no errors.

- [ ] **Step 3: Verify core still builds**

Run: `pnpm --filter @issuectl/core typecheck`
Expected: PASS (no type errors; the dependency is installed but not yet used).

- [ ] **Step 4: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml
git commit -m "chore(core): add shell-quote dependency for arg validation"
```

---

## Task 2: Pure validator `validateClaudeArgs` (TDD)

**Files:**
- Create: `packages/core/src/launch/claude-args.test.ts`
- Create: `packages/core/src/launch/claude-args.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/launch/claude-args.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateClaudeArgs, KNOWN_CLAUDE_FLAGS } from "./claude-args.js";

describe("validateClaudeArgs", () => {
  it("accepts empty string", () => {
    const result = validateClaudeArgs("");
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("accepts whitespace-only as empty", () => {
    const result = validateClaudeArgs("   ");
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("accepts a single known flag", () => {
    const result = validateClaudeArgs("--dangerously-skip-permissions");
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("accepts a known flag with a value (value is not checked)", () => {
    const result = validateClaudeArgs("--model sonnet-4.5");
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("accepts multiple known flags", () => {
    const result = validateClaudeArgs("--verbose --model opus");
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("accepts a quoted value with spaces", () => {
    const result = validateClaudeArgs('--append-system-prompt "hello world"');
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("warns on unknown long flag", () => {
    const result = validateClaudeArgs("--foo");
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("--foo");
  });

  it("warns on typo of a known flag", () => {
    const result = validateClaudeArgs("--dangerousl-skip-permissions");
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("--dangerousl-skip-permissions");
  });

  it("warns on unknown short flag", () => {
    const result = validateClaudeArgs("-x");
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  it("rejects semicolon operator", () => {
    const result = validateClaudeArgs("--foo; rm -rf /");
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects && operator", () => {
    const result = validateClaudeArgs("--foo && --bar");
    expect(result.ok).toBe(false);
  });

  it("rejects pipe operator", () => {
    const result = validateClaudeArgs("--foo | grep x");
    expect(result.ok).toBe(false);
  });

  it("rejects redirect", () => {
    const result = validateClaudeArgs("--foo > out.txt");
    expect(result.ok).toBe(false);
  });

  it("rejects command substitution $()", () => {
    const result = validateClaudeArgs("$(evil)");
    expect(result.ok).toBe(false);
  });

  it("rejects backtick substitution", () => {
    const result = validateClaudeArgs("`evil`");
    expect(result.ok).toBe(false);
  });

  it("rejects unclosed double quote", () => {
    const result = validateClaudeArgs('--foo "unclosed');
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/quote|syntax/i);
  });

  it("rejects unclosed single quote", () => {
    const result = validateClaudeArgs("--foo 'unclosed");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/quote|syntax/i);
  });

  it("exposes KNOWN_CLAUDE_FLAGS containing --dangerously-skip-permissions", () => {
    expect(KNOWN_CLAUDE_FLAGS).toContain("--dangerously-skip-permissions");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/core test -- claude-args`
Expected: FAIL — cannot find `./claude-args.js`.

- [ ] **Step 3: Implement the validator**

Create `packages/core/src/launch/claude-args.ts`:

```ts
import { parse } from "shell-quote";

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

// Update by running `claude --help` and adding any new flags.
// Unknown flags produce a warning (not an error), so mild lag is tolerable.
export const KNOWN_CLAUDE_FLAGS: readonly string[] = [
  "--dangerously-skip-permissions",
  "--model",
  "--max-turns",
  "--print", "-p",
  "--verbose",
  "--debug",
  "--output-format",
  "--input-format",
  "--session-id",
  "--continue", "-c",
  "--resume", "-r",
  "--add-dir",
  "--allowed-tools",
  "--disallowed-tools",
  "--mcp-config",
  "--permission-mode",
  "--append-system-prompt",
  "--help", "-h",
  "--version",
];

const OPERATOR_ERROR =
  "Shell operators (; && || | > < `...` $(...)) are not allowed. Args are passed directly to claude.";

function hasUnmatchedQuote(s: string): boolean {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && !inSingle) {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    }
  }
  return inSingle || inDouble;
}

export function validateClaudeArgs(input: string): ValidationResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: true, errors: [], warnings: [] };
  }

  if (hasUnmatchedQuote(trimmed)) {
    return {
      ok: false,
      errors: ["Unclosed quote or invalid shell syntax."],
      warnings: [],
    };
  }

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(trimmed);
  } catch (err) {
    return {
      ok: false,
      errors: [
        `Invalid shell syntax: ${err instanceof Error ? err.message : String(err)}`,
      ],
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const knownSet = new Set<string>(KNOWN_CLAUDE_FLAGS);

  for (const entry of parsed) {
    if (typeof entry !== "string") {
      return { ok: false, errors: [OPERATOR_ERROR], warnings: [] };
    }
    if (entry.startsWith("-") && !knownSet.has(entry)) {
      warnings.push(`${entry} is not a recognized Claude flag.`);
    }
  }

  return { ok: true, errors: [], warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/core test -- claude-args`
Expected: PASS — all 18 tests pass.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @issuectl/core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/launch/claude-args.ts packages/core/src/launch/claude-args.test.ts
git commit -m "feat(core): add validateClaudeArgs with shell-parse + flag allowlist"
```

---

## Task 3: Add `claude_extra_args` setting and migration

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/db/settings.ts`
- Modify: `packages/core/src/db/schema.ts`
- Modify: `packages/core/src/db/schema.test.ts`
- Modify: `packages/core/src/db/migrations.ts`

- [ ] **Step 1: Add `claude_extra_args` to the `SettingKey` union**

In `packages/core/src/types.ts`, update the `SettingKey` type:

```ts
export type SettingKey =
  | "branch_pattern"
  | "terminal_app"
  | "terminal_window_title"
  | "terminal_tab_title_pattern"
  | "cache_ttl"
  | "worktree_dir"
  | "claude_extra_args";
```

Leave the `ClaudeAlias` type alone for now — it is removed in Task 7.

- [ ] **Step 2: Add default value for `claude_extra_args`**

In `packages/core/src/db/settings.ts`, update `DEFAULT_SETTINGS`:

```ts
const DEFAULT_SETTINGS: Setting[] = [
  { key: "branch_pattern", value: "issue-{number}-{slug}" },
  { key: "terminal_app", value: "iterm2" },
  { key: "terminal_window_title", value: "issuectl" },
  { key: "terminal_tab_title_pattern", value: "#{number} — {title}" },
  { key: "cache_ttl", value: "300" },
  { key: "worktree_dir", value: "~/.issuectl/worktrees/" },
  { key: "claude_extra_args", value: "" },
];
```

- [ ] **Step 3: Bump `SCHEMA_VERSION` and remove `claude_aliases` CREATE TABLE from fresh installs**

In `packages/core/src/db/schema.ts`:

```ts
const SCHEMA_VERSION = 4;
```

And remove the `claude_aliases` block from `CREATE_TABLES` so fresh installs never create the table. The remaining `CREATE_TABLES` should match:

```ts
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

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );
`;
```

- [ ] **Step 4: Add migration 4 to drop the `claude_aliases` table on existing DBs**

In `packages/core/src/db/migrations.ts`, append a new entry to the `migrations` array:

```ts
const migrations: Migration[] = [
  {
    version: 2,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS claude_aliases (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          command     TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL DEFAULT '',
          is_default  INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    version: 3,
    up(db) {
      db.exec(`ALTER TABLE deployments ADD COLUMN ended_at TEXT;`);
    },
  },
  {
    version: 4,
    up(db) {
      db.exec(`DROP TABLE IF EXISTS claude_aliases;`);
    },
  },
];
```

Leave the v2 migration intact — it describes history. The v4 migration drops what v2 created.

- [ ] **Step 5: Update schema tests**

In `packages/core/src/db/schema.test.ts`:

1. Remove `"claude_aliases"` from the expected table list:

```ts
expect(names).toEqual([
  "cache",
  "deployments",
  "repos",
  "schema_version",
  "settings",
]);
```

2. Update version assertions from `3` to `4`:

```ts
it("sets schema_version to 4", () => {
  initSchema(db);
  expect(getSchemaVersion(db)).toBe(4);
});

it("is idempotent — calling twice does not error or change version", () => {
  initSchema(db);
  initSchema(db);
  expect(getSchemaVersion(db)).toBe(4);
});
```

3. In the `runMigrations` describe block, update the "no migrations pending" test:

```ts
it("does nothing when no migrations are pending", () => {
  const db = createRawTestDb();
  initSchema(db);
  runMigrations(db);
  expect(getSchemaVersion(db)).toBe(4);
});
```

4. Update the "migrates v1 schema through v2 and v3" test — rename and adjust to verify migration 4 drops the table:

```ts
it("migrates v1 schema through v4 and drops claude_aliases", () => {
  const db = createRawTestDb();
  db.exec(`
    CREATE TABLE repos (id INTEGER PRIMARY KEY, owner TEXT, name TEXT);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE deployments (id INTEGER PRIMARY KEY, repo_id INTEGER, issue_number INTEGER, branch_name TEXT, workspace_mode TEXT, workspace_path TEXT);
    CREATE TABLE cache (key TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version (version) VALUES (1);
  `);

  runMigrations(db);

  expect(getSchemaVersion(db)).toBe(4);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'claude_aliases'")
    .all();
  expect(tables).toHaveLength(0);
});
```

5. Update the "migrates v2 schema to v3" test to assert a final version of `4` and add a claude_aliases existence check before migration, then absence after:

```ts
it("migrates v2 schema to v4 (adds ended_at, drops claude_aliases)", () => {
  const db = createRawTestDb();
  db.exec(`
    CREATE TABLE claude_aliases (id INTEGER PRIMARY KEY, command TEXT, description TEXT, is_default INTEGER, created_at TEXT);
    CREATE TABLE deployments (id INTEGER PRIMARY KEY, repo_id INTEGER, issue_number INTEGER, branch_name TEXT, workspace_mode TEXT, workspace_path TEXT, linked_pr_number INTEGER, launched_at TEXT);
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version (version) VALUES (2);
  `);

  runMigrations(db);

  expect(getSchemaVersion(db)).toBe(4);
  db.prepare("INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path, launched_at, ended_at) VALUES (1, 1, 'b', 'existing', '/x', '2025-01-01', NULL)").run();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'claude_aliases'")
    .all();
  expect(tables).toHaveLength(0);
});
```

- [ ] **Step 6: Run schema tests**

Run: `pnpm --filter @issuectl/core test -- schema`
Expected: PASS — all `initSchema`, `getSchemaVersion`, and `runMigrations` tests pass.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @issuectl/core typecheck`
Expected: PASS. The existing `db/aliases.ts` file and `ClaudeAlias` type still exist — they are removed in Task 7.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/db/settings.ts packages/core/src/db/schema.ts packages/core/src/db/schema.test.ts packages/core/src/db/migrations.ts
git commit -m "feat(core): add claude_extra_args setting; migrate drops claude_aliases"
```

---

## Task 4: Wire `launch.ts` to read `claude_extra_args`

**Files:**
- Modify: `packages/core/src/launch/launch.ts`

- [ ] **Step 1: Replace the alias lookup with the new setting**

In `packages/core/src/launch/launch.ts`:

1. Remove the import at line 16:

```ts
import { getDefaultAlias } from "../db/aliases.js";
```

2. Replace the launch block around lines 159-168:

```ts
  // 9. Open terminal
  const extraArgs = getSetting(db, "claude_extra_args")?.trim() ?? "";
  const claudeCommand = extraArgs ? `claude ${extraArgs}` : "claude";
  await launcher.launch({
    workspacePath: workspace.path,
    contextFilePath,
    issueNumber: options.issueNumber,
    issueTitle: detail.issue.title,
    owner: options.owner,
    repo: options.repo,
    claudeCommand,
  });
```

`getSetting` is already imported at the top of the file — no new import needed.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @issuectl/core typecheck`
Expected: PASS. `db/aliases.ts` still exists and is still exported, but nothing in core uses it.

- [ ] **Step 3: Run all core tests**

Run: `pnpm --filter @issuectl/core test`
Expected: PASS. The existing alias tests still run because `aliases.test.ts` hasn't been deleted yet.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/launch/launch.ts
git commit -m "feat(core): launch reads claude_extra_args instead of alias table"
```

---

## Task 5: Export `validateClaudeArgs` from core

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the validator export**

In `packages/core/src/index.ts`, add a new export block near the other launch exports (after the `getTerminalLauncher` export block that ends around line 112):

```ts
export {
  validateClaudeArgs,
  KNOWN_CLAUDE_FLAGS,
  type ValidationResult,
} from "./launch/claude-args.js";
```

Do NOT remove the alias exports in this task — they are removed in Task 7 as part of the deletion sweep, so anything that still imports them (like `packages/web/lib/actions/aliases.ts`) keeps typechecking until Task 7.

- [ ] **Step 2: Typecheck core**

Run: `pnpm --filter @issuectl/core typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export validateClaudeArgs + KNOWN_CLAUDE_FLAGS"
```

---

## Task 6: Server action — validate `claude_extra_args` and allow empty

**Files:**
- Modify: `packages/web/lib/actions/settings.ts`

- [ ] **Step 1: Update `updateSetting` to accept `claude_extra_args` and validate it**

Replace the contents of `packages/web/lib/actions/settings.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getDb, setSetting, validateClaudeArgs } from "@issuectl/core";
import type { SettingKey } from "@issuectl/core";

const VALID_KEYS = [
  "branch_pattern",
  "terminal_app",
  "terminal_window_title",
  "terminal_tab_title_pattern",
  "cache_ttl",
  "worktree_dir",
  "claude_extra_args",
] as const satisfies readonly SettingKey[];

const ALLOW_EMPTY = new Set<SettingKey>(["claude_extra_args"]);

export async function updateSetting(
  key: SettingKey,
  value: string,
): Promise<{ success: boolean; error?: string }> {
  if (!VALID_KEYS.includes(key)) {
    return { success: false, error: "Invalid setting key" };
  }

  const trimmed = value.trim();
  if (trimmed === "" && !ALLOW_EMPTY.has(key)) {
    return { success: false, error: "Value cannot be empty" };
  }

  if (key === "cache_ttl") {
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      return { success: false, error: "Cache TTL must be a non-negative number" };
    }
  }

  if (key === "claude_extra_args") {
    const result = validateClaudeArgs(trimmed);
    if (!result.ok) {
      return { success: false, error: result.errors.join(" ") };
    }
  }

  try {
    const db = getDb();
    setSetting(db, key, trimmed);
  } catch (err) {
    console.error("[issuectl] Failed to update setting:", err);
    return { success: false, error: "Failed to update setting" };
  }
  try {
    revalidatePath("/settings");
  } catch (err) {
    console.warn("[issuectl] Cache revalidation failed (setting saved):", err);
  }
  return { success: true };
}
```

- [ ] **Step 2: Typecheck web**

Run: `pnpm --filter @issuectl/web typecheck`
Expected: PASS. `validateClaudeArgs` is now exported from `@issuectl/core` (Task 5).

- [ ] **Step 3: Commit**

```bash
git add packages/web/lib/actions/settings.ts
git commit -m "feat(web): validate claude_extra_args in updateSetting; allow empty"
```

---

## Task 7: Delete the alias feature (core + web)

**Files:**
- Delete: `packages/core/src/db/aliases.ts`
- Delete: `packages/core/src/db/aliases.test.ts`
- Delete: `packages/web/lib/actions/aliases.ts`
- Delete: `packages/web/components/settings/ClaudeAliases.tsx`
- Delete: `packages/web/components/settings/ClaudeAliases.module.css`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/web/app/settings/page.tsx`

- [ ] **Step 1: Delete the core alias files**

```bash
rm packages/core/src/db/aliases.ts packages/core/src/db/aliases.test.ts
```

- [ ] **Step 2: Remove the `ClaudeAlias` type from `packages/core/src/types.ts`**

Delete lines 18-24 (the `ClaudeAlias` type definition):

```ts
// DELETE:
export type ClaudeAlias = {
  id: number;
  command: string;
  description: string;
  isDefault: boolean;
  createdAt: string;
};
```

- [ ] **Step 3: Delete the web alias action**

```bash
rm packages/web/lib/actions/aliases.ts
```

- [ ] **Step 4: Delete the `ClaudeAliases` component and its CSS**

```bash
rm packages/web/components/settings/ClaudeAliases.tsx packages/web/components/settings/ClaudeAliases.module.css
```

- [ ] **Step 5: Remove alias exports from `packages/core/src/index.ts`**

In `packages/core/src/index.ts`:

1. Drop `ClaudeAlias` from the first-line type re-export:

```ts
export type { Repo, Setting, SettingKey, Deployment, CacheEntry } from "./types.js";
```

2. Delete the alias export block (around lines 36-43):

```ts
// DELETE THIS BLOCK:
export {
  listAliases,
  getDefaultAlias,
  addAlias,
  removeAlias,
  setDefaultAlias,
  clearDefaultAlias,
} from "./db/aliases.js";
```

Leave the `validateClaudeArgs` export (added in Task 5) intact.

- [ ] **Step 6: Remove `ClaudeAliases` references from the settings page**

In `packages/web/app/settings/page.tsx`:

1. Update the import from `@issuectl/core` — drop `listAliases`:

```ts
import {
  getDb,
  dbExists,
  listRepos,
  getSettings,
} from "@issuectl/core";
```

2. Drop the `ClaudeAliases` component import:

```ts
// DELETE:
import { ClaudeAliases } from "@/components/settings/ClaudeAliases";
```

3. Delete the `aliases` loading block (approx lines 37-42):

```ts
// DELETE:
let aliases: Awaited<ReturnType<typeof listAliases>> = [];
try {
  aliases = listAliases(db);
} catch (err) {
  console.error("[issuectl] Failed to load aliases:", err);
}
```

4. Delete the `<section>` that renders `<ClaudeAliases>` (approx lines 78-81):

```tsx
// DELETE:
<section className={styles.section}>
  <div className={styles.sectionTitle}>Claude Aliases</div>
  <ClaudeAliases aliases={aliases} />
</section>
```

- [ ] **Step 7: Typecheck core and web**

Run: `pnpm turbo typecheck`
Expected: PASS — no dangling references to `ClaudeAlias`, `listAliases`, or `ClaudeAliases`.

- [ ] **Step 8: Run all core tests**

Run: `pnpm --filter @issuectl/core test`
Expected: PASS — `aliases.test.ts` is gone, all other tests pass.

- [ ] **Step 9: Commit**

```bash
git add -u packages/core/src/db/aliases.ts packages/core/src/db/aliases.test.ts \
         packages/core/src/types.ts \
         packages/core/src/index.ts \
         packages/web/lib/actions/aliases.ts \
         packages/web/components/settings/ClaudeAliases.tsx \
         packages/web/components/settings/ClaudeAliases.module.css \
         packages/web/app/settings/page.tsx
git commit -m "refactor: remove claude_aliases feature (replaced by claude_extra_args)"
```

Note: `git add -u` stages deletions alongside the modifications to `types.ts`, `index.ts`, and `settings/page.tsx`.

---

## Task 8: SettingsForm — "Claude" section with live validation

**Files:**
- Modify: `packages/web/components/settings/SettingsForm.tsx`
- Modify: `packages/web/components/settings/SettingsForm.module.css`
- Modify: `packages/web/app/settings/page.tsx`

- [ ] **Step 1: Add CSS classes for field-level error and warning states**

In `packages/web/components/settings/SettingsForm.module.css`, append to the bottom:

```css
.fieldError {
  font-size: 12px;
  color: var(--red);
  margin-top: 6px;
}

.fieldWarning {
  font-size: 12px;
  color: #d4a017;
  margin-top: 6px;
}
```

- [ ] **Step 2: Pass `claudeExtraArgs` from the settings page to the form**

In `packages/web/app/settings/page.tsx`, after the existing `settingMap` destructuring, add:

```ts
const claudeExtraArgs = settingMap.claude_extra_args ?? "";
```

Then update the `<SettingsForm>` invocation:

```tsx
<SettingsForm
  branchPattern={branchPattern}
  cacheTTL={cacheTTL}
  terminalApp={terminalApp}
  windowTitle={windowTitle}
  tabTitlePattern={tabTitlePattern}
  claudeExtraArgs={claudeExtraArgs}
/>
```

- [ ] **Step 3: Update `SettingsForm` to accept `claudeExtraArgs`, render the new section, and validate live**

Replace the full contents of `packages/web/components/settings/SettingsForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { updateSetting } from "@/lib/actions/settings";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import { validateClaudeArgs, type SettingKey } from "@issuectl/core";
import styles from "./SettingsForm.module.css";

type Props = {
  branchPattern: string;
  cacheTTL: string;
  terminalApp: string;
  windowTitle: string;
  tabTitlePattern: string;
  claudeExtraArgs: string;
};

type FormValues = {
  branch_pattern: string;
  cache_ttl: string;
  terminal_window_title: string;
  terminal_tab_title_pattern: string;
  claude_extra_args: string;
};

export function SettingsForm({
  branchPattern,
  cacheTTL,
  terminalApp,
  windowTitle,
  tabTitlePattern,
  claudeExtraArgs,
}: Props) {
  const [values, setValues] = useState<FormValues>({
    branch_pattern: branchPattern,
    cache_ttl: cacheTTL,
    terminal_window_title: windowTitle,
    terminal_tab_title_pattern: tabTitlePattern,
    claude_extra_args: claudeExtraArgs,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  const originals: FormValues = {
    branch_pattern: branchPattern,
    cache_ttl: cacheTTL,
    terminal_window_title: windowTitle,
    terminal_tab_title_pattern: tabTitlePattern,
    claude_extra_args: claudeExtraArgs,
  };

  const isDirty = (Object.keys(originals) as (keyof FormValues)[]).some(
    (k) => values[k] !== originals[k],
  );

  const extraArgsValidation = validateClaudeArgs(values.claude_extra_args);
  const hasBlockingError = !extraArgsValidation.ok;
  const hasWarnings = extraArgsValidation.warnings.length > 0;

  function handleChange(key: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const changed = (Object.keys(originals) as (keyof FormValues)[]).filter(
        (k) => values[k] !== originals[k],
      );
      for (const key of changed) {
        const result = await updateSetting(key as SettingKey, values[key]);
        if (!result.success) {
          setError(result.error ?? `Failed to save ${key}`);
          return;
        }
      }
      showToast("Settings saved", "success");
    });
  }

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Defaults</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.label}>Branch Pattern</div>
            <input
              className={styles.input}
              value={values.branch_pattern}
              onChange={(e) => handleChange("branch_pattern", e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Cache TTL (seconds)</div>
            <input
              className={styles.input}
              value={values.cache_ttl}
              onChange={(e) => handleChange("cache_ttl", e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Terminal</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.label}>Application</div>
            <input
              className={styles.inputReadonly}
              value={terminalApp}
              readOnly
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Window Title</div>
            <input
              className={styles.input}
              value={values.terminal_window_title}
              onChange={(e) => handleChange("terminal_window_title", e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.label}>Tab Title Pattern</div>
            <input
              className={styles.input}
              value={values.terminal_tab_title_pattern}
              onChange={(e) => handleChange("terminal_tab_title_pattern", e.target.value)}
              disabled={isPending}
            />
            <div className={styles.help}>
              Placeholders: {"{number}"}, {"{title}"}, {"{repo}"}, {"{owner}"}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Claude</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.label}>Extra Args</div>
            <input
              className={styles.input}
              value={values.claude_extra_args}
              onChange={(e) => handleChange("claude_extra_args", e.target.value)}
              disabled={isPending}
              placeholder="--dangerously-skip-permissions"
            />
            <div className={styles.help}>
              Passed verbatim after <code>claude</code> at launch. Leave empty for defaults.
            </div>
            {extraArgsValidation.errors.length > 0 && (
              <div className={styles.fieldError} role="alert">
                {extraArgsValidation.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            {extraArgsValidation.errors.length === 0 &&
              extraArgsValidation.warnings.length > 0 && (
                <div className={styles.fieldWarning}>
                  {extraArgsValidation.warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </section>

      <div className={styles.saveRow}>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={isPending || !isDirty || hasBlockingError}
        >
          {isPending
            ? "Saving..."
            : hasWarnings
              ? "Save with warnings"
              : "Save Settings"}
        </Button>
        {error && <span className={styles.error} role="alert">{error}</span>}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Typecheck web**

Run: `pnpm --filter @issuectl/web typecheck`
Expected: PASS.

- [ ] **Step 5: Sanity-check the dev server**

Run: `pnpm turbo dev` in one terminal, then manually visit `http://localhost:3847/settings` and verify:
  - The new "Claude" section with an "Extra Args" input appears
  - Entering `--foo` shows a yellow warning and the Save button label changes to "Save with warnings"
  - Entering `--foo;rm` shows a red error and Save is disabled
  - Entering `--dangerously-skip-permissions` shows no message and the Save button is enabled
  - Clearing the field (empty) shows no message and Save is enabled

Stop the dev server after verifying.

- [ ] **Step 6: Commit**

```bash
git add packages/web/components/settings/SettingsForm.tsx packages/web/components/settings/SettingsForm.module.css packages/web/app/settings/page.tsx
git commit -m "feat(web): add Claude Extra Args field with live validation"
```

---

## Task 9: Update the E2E seed to remove `claude_aliases`

**Files:**
- Modify: `packages/web/e2e/quick-create.spec.ts`

- [ ] **Step 1: Remove the `claude_aliases` CREATE TABLE from the seed**

In `packages/web/e2e/quick-create.spec.ts`, delete lines 71-77 (the `claude_aliases` CREATE TABLE block):

```sql
-- DELETE:
CREATE TABLE IF NOT EXISTS claude_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Also update the schema version insert on line 80 from `3` to `4`:

```ts
db.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (?)").run(4);
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @issuectl/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/quick-create.spec.ts
git commit -m "test(web): drop claude_aliases from e2e seed; bump schema_version"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS across `@issuectl/core`, `@issuectl/cli`, `@issuectl/web`.

- [ ] **Step 2: Full test run**

Run: `pnpm turbo test`
Expected: PASS. All core unit tests pass; the alias test file no longer exists.

- [ ] **Step 3: Full build**

Run: `pnpm turbo build`
Expected: PASS — `core`, `cli`, and `web` all build.

- [ ] **Step 4: `/simplify` on the diff**

Invoke the `simplify` skill on the recent changes. Address any simplifications it flags.

- [ ] **Step 5: `/pr-review-toolkit:review-pr`**

Run a comprehensive PR review on the branch before handing back to the user.

- [ ] **Step 6: Report to user**

Summarize what landed, confirm acceptance criteria from the spec are met, and suggest next steps (merge, open PR, etc.).
