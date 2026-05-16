# T002 Sidebar Filter Simplification Receipt

## Outcome

Implemented the first Mac UX cleanup slice.

- Issues and Pull Requests now keep search visible while secondary filter controls live inside a collapsed `Filters` disclosure.
- The collapsed filter row shows active state/section, sort, and `Mine` when enabled.
- Issues and Pull Requests use a matching filter/repository rhythm.
- Repository filters remain a separate disclosure and now default collapsed for new/reset layouts.
- Existing saved issue repository disclosure preferences still reload.
- Repository filter All, None, and individual toggles have stable accessibility identifiers.
- The disclosure rows are button-backed instead of `DisclosureGroup`-backed because UI automation could see but not reliably toggle SwiftUI disclosure triangles in this sidebar panel.

## Files Changed

- `apple/IssueCTLMac/Views/MacIssuesView.swift`
- `apple/IssueCTLMac/Views/MacPullRequestsView.swift`
- `apple/IssueCTLMac/Platform/MacSidebarPreferences.swift`
- `apple/IssueCTLMacTests/MacIssueFilterStateTests.swift`
- `apple/IssueCTLMacTests/MacSidebarPreferencesTests.swift`
- `apple/IssueCTLMacUITests/MacSidebarSmokeTests.swift`

Pre-existing dirty work preserved:

- `apple/IssueCTLMac/Views/MacSettingsView.swift`
- Earlier Add Repository browse changes in `apple/IssueCTLMacUITests/MacSidebarSmokeTests.swift`

## Verification

Passed:

- `git diff --check`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' build`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' -only-testing:IssueCTLMacTests test`
  - 46 tests, 0 failures
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64,id=00008132-001105AE2E99801C' -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testSidebarFiltersCanBeCollapsedAndAdjusted test`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64,id=00008132-001105AE2E99801C' -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testIssueListFiltersSortsResetsAndLoadsMore -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testPullRequestListFiltersPaginatesAndOpensDetail test`

## Residual Risk

- Pull Request filter state remains local to the view; per-desktop PR persistence is intentionally queued for T006.
- The disclosure row helper is duplicated in the Issues and PR files to avoid a broader shared-file/project change in this slice.
