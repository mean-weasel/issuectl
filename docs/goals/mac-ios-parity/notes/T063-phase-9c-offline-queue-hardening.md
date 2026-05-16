# T063 Phase 9C Offline Queue Hardening

Date: 2026-05-14

## Result

Implemented Phase 9C Mac offline queue hardening on `mac-parity-phase-9c-offline-queue-hardening`.

PR: https://github.com/mean-weasel/issuectl/pull/443
Base: `mac-sidebar-spaces-option-a`
Head before receipt commit: `f1e62caadfe9821d58f130818a7f4e0cb9661c9d`
GitHub checks: none reported
Merge state: `CLEAN`

## Changes

- Added Mac offline queue summary and row projection types so queue rendering, status icons, detail text, last error display, and accessibility labels have deterministic unit coverage.
- Added stable accessibility identifiers and labels around Mac settings offline queue rows and controls.
- Added Mac unit coverage for queue summary/row projections, queue replay through `OfflineSyncService`, retry/clear/remove behavior, and FIFO comment/state replay requests.
- Added a Mac UI fixture path that seeds a queued offline comment and verifies the Settings offline queue summary, sync button, and remove action are visible.

## Acceptance Evidence

- Mac settings queue visibility is covered by `MacSidebarSmokeTests/testSettingsShowsSeededOfflineQueue`.
- Sync, retry failed, clear failed, and remove controls are covered by `MacIssueFilterStateTests/testMacOfflineSyncServiceReplaysAndControlsQueue` and `testMacOfflineSyncRetryClearAndRemoveControlsMutateQueue`.
- Queued Mac issue comment and state replay is covered by `testMacOfflineSyncServiceReplaysAndControlsQueue`.
- Failed action detail projection is covered by `testMacOfflineQueueSummaryAndRowsExposeActionDetails`.
- Non-queueable Mac issue/PR actions remain outside this slice; the full Mac smoke suite continued to cover existing issue/PR action behavior without queue regressions.

## Dogfood

Real stop-web/restart-web dogfood was not performed in this run because the local web server may be serving the user's current machine session. Replacement evidence used the deterministic Mac UI fixture (`ISSUECTL_MAC_UI_FIXTURE_OFFLINE_QUEUE=1`) plus shared offline sync replay tests. A manual dogfood pass remains appropriate before turning this from draft to merge-ready if the user wants real server interruption evidence.

## Validation

- `git diff --check`: pass
- `pnpm typecheck`: pass
- `pnpm lint`: pass with existing warnings only
- Focused Phase 9C Mac tests: 3 Mac unit tests and 1 Mac UI test passed
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase9c-mac -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`: 27 tests passed
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath /tmp/issuectl-phase9c-ios -only-testing:IssueCTLTests/OfflineSyncServiceTests`: 8 tests passed
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase9c-mac -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`: 38 tests passed

