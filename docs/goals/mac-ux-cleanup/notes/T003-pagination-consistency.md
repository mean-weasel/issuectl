# T003 Pagination Consistency Receipt

## Result

Implemented.

## Changes

- Removed the duplicate Issues load-more button from the filter controls.
- Kept a single bottom Issues load-more button and added `mac-issues-load-more-button` for UI coverage.
- Updated Issues terminal result text to `Showing all N matching issues`.
- Raised Pull Requests first page size from 3 to 25.
- Added a Pull Requests pagination summary near the filter controls.
- Updated Pull Requests terminal result text to `Showing all N matching pull requests`.
- Updated Mac sidebar smoke coverage for the bottom-only Issues load-more flow and the larger Pull Requests first page.

## Verification

- `git diff --check`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' build`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' -only-testing:IssueCTLMacTests test`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64,id=00008132-001105AE2E99801C' -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testIssueListFiltersSortsResetsAndLoadsMore -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testPullRequestListFiltersPaginatesAndOpensDetail test`

## Notes

- The Pull Requests fixture set does not currently exceed 25 filtered rows, so the focused smoke test confirms the practical page-size behavior and terminal summary. The Issues smoke test still exercises the actual load-more control.
- Full UX cleanup remains incomplete; T004 is now the active task.
