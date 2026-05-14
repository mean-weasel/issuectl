# T017 Phase 3 Worktree Management

## Result

Done. Implemented Phase 3 Worktree Management on branch `mac-parity-phase-3-worktrees` with draft PR #425 targeting `mac-sidebar-spaces-option-a`.

## Product Changes

- Added a native Mac Settings `Worktrees` section.
- Lists active and stale worktrees with repo, issue number, path, and status.
- Shows total, active, and stale counts.
- Supports refresh, individual stale worktree cleanup, and bulk stale cleanup.
- Active worktrees do not expose destructive cleanup controls.
- Cleanup failures keep rows intact and show a recoverable error.

## Test Evidence

- `git diff --check`: pass.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build`: pass.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests`: pass, 23 tests.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`: pass, 7 tests.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -destination 'platform=iOS Simulator,id=002673DD-F669-4F62-A9BB-B5009A96E818' test -only-testing:IssueCTLTests/APIClientExtensionTests`: pass, 36 tests.
- `pnpm typecheck`: pass.
- `pnpm lint`: pass with existing warnings.

## Acceptance Evidence

- View active and stale worktrees: covered by `testSettingsShowsWorktreesAndCleansStaleRows`.
- Clean one stale worktree: covered by `testSettingsCleansIndividualStaleWorktree`.
- Clean all stale worktrees: covered by `testSettingsShowsWorktreesAndCleansStaleRows`.
- Active worktrees not destructive-cleanable: covered by `testSettingsShowsWorktreesAndCleansStaleRows`.
- Cleanup failure leaves rows intact and shows error: covered by `testSettingsWorktreeCleanupFailureKeepsRowsAndShowsError`.
- API route/body coverage for list, single cleanup, and stale cleanup: covered by `APIClientExtensionTests`.

## Residual Risk

- No real-disk dogfood cleanup pass was run in this slice; fixture-backed UI and API tests cover behavior deterministically.
