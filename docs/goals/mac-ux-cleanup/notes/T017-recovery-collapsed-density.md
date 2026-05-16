# T017 Recovery, Collapsed Rail, And Density Receipt

## Result

Implemented with live UI execution deferred by local disk pressure.

## Changes

- Added direct recovery actions to filtered empty Issues states: clear search and reset filters.
- Added direct recovery actions to filtered empty Pull Request states: clear search and reset filters.
- Added direct recovery actions to filtered empty Sessions states: clear search and show all repositories.
- Added collapsed-rail count badges for available Issues, Drafts, Sessions, and Today attention count.
- Added collapsed-rail offline indication and richer accessibility values for selected/count/offline state.
- Aligned Draft rows with the shared sidebar text scale and row padding.
- Aligned Sessions rows and terminal preview text with the shared sidebar text scale.

## Verification

- `git diff --check`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' build`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' -only-testing:IssueCTLMacTests test`
  - Passed 48 tests with 0 failures.

## Notes

- Live collapsed/empty-state UI smoke execution was not rerun because the machine has roughly 532 MB free and earlier UI attempts failed while writing `.xcresult` bundles.
- The row-density pass is intentionally representative and focused on the outliers, Drafts and Sessions, while preserving existing Issues, PRs, and Today row structure.
- Full UX cleanup remains incomplete; T018 is now the active task.
