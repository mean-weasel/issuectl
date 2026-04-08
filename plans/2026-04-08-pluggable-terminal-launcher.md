# Pluggable Terminal Launcher

**Date:** 2026-04-08
**Status:** Draft
**Companion docs:** `2026-04-06-issuectl-design.md`, `2026-04-06-implementation-plan.md`

---

## Overview

Replace the hard-coded Ghostty launcher with a pluggable terminal abstraction. The system supports multiple terminal backends (starting with Ghostty on macOS via AppleScript), exposes terminal settings in the web dashboard, and groups issuectl sessions into a single identifiable window with tabs.

### Goals

1. **Pluggable architecture** — a `TerminalLauncher` interface with swappable implementations
2. **Session grouping** — all issuectl launches open as tabs in one dedicated terminal window, not scattered windows
3. **Identifiable windows** — user-configurable window and tab titles so issuectl sessions are easy to find
4. **User-configurable** — terminal settings editable from the web dashboard
5. **Ghostty-first** — ship a robust Ghostty launcher using AppleScript (requires 1.3+)

### Non-Goals

- Rectangle or other window manager integration (future)
- Per-window color/theme customization (Ghostty doesn't support this; track [ghostty-org/ghostty#10181](https://github.com/ghostty-org/ghostty/discussions/10181))
- iTerm2 / Terminal.app / Kitty implementations (future — the interface is ready, implementations come later)
- tmux integration (future)

---

## Architecture

### Interface

```typescript
// packages/core/src/launch/terminal.ts

export interface TerminalLauncher {
  /** Human-readable name (e.g., "Ghostty") */
  readonly name: string;

  /** Verify the terminal is installed and meets version requirements */
  verify(): Promise<void>;

  /** Launch a session — opens a tab in the existing issuectl window, or creates the window first */
  launch(options: TerminalLaunchOptions): Promise<void>;
}

export interface TerminalLaunchOptions {
  workspacePath: string;
  contextFilePath: string;
  issueNumber: number;
  issueTitle: string;
  owner: string;
  repo: string;
}

export interface TerminalSettings {
  terminal: string;            // "ghostty" (extensible: "iterm2", "terminal", etc.)
  windowTitle: string;         // title for the dedicated issuectl window
  tabTitlePattern: string;     // pattern for each tab: "#{number} — {title}"
}
```

### File Layout

```
packages/core/src/launch/
├── terminal.ts              # Interface + getTerminalLauncher() factory
├── terminals/
│   └── ghostty.ts           # GhosttyLauncher (AppleScript-based)
├── launch.ts                # Orchestrator — calls launcher.launch() at step 9
├── workspace.ts             # Unchanged
├── context.ts               # Unchanged
└── branch.ts                # Unchanged
```

The existing `packages/core/src/launch/ghostty.ts` moves to `packages/core/src/launch/terminals/ghostty.ts` and is rewritten to implement `TerminalLauncher`.

### Factory

```typescript
// packages/core/src/launch/terminal.ts

export function getTerminalLauncher(settings: TerminalSettings): TerminalLauncher {
  switch (settings.terminal) {
    case "ghostty":
      return new GhosttyLauncher(settings);
    default:
      throw new Error(`Unsupported terminal: ${settings.terminal}`);
  }
}
```

Future terminals register here. Each implementation lives in its own file under `terminals/`.

---

## Ghostty Implementation

### Requirements

- **Ghostty 1.3+** — required for AppleScript support
- **macOS only** — AppleScript is macOS-specific; Linux/Windows Ghostty support is out of scope for now

### AppleScript Strategy

The Ghostty AppleScript API (documented at [ghostty.org/docs/features/applescript](https://ghostty.org/docs/features/applescript)) exposes the object hierarchy: Application > Windows > Tabs > Terminals.

**Launch flow:**

1. **Check for existing issuectl window** — query Ghostty windows for one whose name matches `windowTitle` (the user-configured setting)
2. **If found** — create a new tab in that window, set the tab title from `tabTitlePattern`
3. **If not found** — create a new window, set its title to `windowTitle`, then the tab title from `tabTitlePattern`
4. **Execute command** — in the new tab's terminal, run: `cd {workspacePath} && cat {contextFilePath} | claude`

### AppleScript Interaction

Use `osascript` via `execFile` to run AppleScript commands. All AppleScript is executed as inline scripts (no `.scpt` files).

**Find or create the issuectl window:**

```applescript
tell application "Ghostty"
  -- Look for an existing issuectl window by name
  set issuectlWindow to missing value
  repeat with w in windows
    if name of w is "{windowTitle}" then
      set issuectlWindow to w
      exit repeat
    end if
  end repeat

  if issuectlWindow is missing value then
    -- No existing window — create one
    set issuectlWindow to (new window)
    -- The new window's first tab runs the command
  else
    -- Existing window found — add a tab
    tell issuectlWindow to new tab
  end if
end tell
```

**Set tab title and execute command:**

After creating the tab, use Ghostty's `set_tab_title` and `set_surface_title` actions, and send the shell command as key input to the terminal.

```applescript
tell application "Ghostty"
  tell front window
    set focusedTerminal to focused terminal
    tell focusedTerminal
      -- Set the tab title
      execute action "set_tab_title:{tabTitle}"

      -- Send the command
      write "cd {workspacePath} && cat {contextFilePath} | claude" & return
    end tell
  end tell
end tell
```

### Tab Title Pattern

The `tabTitlePattern` setting supports these placeholders:

| Placeholder | Expansion | Example |
|---|---|---|
| `{number}` | Issue number | `42` |
| `{title}` | Issue title (truncated to 30 chars) | `Fix auth middleware` |
| `{repo}` | Repository name | `seatify` |
| `{owner}` | Repository owner | `mean-weasel` |

**Default pattern:** `"#{number} — {title}"`
**Example result:** `"#42 — Fix auth middleware"`

### Verification

`verify()` checks:
1. Ghostty is installed (`which ghostty`)
2. Ghostty version is 1.3+ (parse `ghostty --version` output)
3. Platform is macOS (`process.platform === "darwin"`)

If any check fails, throw a descriptive error telling the user what to fix.

### Limitations & Known Constraints

- **No per-window themes** — Ghostty does not support per-window color customization. All windows share the user's global Ghostty theme. This is a known Ghostty limitation ([discussion #10181](https://github.com/ghostty-org/ghostty/discussions/10181)).
- **AppleScript API is "preview"** — Ghostty marks the scripting API as preview in 1.3. The core operations (new window, new tab, write text) are stable, but the API may evolve.
- **Window title matching** — relies on the user not manually renaming the issuectl window. If they do, the next launch creates a new window. This is acceptable.
- **Ghostty must be running** — if Ghostty is not open, AppleScript's `tell application "Ghostty"` will launch it, which is the desired behavior.

---

## Settings Changes

### New Settings

| Key | Default | Description |
|---|---|---|
| `terminal_window_title` | `"issuectl"` | Title of the dedicated terminal window |
| `terminal_tab_title_pattern` | `"#{number} — {title}"` | Pattern for tab names (see placeholders above) |

### Modified Settings

| Key | Change |
|---|---|
| `terminal_app` | Remains `"ghostty"`. In the future, the dropdown expands to include other terminals. |
| `terminal_mode` | **Removed.** The new architecture always uses tab-in-group behavior. The launcher decides whether to create a window (first launch) or tab (subsequent). The old "window" vs "tab" toggle is no longer needed. |

### SettingKey Type Update

```typescript
// packages/core/src/types.ts
export type SettingKey =
  | "branch_pattern"
  | "terminal_app"
  | "terminal_window_title"
  | "terminal_tab_title_pattern"
  | "cache_ttl"
  | "worktree_dir";
```

`terminal_mode` is removed from the union.

### DB Migration

- Add `terminal_window_title` and `terminal_tab_title_pattern` to `DEFAULT_SETTINGS`
- Remove `terminal_mode` from `DEFAULT_SETTINGS`
- No schema change needed (settings table is key-value)
- `seedDefaults` handles new keys automatically (inserts if not present)
- Old `terminal_mode` rows in existing databases are harmless (ignored)

### Settings Validation

The `updateSetting` server action adds the new keys to `VALID_KEYS` and removes `terminal_mode`.

---

## Web Dashboard Changes

### Settings Page — Terminal Section

The current terminal section shows:
- **Application** — read-only text input showing "ghostty"
- **Mode** — toggle buttons for "Window" / "Tab"

Replace with:

- **Application** — read-only text input showing "Ghostty" (future: dropdown)
- **Window Title** — text input, blur-to-save, default `"issuectl"`
- **Tab Title Pattern** — text input, blur-to-save, default `"#{number} — {title}"`, with help text showing available placeholders

The "Mode" toggle is removed since the launcher handles window-vs-tab automatically.

### Component Changes

**`TerminalSettings.tsx`** — rewrite to show the new fields:

```
┌─────────────────────────────────────────────────┐
│ Terminal                                        │
│                                                 │
│ Application       Window Title                  │
│ ┌───────────┐     ┌─────────────────────┐       │
│ │ Ghostty   │     │ issuectl            │       │
│ └───────────┘     └─────────────────────┘       │
│                                                 │
│ Tab Title Pattern                               │
│ ┌───────────────────────────────────────┐       │
│ │ #{number} — {title}                   │       │
│ └───────────────────────────────────────┘       │
│ Placeholders: {number}, {title}, {repo}, {owner}│
│                                                 │
│                                        Saved ✓  │
└─────────────────────────────────────────────────┘
```

### Props Change

The settings page passes the new values to `TerminalSettings`:

```typescript
<TerminalSettings
  terminalApp={terminalApp}
  windowTitle={windowTitle}
  tabTitlePattern={tabTitlePattern}
/>
```

---

## Launch Flow Changes

### `launch.ts` Modifications

**Before (current):**
```typescript
import { openGhosttyWindow, openGhosttyTab, verifyGhosttyInstalled } from "./ghostty.js";

// Step 0
await verifyGhosttyInstalled();

// Step 9
if (options.terminalMode === "tab") {
  openGhosttyTab(workspace.path, contextFilePath);
} else {
  openGhosttyWindow(workspace.path, contextFilePath);
}
```

**After:**
```typescript
import { getTerminalLauncher, type TerminalSettings } from "./terminal.js";

// Step 0 — build settings from DB, create launcher, verify
const terminalSettings: TerminalSettings = {
  terminal: getSetting(db, "terminal_app") ?? "ghostty",
  windowTitle: getSetting(db, "terminal_window_title") ?? "issuectl",
  tabTitlePattern: getSetting(db, "terminal_tab_title_pattern") ?? "#{number} — {title}",
};
const launcher = getTerminalLauncher(terminalSettings);
await launcher.verify();

// Step 9 — launch
await launcher.launch({
  workspacePath: workspace.path,
  contextFilePath,
  issueNumber: options.issueNumber,
  issueTitle: detail.issue.title,
  owner: options.owner,
  repo: options.repo,
});
```

### `LaunchOptions` Change

Remove `terminalMode` from `LaunchOptions` — the launcher handles this internally.

```typescript
export interface LaunchOptions {
  owner: string;
  repo: string;
  issueNumber: number;
  branchName: string;
  workspaceMode: WorkspaceMode;
  selectedComments: number[];
  selectedFiles: string[];
  preamble?: string;
  // terminalMode removed — launcher decides window vs tab
}
```

### Web Launch Action

The `launchIssue` server action no longer needs to pass `terminalMode`. Remove it from the action's input type and from the `LaunchModal` component.

---

## LaunchModal Changes

Remove the `terminal_mode` concept from the launch modal. Currently `LaunchModal` doesn't expose terminal mode (it's in settings only), so the modal itself needs no UI changes. The only code change is removing `terminalMode` from the payload sent to the server action.

---

## Testing

Three tiers of testing, each covering different layers of the system.

### Tier 1: Unit Tests (fast, no Ghostty required, runs everywhere)

Pure-function tests with no side effects or external dependencies.

**`terminal.test.ts`** — factory and interface:
- `getTerminalLauncher("ghostty")` returns a `GhosttyLauncher`
- `getTerminalLauncher("unknown")` throws with descriptive error
- Settings are passed through to the launcher correctly

**`ghostty.test.ts`** — all extracted pure functions:

*Tab title pattern expansion:*
- All placeholders: `{number}`, `{title}`, `{repo}`, `{owner}`
- Title truncation at 30 characters
- Combined placeholders: `"#{number} — {title} ({repo})"`
- Missing/unknown placeholders left as-is
- Edge cases: empty title, title with special characters (quotes, ampersands, backslashes)

*AppleScript generation:*
- Produces correct script for "create new window" case
- Produces correct script for "add tab to existing window" case
- Proper escaping of user-controlled strings (window title, tab title, paths with spaces/quotes)
- Shell command embedded in AppleScript is correctly quoted

*Shell command assembly:*
- Paths with spaces are escaped
- Paths with single quotes are escaped
- Normal paths produce clean commands

*Version parsing:*
- `"1.3.1 (abcdef)"` → `{ major: 1, minor: 3, patch: 1 }`
- `"1.3.0"` → `{ major: 1, minor: 3, patch: 0 }`
- Garbage input throws
- Version comparison: `1.3.0` meets `>=1.3`, `1.2.3` does not

**Settings tests** — verify new setting keys work with `getSetting`/`setSetting`, verify `seedDefaults` includes new keys and no longer includes `terminal_mode`.

### Tier 2: Integration Tests (requires Ghostty 1.3+, local only)

Real AppleScript tests that launch Ghostty, verify state, and clean up. These run locally on macOS with Ghostty installed — **not in CI** (macOS runners are expensive; we can add CI later if needed).

**Setup:** Tests are in a separate Vitest project config (e.g., `vitest.integration.config.ts`) and run via `pnpm test:integration`. Each test uses a unique window title (e.g., `"issuectl-test-{randomId}"`) to avoid collisions with real usage.

**Teardown:** Every test closes any Ghostty windows it created via AppleScript in an `afterEach` block:
```applescript
tell application "Ghostty"
  repeat with w in windows
    if name of w is "{testWindowTitle}" then close w
  end repeat
end tell
```

**Skip condition:** Tests detect environment and skip gracefully:
- Not macOS → skip with message
- Ghostty not installed → skip with message
- Ghostty < 1.3 → skip with message

**Test cases:**

*Window creation:*
- Launch with no existing issuectl window → verify a new Ghostty window exists with the configured title (query via `tell application "Ghostty" to get name of every window`)
- Verify the window count increased by 1

*Tab grouping:*
- Launch once (creates window), launch again → verify the window now has 2 tabs (query via `tell application "Ghostty" to get count of tabs of front window`)
- Tab titles match the configured pattern

*Window title matching:*
- Launch with window title "issuectl-test-A" → verify it creates a window
- Launch again with same title → verify no new window, tab added to existing
- Launch with different title "issuectl-test-B" → verify a second window is created

*Command execution:*
- Launch with a simple test command (e.g., `echo "hello"` instead of `claude`) → verify the terminal received input (check via AppleScript `get name of focused terminal`)

*Cleanup resilience:*
- After test teardown, verify no test windows remain open

### Tier 3: Manual Testing

Full end-to-end launch flow with real workspace prep and `claude` invocation. Not automatable because it depends on the full issuectl web app, GitHub state, and interactive `claude` session.

**Checklist:**
- Launch with no existing issuectl window → new Ghostty window appears with correct title
- Launch again → new tab appears in same window, tab title shows issue info
- Launch for different repo → tab title shows correct repo/issue
- Close issuectl window, launch again → new window created
- Change `windowTitle` in settings → next launch creates a window with the new title
- Change `tabTitlePattern` in settings → next launch shows updated tab title
- Ghostty not installed → clear error message
- Ghostty < 1.3 → clear error message about upgrading

### Design Principle: Thin Side-Effect Layer

To maximize Tier 1 coverage, the `GhosttyLauncher` class should be a **thin wrapper** over pure, testable functions:

```
buildShellCommand()          ← unit-tested
expandTabTitle()             ← unit-tested
buildGhosttyAppleScript()    ← unit-tested
parseGhosttyVersion()        ← unit-tested
─────────────────────────────────────
execFileAsync("osascript")   ← integration-tested
```

The untestable surface area is a single `execFileAsync` call. Everything above it is pure logic with deterministic inputs and outputs.

---

## Implementation Phases

### Phase A: Core Terminal Abstraction

1. Create `packages/core/src/launch/terminal.ts` — interface + factory
2. Create `packages/core/src/launch/terminals/ghostty.ts` — `GhosttyLauncher` implementation with extracted pure functions
3. Delete old `packages/core/src/launch/ghostty.ts`
4. Update `packages/core/src/launch/launch.ts` — use `getTerminalLauncher()`
5. Update `LaunchOptions` — remove `terminalMode`
6. Update exports in `packages/core/src/index.ts`

### Phase B: Settings

1. Update `SettingKey` type — add new keys, remove `terminal_mode`
2. Update `DEFAULT_SETTINGS` in `settings.ts` — add new defaults, remove `terminal_mode`
3. Update `VALID_KEYS` in `packages/web/lib/actions/settings.ts`
4. Update `packages/web/components/settings/TerminalSettings.tsx` — new UI
5. Update `packages/web/app/settings/page.tsx` — pass new props

### Phase C: Launch Flow Cleanup

1. Update `packages/web/lib/actions/launch.ts` — remove `terminalMode` from input
2. Update `packages/web/components/launch/LaunchModal.tsx` — remove `terminalMode` from payload
3. Typecheck everything

### Phase D: Testing

1. Add unit tests for terminal factory, tab title expansion, AppleScript generation, version parsing
2. Add integration test config (`vitest.integration.config.ts`) and `pnpm test:integration` script
3. Write integration tests for window creation, tab grouping, window title matching
4. Run existing test suite to verify no regressions
5. Manual testing of full launch flow

---

## Test Fixture Repo

Integration tests that exercise the full launch flow (workspace prep, branch creation, issue fetching, label application) need a real GitHub repo. Personal repos must never be used for automated tests.

### Repo: [`mean-weasel/issuectl-test-repo`](https://github.com/mean-weasel/issuectl-test-repo)

Created specifically for issuectl testing. Contains:

**Source files** (for file-reference detection tests):
- `src/auth/middleware.ts`
- `src/auth/session.ts`
- `src/config.ts`

**Seed issues:**

| # | Title | Purpose |
|---|---|---|
| 1 | Add user authentication | Standard issue with body, file references (`src/auth/middleware.ts`, `src/auth/session.ts`, `src/config.ts`), and 2 comments |
| 2 | Fix database connection pooling | Bug report with steps to reproduce, no comments |
| 3 | Edge case: empty body issue | Empty body edge case |

### Usage in Tests

**Unit tests** — don't need this repo. They use in-memory SQLite and mock data.

**Ghostty integration tests (Tier 2)** — don't need this repo either. They test terminal window/tab behavior with dummy commands.

**Launch flow integration tests (future Tier 2 expansion)** — will use this repo for:
- `prepareWorkspace()` with clone mode → clones `mean-weasel/issuectl-test-repo`
- `getIssueDetail()` → fetches real issue #1 with comments and file references
- Label application → applies/removes `issuectl:deployed` on test issues
- Branch creation → creates and cleans up test branches
- Deployment recording → records against this repo in test DB

**Cleanup:** Tests that create branches or labels must clean up in `afterEach`/`afterAll`. Issue state (open/closed) should be restored if modified.

### Adding New Test Fixtures

When new test scenarios are needed, add issues/files to this repo and document them in the table above. Keep the repo minimal — it exists purely as a test harness.

---

## Future Work

- **iTerm2 launcher** — use AppleScript/Python API, support custom profiles with distinct colors and badges
- **Terminal.app launcher** — basic AppleScript support
- **Kitty launcher** — use `kitten @` remote control protocol
- **Per-window themes** — when Ghostty adds per-window theme support, update the Ghostty launcher to set a distinct theme for the issuectl window
- **Rectangle integration** — optional `terminal_rectangle_action` setting to auto-position the issuectl window after launch
- **Terminal auto-detection** — detect installed terminals and suggest the best option during `issuectl init`
