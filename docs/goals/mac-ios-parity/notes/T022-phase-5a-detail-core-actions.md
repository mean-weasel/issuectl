# T022 Phase 5A Detail Core Actions

## Result

Done. Phase 5A now gives the Mac issue detail surface the core action parity slice from the iOS app without taking on labels, assignees, reassignment, or image lightbox behavior.

## Implemented

- Added Mac detail Markdown rendering for issue bodies and comments, including fenced code blocks and plain text fallback.
- Rendered linked pull requests and deployment/session context from issue detail payloads.
- Loaded the current user in Mac detail and permission-gated comment edit/delete controls to comments authored by that user.
- Added Edit Issue support for title/body updates.
- Added Close With Comment support while keeping the normal close/reopen action path available.
- Added own-comment edit and own-comment delete flows with recoverable sheet errors and delete confirmation.
- Refreshed detail and sidebar/list state after successful mutations.
- Extended the Mac UI fixture API for detail fetches, issue PATCH, state updates with optional comments, comment creation, comment edit, and comment delete.
- Stabilized Mac issue-row activation by using a scroll-backed lazy stack for the issue list.
- Added a stable pagination summary identifier and updated the smoke test to assert loaded-result counts instead of relying on far-offscreen row materialization.

## Files Changed

- `apple/IssueCTLMac/App/IssueCTLMacApp.swift`
- `apple/IssueCTLMac/Views/MacIssueDetailView.swift`
- `apple/IssueCTLMac/Views/MacIssuesView.swift`
- `apple/IssueCTLMac/Views/MacSidebarStore.swift`
- `apple/IssueCTLMacUITests/MacSidebarSmokeTests.swift`
- `docs/goals/mac-ios-parity/state.yaml`

## Validation

- PASS: `git diff --check`
- PASS: `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-phase5a-build -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build`
- PASS: `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-phase5a-unit -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests`
- PASS: `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -derivedDataPath /tmp/issuectl-ios-phase5a-api -destination 'platform=iOS Simulator,id=002673DD-F669-4F62-A9BB-B5009A96E818' test -only-testing:IssueCTLTests/APIClientExtensionTests`
- PASS: `pnpm typecheck`
- PASS: `pnpm lint`
- PASS: `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testIssueDetailCoreActionsAndContext`
- PASS: `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testIssueListFiltersSortsResetsAndLoadsMore`
- PASS: `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests` (9 tests)

Known warnings:

- `pnpm lint` still reports existing unrelated web/core warnings.
- Mac UI test builds still report existing Swift actor-isolation warnings in `MacSidebarSmokeTests`.

## PR

- Branch: `mac-parity-phase-5a-detail-core-actions`
- Base: `mac-sidebar-spaces-option-a`
- PR: https://github.com/mean-weasel/issuectl/pull/427
- Merge readiness: local validation is green. Merge remains gated on remote checks after the final commit is pushed.

## Deferred

- Labels
- Assignees
- Reassign
- Image lightbox
- Any broader issue-detail parity polish outside the core action/context slice

