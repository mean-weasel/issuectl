# Dirty Worktree Recovery on Launch

**Issue:** #207 — Add option to clean dirty worktree on launch  
**Date:** 2026-04-23

## Problem

When launching an issue with workspace mode "worktree" (or "clone"), if the worktree directory already has uncommitted changes from a previous session, the user gets a hard error with no recovery path from the dashboard. They must manually `rm -rf` the worktree directory or commit/stash changes via the command line before relaunching.

## Approach

**Pre-flight warning banner.** When the launch modal opens in worktree mode, check the worktree status before the user clicks Launch. If the worktree exists and has uncommitted changes, show a warning banner with two recovery options:

- **Discard & Start Fresh** — removes the dirty worktree and allows a clean relaunch
- **Resume with Changes** — reuses the worktree as-is, keeping the uncommitted changes

This avoids the wasted launch-fail-retry cycle of a post-error approach.

## Architecture

### Core (packages/core)

**New function: `checkWorktreeStatus(repoPath, repo, issueNumber)`**
- Checks if a worktree directory exists for this issue at `~/.issuectl/worktrees/{repo}-issue-{issueNumber}`
- If it exists, checks whether it's a valid git repo and whether the working tree is clean
- Returns `{ exists: boolean; dirty: boolean; path: string }`

**New function: `resetWorktree(worktreePath)`**
- Removes the dirty worktree directory (`rm -rf`)
- Runs `git worktree prune` on the parent repo to clean up stale worktree references

**Modified: `prepareWorktree()` accepts optional `forceResume: boolean`**
- If `forceResume` is true, skips the dirty-worktree check and reuses the worktree as-is (the "Resume with Changes" path)
- The "Discard" path doesn't need a flag — `resetWorktree` is called separately before a normal launch

### Server Actions (packages/web/lib/actions/)

**New action: `checkWorktreeStatus(owner, repo, issueNumber)`**
- Called when the launch modal opens in worktree mode
- Validates inputs, calls core function, returns the status

**New action: `resetWorktree(owner, repo, issueNumber)`**
- Called when user clicks "Discard & Start Fresh"
- Validates inputs, calls core function, returns success/error

**Modified: `launchIssue` accepts optional `forceResume: boolean`**
- If true, passes through to `executeLaunch` which passes to `prepareWorktree` to skip the dirty-worktree check

### UI (LaunchModal)

**Pre-flight check:** On modal open (and when workspace mode changes to "worktree"), call `checkWorktreeStatus`. If dirty, show the warning banner.

**Banner placement:** Between the issue summary and the branch input — first thing the user sees after the issue context.

**Banner disappears** after either action completes (with a brief loading state on the clicked button).

## UI Design

### Warning Banner

Uses existing Paper design tokens:
- **Background:** `--paper-butter` at 10% opacity
- **Border:** `--paper-butter` at 35% opacity
- **Destructive button:** `--paper-brick` background (Discard & Start Fresh)
- **Safe button:** `--paper-accent` background (Resume with Changes)

### Desktop (≥768px)

- Banner sits inside the 620px modal body
- Two buttons side-by-side with equal flex
- Standard padding and border-radius matching existing modal sections

### Mobile (<768px)

- Banner fills the bottom-sheet width
- Buttons stack vertically, full-width
- Min-height 44px per button for touch targets
- Shorter copy: "Uncommitted changes from previous session"

## Data Flow

### Happy path (no dirty worktree)

1. Modal opens → `checkWorktreeStatus` → `{ exists: false, dirty: false }` → no banner → normal launch

### Discard path

1. Modal opens → `checkWorktreeStatus` → `{ exists: true, dirty: true }` → banner appears
2. User clicks "Discard & Start Fresh" → button shows spinner → `resetWorktree` runs
3. Success → banner disappears → user clicks Launch normally
4. Failure → banner stays, shows inline error: "Failed to clean worktree — try manually removing {path}"

### Resume path

1. Banner appears (dirty worktree detected)
2. User clicks "Resume with Changes" → sets `forceResume: true` flag → banner disappears
3. User clicks Launch → `launchIssue` passes `forceResume: true` → `prepareWorktree` skips dirty check, reuses worktree as-is
4. ttyd opens in the existing dirty worktree with previous uncommitted changes

### Edge cases

- **Workspace mode changes away from "worktree"** → banner disappears (irrelevant)
- **Workspace mode changes back to "worktree"** → re-check status
- **Network error during status check** → no banner (fail open — let the launch attempt surface the error)
- **Clone mode with dirty clone** → same pattern applies; both live in `~/.issuectl/worktrees/`

## Testing

### Core (unit tests)

- `checkWorktreeStatus` — no worktree dir, clean worktree, dirty worktree, non-git directory
- `resetWorktree` — existing dirty dir removed, `git worktree prune` called, error on removal
- `prepareWorktree` with `forceClean: true` — cleans then proceeds normally

### Web (server action + integration tests)

- `checkWorktreeStatus` action — validates inputs, calls core, returns correct shape
- `resetWorktree` action — validates inputs, calls core, revalidates paths
- `launchIssue` with `forceResume` — passes flag through to `executeLaunch`

### E2E

Skip — requires pre-existing dirty worktree fixtures on disk. Unit + integration coverage is sufficient.
