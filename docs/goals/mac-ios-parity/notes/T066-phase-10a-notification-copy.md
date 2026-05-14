# T066 Phase 10A Notification Copy

Date: 2026-05-14

## Result

Result: `done`

PR: https://github.com/mean-weasel/issuectl/pull/445

Branch: `mac-parity-phase-10a-notification-copy`

Base: `mac-sidebar-spaces-option-a`

## Changes

- Added a Mac Settings `Notifications` section with an unavailable-state row.
- Added a stable `MacNotificationUnavailableProjection` for title, body, icon, and accessibility copy.
- Added unit coverage proving the unavailable-state copy and issue #444 reference are stable.
- Added Mac UI coverage proving the Settings notification unavailable state is visible and iOS notification toggles are not exposed on Mac.

## Acceptance Evidence

- Mac settings includes a Notifications section that says notifications are iOS-only for now.
- Backend/platform follow-up is linked through issue #444 in the unavailable-state copy and in this receipt.
- No notification preference toggles are exposed in the Mac settings UI.
- `MacIssueFilterStateTests/testMacNotificationUnavailableProjectionDocumentsDeferredPath` covers title, body, icon, issue reference, and accessibility text.
- `MacSidebarSmokeTests/testSettingsShowsNotificationUnavailableState` covers Settings visibility and absence of notification toggles.

## Validation

- `git diff --check`: pass
- `pnpm typecheck`: pass
- `pnpm lint`: pass with existing warnings only
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase10a-mac -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`: pass, 28 tests
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase10a-mac -only-testing:IssueCTLMacTests/MacIssueFilterStateTests/testMacNotificationUnavailableProjectionDocumentsDeferredPath -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testSettingsShowsNotificationUnavailableState`: pass, 2 tests

## Notes

Real macOS push notification registration remains deferred to https://github.com/mean-weasel/issuectl/issues/444. This slice intentionally does not change backend notification schema/API behavior, APNs topic configuration, entitlements, or remote notification delegate wiring.
