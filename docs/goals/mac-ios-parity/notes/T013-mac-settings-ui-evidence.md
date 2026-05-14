# T013 Worker Receipt: Mac Settings UI Evidence

## Result

Done. The Mac UI automation blocker for PR #423 is resolved for the native repository Settings workflow.

## Changes

- Added a UI-testing-only fixture API in the Mac app via `URLProtocol`.
- Kept the fixture gated behind `ISSUECTL_UI_TESTING=1` and `ISSUECTL_MAC_UI_FIXTURE_API=1`.
- Added a Mac UI smoke test that opens Settings through the real status-menu path, verifies native repository controls, verifies a tracked repo row, opens Add Repository, and verifies browsed GitHub repos.

## Validation

- `git diff --check` passed.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests` passed with 3 tests.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests` passed with 23 tests.

## Notes

Mac UI tests should run with normal signing and an isolated DerivedData path. Forcing `CODE_SIGNING_ALLOWED=NO` on the UI-test runner caused the earlier silent hang.
