# T005 Menu And Desktop Wording Receipt

## Result

Implemented.

## Changes

- Replaced simultaneous current-desktop Show and Hide menu items with one stateful Show/Hide action.
- Added one stateful current-desktop Collapse/Expand action to the status menu.
- Updated the all-layout reset menu item to `Reset All Desktop Layouts`.
- Renamed Settings section `Learned Desktops` to `Sidebar Per Desktop`.
- Replaced `Learned desktop`, `Open Collapsed`, and `Saved Width` with clearer row copy: `Saved desktop`, `Opens Collapsed`, and `Width`.
- Updated Mac UI smoke coverage to assert the stateful status menu entries and renamed Settings wording.

## Verification

- `git diff --check`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' build`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' -only-testing:IssueCTLMacTests test`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64,id=00008132-001105AE2E99801C' -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testStatusMenuOpensSettings -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testSettingsShowsNativeRepositoryManagement test`

## Notes

- The first status-menu smoke assertion used the wrong accessibility attribute for menu items; it was corrected to match menu item `title`.
- Full UX cleanup remains incomplete; T006 is now the active task.
