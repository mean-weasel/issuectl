# T053 Phase 8C Launch Readiness

## Result

Implemented Phase 8C launch readiness parity on `mac-parity-phase-8c-readiness` for draft PR #439 into `mac-sidebar-spaces-option-a`.

## Product Changes

- Added a Mac launch options readiness panel that checks worktree status before launch.
- Shows clear clone/worktree readiness messaging for clean worktrees, missing local repo paths, status-check failures, clone mode, and existing-checkout mode.
- Detects dirty worktrees and blocks ambiguous worktree launch until the user explicitly chooses a recovery path.
- Added dirty-worktree actions:
  - `Discard & Start Fresh` calls the reset worktree API, records reset progress/error state, and launches with reset semantics.
  - `Resume with Changes` launches with explicit resume semantics.
- Converts a manually selected worktree launch to clone mode when the repo has no local path, while keeping a visible fallback explanation in the sheet.
- Keeps launch failures visible inside the options sheet so the user can adjust options and retry without losing context.
- Preserved one-click default launch and the existing custom launch options flow.
- Extended Mac UI fixtures with worktree status/reset routes, dirty/no-local-path/status-failure/reset-failure/launch-failure modes, and launch payload assertions.

## Acceptance Evidence

- One-click launch still works through the default button path.
- Dirty worktree UI is fixture-backed and confirmed for both reset-before-launch and resume-with-changes.
- Reset-before-launch asserts the reset endpoint is called before launch and the launch payload sends `forceResume == false`.
- Resume-with-changes asserts the launch payload sends `forceResume == true`.
- Missing local path fallback shows a visible explanation and asserts the launch payload uses clone mode.
- Worktree status failure shows a recoverable error and supports switching to clone mode.
- Reset failure and launch failure remain visible in the launch options sheet with the submit button still available for recovery.

## Validation

- PASS: `git diff --check`
- PASS: `pnpm typecheck`
- PASS: `pnpm lint`
  - Existing warnings only; no lint errors.
- PASS: `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8c-dd -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`
  - 22 tests passed.
- PASS: Focused launch readiness UI tests:
  - `testCustomIssueLaunchOptionsBuildLaunchRequest`
  - `testLaunchOptionsDirtyWorktreeCanResumeWithChanges`
  - `testLaunchOptionsDirtyWorktreeCanResetBeforeLaunch`
  - `testLaunchOptionsWorktreeStatusFailureCanFallbackToClone`
  - `testLaunchOptionsNoLocalPathFallsBackToClone`
  - `testLaunchOptionsFailuresRemainRecoverable`
- PASS: `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8c-dd -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`
  - 34 tests passed.

## Residual Scope

- Embedded terminal WKWebView and terminal text-size/reconnect/respawn controls remain excluded from this slice per T052.
- PR #439 still needs push, ready-for-review transition, check inspection, and merge or accepted no-check replacement validation.
