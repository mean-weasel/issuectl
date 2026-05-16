# T006 Implementation Verification

## Status

Implemented and automated checks are green. T006 remains active because the manual two-desktop dogfood acceptance criterion has not been completed in this run.

## Implemented

- Added per-desktop Pull Request filter persistence for search text, section, sort, mine-only, selected repositories, repository disclosure state, and transient pagination reset.
- Added per-desktop Sessions filter persistence for search text, selected repositories, and repository disclosure state.
- Stored PR and Sessions filter state on each `MacSidebarSpaceState`, matching the existing Issues pattern.
- Synced PR and Sessions repo selections when repositories change.
- Preserved the existing Sessions repository disclosure default as expanded while still persisting user changes per desktop.
- Extended preference and filter-state unit coverage so two desktop namespaces do not collide for Issues, Pull Requests, or Sessions, including an integration-style `MacSidebarSpaceState` reload test across two space slots.

## Verification Completed

- `git diff --check`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' build`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' -only-testing:IssueCTLMacTests test`
  - Passed with 49 tests, including `testSpaceStatesPersistIndependentIssuePullRequestAndSessionFilters`.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' build-for-testing`
  - Passed after adding the skipped-by-default local Spaces UI verifier and after tightening it to skip when the runner cannot drive local Space switching.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64,id=00008132-001105AE2E99801C' -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testPullRequestListFiltersPaginatesAndOpensDetail -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testActiveSessionsFiltersPreviewNavigationOpenAndEnd test`
  - First run exposed a Sessions disclosure default regression.
  - PR smoke passed.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64,id=00008132-001105AE2E99801C' -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testActiveSessionsFiltersPreviewNavigationOpenAndEnd test`
  - Passed after preserving the Sessions default expanded repository disclosure.

## Remaining

- Manual dogfood on two macOS desktops:
  1. On Desktop 1, set distinct PR filters and Sessions filters.
  2. Switch to Desktop 2 and set different PR filters and Sessions filters.
  3. Switch back to Desktop 1 and confirm its PR and Sessions filters are restored.
  4. Switch back to Desktop 2 and confirm its PR and Sessions filters are restored.
  5. Confirm existing Issues per-desktop filters still restore independently.

## Dogfood Receipt Template

Record this section before marking T006 done:

- Date/time:
- App build/path:
- Desktop 1 observed filters:
  - Issues:
  - Pull Requests:
  - Sessions:
- Desktop 2 observed filters:
  - Issues:
  - Pull Requests:
  - Sessions:
- Switch sequence:
  - Desktop 1 -> Desktop 2:
  - Desktop 2 -> Desktop 1:
  - Desktop 1 -> Desktop 2:
- Result:
  - Distinct Issues filters restored:
  - Distinct Pull Request filters restored:
  - Distinct Sessions filters restored:
- Notes/failures:

## Blocker

- On 2026-05-15, `defaults read com.apple.spaces` showed two user Spaces on the main display, while app preferences initially contained only `mac.sidebar.spaces.space-slot-1.*` keys.
- A controlled `Control-Right` Space switch while the dogfood app was running created `mac.sidebar.spaces.space-slot-2.*` preferences, confirming the app can learn a second digital desktop slot after switching Spaces.
- This is partial dogfood evidence only: the run has not yet confirmed distinct PR and Sessions filter choices restore correctly when switching back and forth.
- Keep T006 active until the user confirms the two-desktop filter checklist above or a later run records a complete dogfood receipt.
- Added `testLocalOnlySidebarFiltersPersistAcrossSpaces`, a skipped-by-default UI verifier gated by `ISSUECTL_MAC_UI_SPACES_TEST=1` or `/tmp/issuectl-mac-ui-spaces-test`. Do not run it in normal CI: the existing UI fixture intentionally clears defaults on launch, and reliable macOS Space switching depends on local Mission Control state.
- Local opt-in attempts on 2026-05-15 did not produce a complete dogfood receipt: `XCUIApplication.typeKey(.rightArrow, modifierFlags: .control)` did not switch Spaces, and `/usr/bin/osascript` could not drive System Events from the UI-test runner sandbox. The verifier now skips with a clear reason when that local driver is unavailable.
- Temporary search strings written during the failed local verifier attempts were removed from `com.issuectl.mac`, and the dogfood app was relaunched afterward.
