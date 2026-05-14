# T052 Next Phase 8C Slice

Decision: approved.

The next safe slice is Phase 8C launch readiness and dirty-worktree handling.

## Rationale

Phase 8A added launch options and Phase 8B added Active Sessions parity. The remaining Phase 8 requirements split cleanly into two risk groups:

- Readiness and dirty-worktree launch decisions.
- Embedded terminal window and terminal controls.

Readiness should land first because it is on the launch critical path, can reuse the existing `/api/v1/worktrees/status` and `/api/v1/worktrees/reset` APIs, and can be covered by fixture-backed Mac UI tests without introducing WKWebView runtime complexity.

## Worker

T053 should implement:

- local path checks and clone/worktree fallback explanation,
- dirty-worktree detection before launch,
- discard/start fresh through worktree reset,
- resume-with-changes through `forceResume`,
- launch/reset progress state and recoverable failures,
- fixture-backed unit/UI evidence.

## Branch

- Integration branch: `mac-sidebar-spaces-option-a`
- Worker branch: `mac-parity-phase-8c-readiness`
- PR base: `mac-sidebar-spaces-option-a`

## Excluded Follow-Up Scope

- Embedded terminal window/WKWebView.
- Terminal text-size, reconnect, and respawn controls.
- Terminal-window dogfood pass.
