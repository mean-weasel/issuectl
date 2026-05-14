# T069 Phase 11A Today Attention

Date: 2026-05-14

## Result

Result: `done`

PR: https://github.com/mean-weasel/issuectl/pull/446

Branch: `mac-parity-phase-11a-today-attention`

Base: `mac-sidebar-spaces-option-a`

## Changes

- Added a first-class `Today` section to the Mac sidebar section picker and collapsed rail.
- Added `MacTodayView`, a compact sidebar-native attention surface with metrics, search, attention rows, quick create, and cache/offline state.
- Reused existing Mac issue detail, PR detail, terminal open, and direct issue creation surfaces.
- Made `DirectIssueCreateSheet` reusable outside the Drafts section.
- Added projection coverage for Today counts, attention ordering, blocking issue state, and search filtering.
- Added UI coverage for Today metrics/search/navigation and quick create entry.

## Acceptance Evidence

- Mac sidebar now includes `Today` in expanded and collapsed section controls.
- Metrics expose active sessions, review-needed PRs, and assigned/open issues.
- Attention rows include review-needed PRs, assigned issues, and active sessions from fixture data.
- PR and issue rows open existing Mac detail sheets; session rows use existing terminal open behavior.
- Search filters loaded Today issues and PRs by text and preserves PR navigation.
- Quick create opens the existing direct issue creation flow from Today.
- Cached/offline indicators are wired from issue, PR, and session cache metadata.

## Validation

- `git diff --check`: pass
- `pnpm typecheck`: pass
- `pnpm lint`: pass with existing warnings only
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build`: pass
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase11a-mac -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`: pass, 29 tests
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase11a-mac -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testTodayAttentionSectionShowsMetricsSearchAndNavigation -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testTodayQuickCreateOpensDirectIssueFlow`: pass, 2 tests

## Notes

This is the compact-first Phase 11 implementation. It intentionally does not add a separate full Today window.
