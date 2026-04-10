# Claude Extra Args Setting — Design

**Date:** 2026-04-10
**Issue:** [#33](https://github.com/neonwatty/issuectl/issues/33) — Add common settings as addendums to the standard Claude command
**Status:** Approved, ready for implementation plan

## Problem

Today, users who want to launch Claude with non-default options (e.g. `--dangerously-skip-permissions`) must define a shell alias and configure it through the `claude_aliases` table. Two problems with that design:

1. **Shell alias loading is unreliable under `open -na`.** When Ghostty is launched via `open`, interactive shell aliases don't always resolve in time — we saw the `yolo` alias fail even though Ghostty itself started correctly. Aliases are a poor mechanism for surfacing flags.
2. **Aliases are the wrong abstraction.** A user doesn't want a new command name. They want to pass a handful of flags to `claude` directly. The alias table makes that a four-field CRUD operation (command, description, default, etc.) when it could be a single free-text field in settings.

## Goal

Replace the `claude_aliases` feature with a single settings field where the user can enter additional command-line arguments to append after `claude` at launch time. Validate the input at save time so misconfigurations are caught in Settings instead of at launch.

## Non-goals

- Validating flag *values* (`--model sonnet-4.5` is not checked against a known model list). Only flag *names* are validated.
- Running `claude --help` at runtime to discover flags. We use a hand-maintained allowlist.
- Ground-truth validation via dry-run (`claude <args> --help`). Deferred; the allowlist + shell parser catches the common mistakes.
- Per-repo or per-issue overrides. One global setting.
- Migrating existing `claude_aliases` rows to the new setting. The feature is brand new and the v1 release has not shipped; we delete the table outright.

## Architecture

### New setting

Add `claude_extra_args` to the `SettingKey` union in `packages/core/src/types.ts` and to `DEFAULT_SETTINGS` in `packages/core/src/db/settings.ts`. Default value: `""` (empty string).

Empty is a valid value and means "no extra args, just `claude`". The existing `updateSetting` server action rejects empty values for all keys; we add a per-key `allowEmpty` flag (only `claude_extra_args` opts in) rather than a blanket change.

### Pure validation function

New file `packages/core/src/launch/claude-args.ts` exports:

```ts
export type ValidationResult = {
  ok: boolean;          // true when errors is empty (warnings are allowed)
  errors: string[];     // blocking issues
  warnings: string[];   // non-blocking (unknown flags)
};

export const KNOWN_CLAUDE_FLAGS: readonly string[];
export function validateClaudeArgs(input: string): ValidationResult;
```

Pure TypeScript — no Node APIs — so the function is importable from both the Server Action (Node) and the Client Component (browser bundle).

### Validation algorithm

`validateClaudeArgs(input)` runs three passes on the trimmed input:

1. **Empty check.** Empty input → `{ ok: true, errors: [], warnings: [] }`.

2. **Tokenize.** Call `shell-quote`'s `parse()`. It returns a mixed array of string tokens and operator objects (`{ op: ";" }`, `{ op: "&&" }`, `{ op: "|" }`, etc.). If it throws (e.g., unclosed quote), return `{ ok: false, errors: ["Unclosed quote or invalid shell syntax"], warnings: [] }`.

3. **Operator check.** Any operator object in the parsed result → error: `` `Shell operators like ; && | > are not allowed here. Args are passed directly to claude.` ``. `$(...)` and backtick substitutions are rejected the same way — `shell-quote` surfaces them as non-string entries in the parsed array, and anything that is not a plain string token counts as "not a plain arg".

4. **Flag allowlist check.** For each word token that starts with `-` or `--`, check membership in `KNOWN_CLAUDE_FLAGS`. Unknowns → warning: `` `--foo is not a recognized Claude flag. Save anyway?` ``. Tokens that do not start with `-` are treated as flag values and skipped.

### Known flags list

Seeded from `claude --help` at implementation time. Starter list:

```ts
export const KNOWN_CLAUDE_FLAGS = [
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
] as const;
```

With a source comment pointing to `claude --help` so future updates are obvious. Lag is tolerable because unknown flags produce warnings, not errors.

### UI — two validation surfaces

**Live (client-side).** In `packages/web/components/settings/SettingsForm.tsx`, add a "Claude" section with a single text input labelled "Extra args", help text `e.g., --dangerously-skip-permissions (passed verbatim after claude)`. Validate on every keystroke by calling `validateClaudeArgs`:

- Empty input → no inline message, no visual state.
- Errors → red inline message listing each error. The Save button is disabled while *any* field has blocking errors. (Field-granular save is out of scope; the whole form blocks.)
- Warnings only → yellow inline message listing each warning. The Save button label becomes "Save with warnings" but remains enabled.

**Server (`updateSetting` server action).** In `packages/web/lib/actions/settings.ts`, when `key === "claude_extra_args"`, run the same `validateClaudeArgs` function. Errors return `{ success: false, error }`. Warnings are allowed through — the client already surfaced them and the user chose to proceed. Empty string is permitted via the `allowEmpty` per-key flag.

### Launch-time integration

In `packages/core/src/launch/launch.ts`, replace the `getDefaultAlias` lookup with:

```ts
const extraArgs = getSetting(db, "claude_extra_args")?.trim() ?? "";
const claudeCommand = extraArgs ? `claude ${extraArgs}` : "claude";
```

Pass `claudeCommand` to the existing terminal launcher (no launcher interface changes). We do **not** re-validate at launch time — if invalid args somehow got into the DB (e.g., direct sqlite edit), Claude's own parser will surface the error.

### Alias feature deletion

Full removal — not deprecation. These artifacts are deleted:

- `packages/core/src/db/aliases.ts`
- `packages/core/src/db/aliases.test.ts`
- `packages/core/src/types.ts` — the `ClaudeAlias` type
- `packages/core/src/index.ts` — the alias exports
- `packages/web/lib/actions/aliases.ts`
- `packages/web/components/settings/ClaudeAliases.tsx` + `ClaudeAliases.module.css`
- `packages/web/app/settings/page.tsx` — the `<ClaudeAliases>` section
- `packages/core/src/db/schema.ts` — the `claude_aliases` CREATE TABLE from the initial schema
- `packages/core/src/db/schema.test.ts` — assertions on `claude_aliases`
- `packages/web/e2e/quick-create.spec.ts` — the `claude_aliases` CREATE TABLE in the seed

A new migration (version 4) runs `DROP TABLE IF EXISTS claude_aliases`.

## Data flow

```
User types in Extra Args input
       │
       ▼
validateClaudeArgs(input)   ◄── pure, no I/O
       │
       ▼
Inline error/warning UI + Save button state
       │
       ▼ (user clicks Save)
updateSetting("claude_extra_args", value)   ◄── server action
       │
       ▼
validateClaudeArgs(value)   ◄── same function, re-run
       │
       ├─ errors    → return { success: false, error }
       └─ no errors → setSetting(db, "claude_extra_args", value)
                              │
                              ▼
                      revalidatePath("/settings")
```

At launch:

```
executeLaunch(db, octokit, options)
       │
       ▼
getSetting(db, "claude_extra_args")  →  "--dangerously-skip-permissions"
       │
       ▼
claudeCommand = "claude --dangerously-skip-permissions"
       │
       ▼
launcher.launch({ ..., claudeCommand })
       │
       ▼
shell: cd <path> && cat <context> | claude --dangerously-skip-permissions
```

## Error handling

- **Invalid shell syntax at save time** → server action returns a clear error; form shows it under the field.
- **Unknown flag at save time** → server action allows save; the yellow warning already shown client-side is the only signal.
- **Validation function import failure** → caught by the existing try/catch in `updateSetting`; generic error message. This is a deploy-time bug, not a user-facing scenario.
- **Missing setting at launch** → `getSetting` returns `undefined`, we fall back to `"claude"`. No error path.
- **`shell-quote` throws an unexpected exception** → the validator catches, returns `{ ok: false, errors: ["Invalid shell syntax"] }`. Defense in depth beyond unclosed quotes.

## Testing

Unit tests in `packages/core/src/launch/claude-args.test.ts`:

| Input | Expected |
|---|---|
| `""` | ok, no errors, no warnings |
| `"--dangerously-skip-permissions"` | ok |
| `"--model sonnet-4.5"` | ok (value token skipped) |
| `"--verbose --model opus"` | ok |
| `"--foo"` | warning, no error |
| `"--dangerousl-skip-permissions"` | warning (typo) |
| `"--foo; rm -rf /"` | error (operator) |
| `"--foo \"unclosed"` | error (parse) |
| `"$(evil)"` | error (operator) |
| `"--foo \`bad\`"` | error (operator) |
| `"--foo && --bar"` | error (operator) |
| `"--foo | grep x"` | error (operator) |
| `"--foo > out.txt"` | error (operator) |

Optional `launch.ts` test: verify the constructed `claudeCommand` matches `"claude"` when the setting is empty and `"claude --foo"` when it is `--foo`.

No new tests required for `SettingsForm` — existing E2E coverage of the settings page is sufficient. The `claude_aliases` CREATE TABLE in `packages/web/e2e/quick-create.spec.ts`'s seed is removed (the migration handles production DBs).

## Dependencies

- **`shell-quote`** (~14KB, MIT). Added to `packages/core`'s `package.json`. Battle-tested; handles tokenization and operator identification out of the box. Alternative was a hand-rolled tokenizer, rejected for maintenance cost.

## Migration

New migration file or entry in `packages/core/src/db/migrations.ts`:

```ts
{
  version: 4,
  up(db) {
    db.exec(`DROP TABLE IF EXISTS claude_aliases;`);
  },
}
```

And `SCHEMA_VERSION` in `packages/core/src/db/schema.ts` bumps from 3 to 4. The initial `CREATE_TABLES` block is updated to *not* create `claude_aliases` — fresh installs never have the table.

## Out of scope (possible follow-ups)

- **Test-launch button** — a "Test" button in Settings that actually runs `claude <args> --help` and reports the exit code. Ground-truth validation, but adds subprocess side effects and complicates the Settings page. Deferred.
- **Flag-value validation** — e.g., checking that `--model` takes a known model name. Would require a separate map of flag → value type. Deferred.
- **Auto-refreshing `KNOWN_CLAUDE_FLAGS`** — parsing `claude --help` on `issuectl init` and caching in the DB. Deferred unless the hand-maintained list proves painful.

## Acceptance criteria

- [ ] `claude_aliases` table, code, tests, and UI are fully removed.
- [ ] Migration 4 drops `claude_aliases` on existing databases.
- [ ] New `claude_extra_args` setting exists, defaults to `""`, empty is valid.
- [ ] `validateClaudeArgs` exists in core with full unit test coverage for the cases above.
- [ ] Settings page has a "Claude" section with a single "Extra args" input, live validation, and inline error/warning UI.
- [ ] Save button disables on errors, relabels to "Save with warnings" on warnings, normal otherwise.
- [ ] Server action re-validates and rejects only on errors.
- [ ] Launch builds `claude <args>` (or just `claude` when empty) and passes it to the terminal launcher unchanged.
- [ ] `pnpm turbo typecheck` passes.
- [ ] Existing tests (`schema.test.ts`, `quick-create.spec.ts`) updated and passing.
