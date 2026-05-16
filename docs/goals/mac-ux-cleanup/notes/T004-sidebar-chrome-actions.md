# T004 Sidebar Chrome Actions Receipt

## Result

Implemented.

## Changes

- Moved global sidebar summary text into the root header.
- Added a root header refresh button with `mac-sidebar-refresh-button`.
- Removed the redundant dashboard toolbar row so section picker and section content start directly under global status/error banners.
- Preserved global collapse, hide, and disconnect entry points.
- Removed duplicate Drafts empty-state creation controls; Drafts creation actions remain in the Drafts toolbar.
- Added UI smoke coverage for global summary, refresh, collapse, expand, and hide.

## Verification

- `git diff --check`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' build`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' -only-testing:IssueCTLMacTests test`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64,id=00008132-001105AE2E99801C' -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testSidebarLaunchesCollapsesExpandsAndHides -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testQuickCreateIssueWithLabelsRefreshesIssues test`

## Notes

- Today and Sessions keep their section-specific refresh buttons because they refresh additional section-local data.
- Full UX cleanup remains incomplete; T005 is now the active task.
