# E2E Launch Flow Test — Design Spec

**Date:** 2026-04-08
**Status:** Approved

---

## Overview

A Playwright e2e test that exercises the full launch flow against the `mean-weasel/issuectl-test-repo` test fixture. The test navigates the web dashboard, opens the launch modal for issue #1, submits the launch, and verifies the deployment page appears and a Ghostty process was spawned.

### Goals

1. Verify the full user flow: issue page → launch modal → launch → deployment page
2. Verify the Ghostty CLI launcher actually spawns a process
3. Run from Claude Code / CI (no AppleScript, no macOS Automation permissions)

### Non-Goals

- Verify Ghostty window is visible (sandbox limitation)
- Verify `claude` command executes (would hang waiting for input)
- Test GitHub label application (non-fatal side effect, tested elsewhere)

---

## Prerequisites

Tests skip gracefully when any of these fail:

1. `process.platform !== "darwin"` — not macOS
2. Ghostty not installed (binary not found at PATH or `/Applications/Ghostty.app/Contents/MacOS/ghostty`)
3. `gh auth token` fails — no GitHub API access

---

## Test Infrastructure

### DB Path Override

Add `ISSUECTL_DB_PATH` env var support to `packages/core/src/db/connection.ts`. When set, `getDbPath()` returns the env var value instead of the default `~/.issuectl/issuectl.db`. This lets the test use an isolated temp DB without touching the user's real data.

```typescript
export function getDbPath(): string {
  return process.env.ISSUECTL_DB_PATH ?? join(ISSUECTL_DIR, DB_FILENAME);
}
```

Also update `dbExists()` and `getDb()` to use `getDbPath()` (they already do).

The `ISSUECTL_DIR` for `mkdirSync` should use `dirname(getDbPath())` instead of the hardcoded `ISSUECTL_DIR` when the env var is set.

### Test DB Seeding

The test's `beforeAll`:

1. Creates a temp directory with a fresh SQLite DB
2. Initializes schema via `initSchema()`
3. Seeds default settings via `seedDefaults()`
4. Adds `mean-weasel/issuectl-test-repo` via `addRepo()` (no `localPath` — forces clone mode)
5. Sets `ISSUECTL_DB_PATH` env var
6. Starts the Next.js dev server on port 3847

### Teardown

The test's `afterAll`:

1. Stops the Next.js dev server
2. Kills any Ghostty processes spawned during the test
3. Deletes the temp DB directory
4. Cleans up any cloned workspace directories in the worktree dir

### File Structure

```
packages/web/
├── playwright.config.ts
├── e2e/
│   └── launch-flow.spec.ts
├── package.json  (add @playwright/test, test:e2e script)
```

Add `test:e2e` task to `turbo.json`.

---

## Test Flow

### Test: "full launch flow from issue page to deployment"

1. **Navigate** to `http://localhost:3847/mean-weasel/issuectl-test-repo/issues/1`
2. **Verify** the issue page loaded — check for issue title "Add user authentication"
3. **Click** the "Launch to Claude Code" button
4. **Verify** the launch modal opened — check for modal content (branch input, workspace selector)
5. **Select** "Clone" workspace mode (since no local path is configured)
6. **Record** the Ghostty process count (`pgrep -ix ghostty`)
7. **Click** the "Launch" button in the modal
8. **Wait** for navigation to the launch progress page (`/launch?deploymentId=`)
9. **Verify** the launch page shows deployment info (branch name visible)
10. **Verify** the Ghostty process count increased

### Test: "issue page shows issue details from test repo"

A simpler smoke test:

1. **Navigate** to `http://localhost:3847/mean-weasel/issuectl-test-repo/issues/1`
2. **Verify** issue title "Add user authentication" is visible
3. **Verify** referenced files are shown (src/auth/middleware.ts, etc.)
4. **Verify** comments section shows 2 comments

---

## Playwright Configuration

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3847",
  },
  webServer: undefined, // Server started manually in test setup for env var control
});
```

The web server is NOT started by Playwright's `webServer` config because we need to pass the `ISSUECTL_DB_PATH` env var. Instead, the test starts it in `beforeAll` using `spawn("npx", ["next", "dev", "-p", "3847"])` with the env var set.

---

## Files Changed

| File | Action | What |
|------|--------|------|
| `packages/core/src/db/connection.ts` | Modify | Add `ISSUECTL_DB_PATH` env var support |
| `packages/web/playwright.config.ts` | Create | Playwright config |
| `packages/web/e2e/launch-flow.spec.ts` | Create | E2E test |
| `packages/web/package.json` | Modify | Add `@playwright/test`, `test:e2e` script |
| `turbo.json` | Modify | Add `test:e2e` task |
