# T015 Menu And Header Chrome Receipt

## Result

Implemented with live UI execution deferred by local disk pressure.

## Changes

- Reordered the status menu so it opens with current desktop identity and current sidebar visibility/collapse state.
- Kept high-frequency current-desktop actions near the top: show/hide, collapse/expand, and refresh sidebar.
- Moved per-desktop layout management behind a `Desktop Layouts` submenu instead of listing every desktop action at top level.
- Added a status-menu refresh action that reloads the sidebar store.
- Removed the direct sidebar-header disconnect icon from the high-frequency header path.
- Moved disconnect behind a header overflow menu and added a confirmation dialog before clearing the saved connection.
- Updated Mac UI smoke assertions for the new status-menu status rows, refresh action, desktop-layout grouping, and header overflow control.

## Verification

- `git diff --check`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' build`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' build-for-testing`

## Notes

- Live status-menu UI execution was not rerun because the machine had about 533 MB free and earlier UI attempts failed while writing `.xcresult` bundles.
- The updated smoke assertions compile in the UI test bundle and should be run once local disk has enough headroom.
- Full UX cleanup remains incomplete; T016 is now the active task.
