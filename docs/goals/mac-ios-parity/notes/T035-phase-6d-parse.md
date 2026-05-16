# T035 Phase 6D Parse Implementation

## Result

Implemented the Mac AI parse and batch issue creation workflow in PR #433.

- Branch: `mac-parity-phase-6d-parse`
- Base: `mac-sidebar-spaces-option-a`
- PR: `https://github.com/mean-weasel/issuectl/pull/433`

## Acceptance Evidence

- Parse entry point is available from the Mac Drafts creation surface via `mac-drafts-parse-ai-button`.
- Free-form input is submitted through the shared `parseNaturalLanguage(input:)` API with loading and error states.
- Parsed issues can be accepted or rejected individually and assigned to tracked repositories before creation.
- Batch creation uses the shared `batchCreateIssues(issues:)` API and posts only accepted reviewed issues.
- Creation results summarize created/drafted/failed counts.
- Create failure preserves the review state and exposes an inline parse error.
- Successful creation refreshes Mac issue data; the UI fixture created issue `org/alpha#90` is visible in the issue list.

## Validation

- `git diff --check`: pass
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-phase6d-build -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build`: pass
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-tests-derived -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests`: pass, 33 tests
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`: pass, 20 tests
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -derivedDataPath /tmp/issuectl-ios-api-derived -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLTests/APIClientExtensionTests`: pass, 37 tests
- `pnpm typecheck`: pass
- `pnpm lint`: pass with existing warnings only

## Notes

The iOS build regenerated `apple/IssueCTL/Generated/AppVersion.swift`; the generated churn was restored and is not part of this slice.

Next gate is PR #433 status/check inspection, then ready/merge if clean or if the repository has no configured checks and local validation is accepted as the replacement evidence.
