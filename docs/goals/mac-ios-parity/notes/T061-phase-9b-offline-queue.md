# T061 Phase 9B Offline Queue Foundation

Date: 2026-05-14

## Result

Implemented Phase 9B on `mac-parity-phase-9b-offline-queue` in draft PR #442.

## Changes

- Wired the existing `OfflineSyncService` into the Mac app delegate, settings scene, and per-Desktop sidebar coordinator.
- Added Mac offline queue handling for queueable issue detail actions:
  - issue comments
  - issue close/reopen state changes
  - close-with-comment state changes
- Added Mac settings queue status and controls for pending/failed counts, sync, retry failed, clear failed, and per-action removal.
- Added deterministic Mac UI fixture failure hooks for queueable comment/state network failures.
- Added Mac UI coverage for offline comment queuing from issue detail.
- Kept non-queueable actions outside this queue slice.

## Validation

- `git diff --check`: pass
- `pnpm typecheck`: pass
- `pnpm lint`: pass with existing warnings only
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath /tmp/issuectl-phase9b-ios -only-testing:IssueCTLTests/OfflineSyncServiceTests`: pass, 8 tests
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase9b-mac -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`: pass, 24 tests
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase9b-mac -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testOfflineIssueCommentQueuesFromIssueDetail -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testSettingsShowsNativeRepositoryManagement`: pass, 2 tests
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase9b-mac -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`: pass, 37 tests

## Residual Risk

- The Mac UI test proves queueing from the issue detail surface and the full settings suite proves native settings still opens and functions. It does not assert queue row visibility in Settings because the macOS accessibility tree did not reliably expose the queue summary during earlier attempts.
- Replay behavior remains covered by the shared `OfflineSyncServiceTests`; this slice reuses that service rather than introducing a Mac-specific queue implementation.
