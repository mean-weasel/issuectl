# T018 Settings And Repository Setup Receipt

## Result

Implemented with live settings UI execution deferred by local disk pressure.

## Changes

- Moved high-frequency Mac app settings earlier in the form: connection, Mac Sidebar, repositories, and Desktop Layouts now appear before lower-frequency agent defaults, worktree maintenance, and notifications.
- Renamed `Sidebar Per Desktop` to `Desktop Layouts` to match the status menu language.
- Renamed `Agent Harness & Defaults` to `Agent Defaults`.
- Made repository rows clearer when a local clone folder is missing.
- Changed the repository row action from generic `Edit` to `Add Local Folder...` when a local path is missing.
- Added a native `NSOpenPanel` folder chooser to the edit repository sheet for selecting a local clone directory.
- Updated settings smoke coverage for the new `Desktop Layouts` wording.

## Verification

- `git diff --check`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' build`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' build-for-testing`

## Notes

- Live settings UI smoke execution was not rerun because the machine has roughly 532 MB free and earlier UI attempts failed while writing `.xcresult` bundles.
- Full UX cleanup remains subject to final audit and manual/dogfood evidence gaps.
