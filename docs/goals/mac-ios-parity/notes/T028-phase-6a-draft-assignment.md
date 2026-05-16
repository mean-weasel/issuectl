# T028 Phase 6A Draft Assignment

## Result

`done`.

Implemented Mac assignment of existing local drafts to a tracked repository in PR #430.

## PR Status

- PR: https://github.com/mean-weasel/issuectl/pull/430
- Branch: `mac-parity-phase-6a-draft-assignment`
- Base: `mac-sidebar-spaces-option-a`
- Status: draft until review/merge gate

## Changes

- Added a visible Assign action and context-menu action to Mac draft rows.
- Added a Mac draft assignment sheet with tracked-repo selection, repo label loading, multi-select label choices, and recoverable error display.
- Wired assignment through `MacSidebarStore.assignDraftWithLabels`, using the shared draft assignment API request/response types.
- Refreshes Mac sidebar data after successful assignment so the draft disappears and the created issue is visible in issue surfaces.
- Preserves selected repo, selected labels, and the open assignment sheet when assignment fails.
- Expanded the Mac UI fixture API to return assigned-draft issues and simulate assignment failure.
- Added Mac sidebar UI tests for successful label assignment/refresh and failure preservation.

## Validation

- `git diff --check`: pass
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-phase6a-build -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build`: pass
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-tests-derived -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests`: pass, 29 tests
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testDraftAssignsToRepoWithLabelsAndRefreshesIssues -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testDraftAssignmentFailurePreservesChoices`: pass, 2 tests
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`: pass, 13 tests
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -derivedDataPath /tmp/issuectl-ios-api-derived -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLTests/APIClientExtensionTests`: pass, 37 tests
- `pnpm typecheck`: pass
- `pnpm lint`: pass with existing warnings

## Notes

- The first focused UI test run exposed ambiguous root/draft selection; the test now targets the root section picker and waits on the Drafts-view-only Assign button.
- `pnpm lint` warnings are pre-existing TypeScript max-lines/unused/explicit-any warnings outside this slice.
- The iOS build regenerated `apple/IssueCTL/Generated/AppVersion.swift`; that generated file was restored because it is unrelated to this Mac PR.

## Next Gate

Judge PR #430 for acceptance criteria coverage, update the PR body, inspect GitHub checks, then mark ready and merge only if the GitHub or accepted replacement validation gate is satisfied.
