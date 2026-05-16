# T016 Panel Utility Chrome Receipt

## Result

Implemented with live Spaces dogfood deferred by local disk pressure.

## Changes

- Hid the redundant `IssueCTL` title text in the sidebar panel titlebar.
- Made the titlebar transparent so the panel reads more like a compact menu-bar utility surface.
- Enabled background dragging so the reduced chrome still leaves a predictable way to move the panel.
- Preserved the existing panel style mask, close behavior, resize constraints, right-edge alignment, floating/status-bar level behavior, per-desktop controller mapping, and inactive-space hiding logic.

## Verification

- `git diff --check`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' build`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' -only-testing:IssueCTLMacTests test`
  - Passed 48 tests with 0 failures.

## Notes

- Live hide/show/collapse and Spaces dogfood was not rerun because the machine had about 532 MB free and earlier UI attempts failed while writing `.xcresult` bundles.
- The change intentionally avoids collection behavior, active-space detection, persistence, sizing, or controller lifecycle changes.
- Full UX cleanup remains incomplete; T017 is now the active task.
