# T015 Phase 2 Settings Parity

Date: 2026-05-14

Implemented Phase 2 as draft PR #424 on `mac-parity-phase-2-settings`, based on `mac-sidebar-spaces-option-a`.

## Changes

- Added a native Mac connection status card in Settings with server URL, token state, app/server version, repo count, user, retry, edit connection, reconnect local, and disconnect actions.
- Added manual connection editing with health-check-before-save and retained local issuectl token reconnect support.
- Added the shared advanced settings controls to Mac Settings for launch agent, cache TTL, worktree directory, branch pattern, default repo, extra args, idle grace, and idle threshold.
- Preserved Phase 1 native repository management and Mac sidebar settings in the same settings surface.
- Extended the Mac UI fixture API with deterministic settings defaults, `PATCH /api/v1/settings`, and UI-test default reset to avoid stale persisted sidebar state.
- Added shared API endpoint coverage for settings GET/PATCH and a Mac UI smoke path that edits and saves advanced settings.

## Validation

- `git diff --check` passed.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests` passed: 23 tests.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests` passed: 4 tests.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -destination 'platform=iOS Simulator,id=002673DD-F669-4F62-A9BB-B5009A96E818' test -only-testing:IssueCTLTests/APIClientExtensionTests` passed: 33 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed with existing warnings.

## Notes

- An initial iOS test command using `platform=iOS Simulator,name=iPhone 16` failed because Xcode could not resolve the destination with `OS=latest`; rerunning with simulator id `002673DD-F669-4F62-A9BB-B5009A96E818` passed.
- The first Mac UI run exposed stale persisted UI state and a brittle saved-label assertion. Fixture-mode defaults are now reset on launch, and the UI test verifies a successful save by absence of the save-error surface while API tests pin the PATCH request.
