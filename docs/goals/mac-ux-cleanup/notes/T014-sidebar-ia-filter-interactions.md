# T014 Sidebar IA And Filter Interactions Receipt

## Result

Implemented.

## Changes

- Made Issues and Pull Request count chips actionable state selectors instead of passive summary pills.
- Removed Drafts from the Issues state model so Drafts is represented only by its top-level sidebar destination.
- Kept search and selected scope visible while detailed controls stay collapsible.
- Reworked Sessions repository filtering to use the same button-backed disclosure rhythm as Issues and Pull Requests.
- Changed Sessions repository disclosure defaults and reset behavior to collapsed for consistency with the other sidebar filters.
- Updated Mac unit and UI smoke coverage for the removed Drafts issue state, actionable count rows, and collapsed repository defaults.

## Verification

- `git diff --check`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' -only-testing:IssueCTLMacTests/MacIssueFilterStateTests -only-testing:IssueCTLMacTests/MacSidebarPreferencesTests test`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' build`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' -only-testing:IssueCTLMacTests test`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' build-for-testing`

## Notes

- Focused live UI smoke execution was attempted, but the machine had only about 533 MB free and previous UI attempts failed while writing large `.xcresult` bundles. The UI test bundle now builds after moving the count-row selection tests to coordinate-based row selectors.
- Full UX cleanup remains incomplete; T015 is now the active task.
