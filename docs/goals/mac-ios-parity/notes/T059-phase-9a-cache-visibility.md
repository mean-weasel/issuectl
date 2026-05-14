# T059 Phase 9A Cache Visibility

Date: 2026-05-14

## Result

`done`

Implemented the Phase 9A Mac cache/offline visibility slice in PR #441.

https://github.com/mean-weasel/issuectl/pull/441

## Changes

- Added an offline banner to the Mac sidebar using the shared `NetworkMonitor`.
- Added deterministic fixture support for offline and cached Mac UI test launches.
- Surfaced cached issue list and issue detail indicators with cache-age copy.
- Added cache-age formatting helpers for Mac issue surfaces.
- Preserved existing PR and session cache banners; no PR/session surface behavior changed.

## Excluded Scope

- Offline mutation queue and replay.
- Queue settings management.
- Notifications.
- Today/Attention surface.

## Validation

- `git diff --check` passed.
- `pnpm typecheck` passed.
- `pnpm lint` passed with existing warnings only.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase9a-cache -only-testing:IssueCTLMacTests/MacIssueFilterStateTests` passed: 24 tests, 0 failures.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase9a-cache -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testIssueCacheAndOfflineIndicators` passed: 1 test, 0 failures.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase9a-cache -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests` passed: 36 tests, 0 failures.

## Residual Risk

This slice verifies deterministic cached/offline UI with fixtures. Real outage dogfood is still useful before the broader Phase 9 offline queue/replay work, but no network outage or queue behavior was part of this PR-sized slice.
