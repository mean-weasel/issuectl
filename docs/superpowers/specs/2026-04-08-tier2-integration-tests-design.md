# Tier 2 Integration Tests — Design Spec

**Date:** 2026-04-08
**Status:** Approved
**Companion:** `plans/2026-04-08-pluggable-terminal-launcher.md` (Tier 2 section)

---

## Overview

Integration tests for the AppleScript-based Ghostty terminal launcher. These tests exercise the real `osascript` side-effect layer — window creation, tab grouping, tab title setting, and window title matching — against a running Ghostty instance on macOS.

Also includes a fix to `verify()` so it can find Ghostty at the `.app` bundle path when the binary isn't on PATH.

### Goals

1. Verify the AppleScript-based launcher creates windows and tabs correctly
2. Verify tab titles are set according to the configured pattern
3. Verify window title matching (same title = add tab, different title = new window)
4. Fix `verify()` to resolve Ghostty binary from `/Applications/Ghostty.app/Contents/MacOS/ghostty`

### Non-Goals

- Command execution verification (the `write` AppleScript command either works or throws — no silent failure mode, and `buildShellCommand()` is unit-tested)
- CI execution (macOS runners are expensive; local-only for now)
- Testing other terminal launchers (only Ghostty)

---

## Test Infrastructure

### Vitest Config

A separate Vitest project config at `packages/core/vitest.integration.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 15000,
  },
});
```

The 15-second timeout accounts for AppleScript execution delays (window creation, `delay 0.5` in the script, tab setup).

### Scripts

`packages/core/package.json` adds:

```json
"test:integration": "vitest run -c vitest.integration.config.ts"
```

`turbo.json` adds a `test:integration` task (depends on `^build`, same as `test`). This is NOT included in the default `test` pipeline — it must be run explicitly via `pnpm turbo test:integration`.

### File Location

```
packages/core/src/launch/terminals/ghostty.integration.test.ts
```

Lives next to the unit test file (`ghostty.test.ts`) per project convention.

---

## Skip Conditions

Tests detect their environment in `beforeAll` and skip the entire suite when any condition fails:

1. **Not macOS** — `process.platform !== "darwin"`
2. **Ghostty not installed** — cannot find binary at PATH or `/Applications/Ghostty.app/Contents/MacOS/ghostty`
3. **Ghostty < 1.3** — version check fails minimum requirement
4. **Ghostty not running** — `pgrep -x Ghostty` returns no results

The skip uses Vitest's `describe.skipIf()` or a manual `beforeAll` check that calls `test.skip()` with a descriptive message.

---

## Test Isolation

Each test run generates a unique window title in `beforeAll`:

```typescript
const testWindowTitle = `issuectl-test-${crypto.randomUUID().slice(0, 8)}`;
```

This prevents collisions with:
- Real issuectl usage
- Parallel test runs
- Stale windows from previous failed runs

---

## Teardown

### `afterEach`

Closes any Ghostty windows matching the test window title:

```applescript
tell application "Ghostty"
  repeat with w in (reverse of (windows as list))
    if name of w is "{testWindowTitle}" then close w
  end repeat
end tell
```

The `reverse` iteration prevents index-shifting when closing windows mid-loop.

### `afterAll`

Runs the same cleanup as a safety net in case `afterEach` was bypassed by a crash.

### Delay

A short delay (`delay 0.3`) after window operations allows Ghostty to settle before the next test queries state. Without this, queries may return stale state.

---

## AppleScript Query Helpers

Helper functions in the test file (not exported — test-only):

| Helper | AppleScript | Returns |
|--------|-------------|---------|
| `getWindowNames()` | `tell application "Ghostty" to get name of every window` | `string[]` |
| `getTabCount(windowTitle)` | Find window by name, `get count of tabs` | `number` |
| `getTabTitle(windowTitle)` | Find window by name, `get title of focused terminal` | `string` |
| `closeTestWindows(title)` | Find and close windows by name | `void` |

All helpers use `execFileAsync("osascript", ["-e", script])` and parse the AppleScript output.

---

## Test Cases

### 1. Window creation

**Setup:** No test windows exist (guaranteed by teardown).

**Action:** Call `launcher.launch()` with the test window title.

**Verify:** `getWindowNames()` includes the test window title. The window count increased by 1.

### 2. Tab grouping

**Setup:** No test windows exist.

**Action:** Call `launcher.launch()` twice with the same window title.

**Verify:** `getWindowNames()` contains the test title exactly once (not twice). `getTabCount(testWindowTitle)` returns 2.

### 3. Tab title

**Setup:** No test windows exist.

**Action:** Call `launcher.launch()` with known issue data: issue #99, title "Test tab title", owner "test-org", repo "test-repo". Tab title pattern: `"#{number} — {title}"`.

**Verify:** `getTabTitle(testWindowTitle)` contains `"#99"` and `"Test tab title"`.

### 4. Window title matching (different titles = separate windows)

**Setup:** No test windows exist.

**Action:** Call `launcher.launch()` with window title `"{testWindowTitle}-A"`, then again with `"{testWindowTitle}-B"`.

**Verify:** Both window titles appear in `getWindowNames()`. Two distinct windows exist.

**Teardown:** This test's `afterEach` must close both `-A` and `-B` windows.

### 5. Cleanup verification

**Action:** Run teardown (`closeTestWindows(testWindowTitle)`).

**Verify:** `getWindowNames()` does not contain the test window title.

This test validates that the teardown mechanism itself works — if it fails, all other test results are suspect.

---

## `verify()` Fix

### Problem

`verify()` calls `execFileAsync("ghostty", ["--version"])` which requires `ghostty` to be on PATH. On macOS, Ghostty installed as a `.app` bundle places the binary at `/Applications/Ghostty.app/Contents/MacOS/ghostty`, which is often not on PATH.

### Solution

Add a `resolveGhosttyBinary()` helper function (pure, testable):

```typescript
export async function resolveGhosttyBinary(): Promise<string> {
  // Try PATH first
  try {
    await execFileAsync("which", ["ghostty"]);
    return "ghostty";
  } catch {
    // Fall through
  }

  // Try macOS .app bundle
  const appBinary = "/Applications/Ghostty.app/Contents/MacOS/ghostty";
  try {
    await execFileAsync(appBinary, ["--version"]);
    return appBinary;
  } catch {
    throw new Error(
      "Ghostty terminal is not installed. Install from https://ghostty.org"
    );
  }
}
```

`verify()` calls `resolveGhosttyBinary()` to get the path, then uses it for the version check. The resolved path doesn't need to be stored — `verify()` is called once before launch, and `launch()` uses AppleScript (`tell application "Ghostty"`) which doesn't need the binary path.

### Testing

`resolveGhosttyBinary()` calls `execFileAsync` (a side effect), so it can't be unit-tested without mocking. Since the logic is a simple two-step fallback, we test it in the integration tests where a real Ghostty install is available. No mocking needed.

---

## File Summary

| File | Action |
|------|--------|
| `packages/core/vitest.integration.config.ts` | Create |
| `packages/core/src/launch/terminals/ghostty.integration.test.ts` | Create |
| `packages/core/src/launch/terminals/ghostty.ts` | Modify (add `resolveGhosttyBinary`, update `verify()`) |
| `packages/core/package.json` | Modify (add `test:integration` script) |
| `turbo.json` | Modify (add `test:integration` task) |
