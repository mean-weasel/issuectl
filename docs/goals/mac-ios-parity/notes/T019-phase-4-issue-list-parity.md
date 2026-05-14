# T019 Phase 4 Issue List Parity

Result: done

Branch: `mac-parity-phase-4-issue-list`
Base: `mac-sidebar-spaces-option-a`
PR: https://github.com/mean-weasel/issuectl/pull/426

Summary:
- Added Mac issue-list parity controls for Drafts, Open, Running, Unassigned, and Closed sections.
- Added persisted per-Desktop issue search, sort, and Mine filter state.
- Added deterministic client-side issue projection matching iOS section semantics, including running-session separation and unassigned/closed handling.
- Added priority loading from repo priority APIs and rendered non-normal priorities in rows.
- Added visible pagination control and row accessibility identifiers for reliable UI coverage.
- Expanded Mac UI fixture data for user, deployments, drafts, issues, and priorities.
- Stabilized Settings smoke-test opening so repeated settings tests use the standard macOS Settings shortcut while the dedicated status-menu test still covers the menu path.

Acceptance evidence:
- `MacIssueFilterStateTests.testProjectionMatchesIOSSectionSemantics` verifies draft/open/running/unassigned/closed projection semantics.
- `MacIssueFilterStateTests.testMineSearchAndPrioritySortAreDeterministic` verifies Mine, search, and priority sort behavior.
- `MacIssueFilterStateTests.testDraftSearchUsesTitleAndBody` verifies draft search parity.
- `MacIssueFilterStateTests.testSearchMineAndSortPersistAndResetPaging` verifies persisted issue filters and pagination reset behavior.
- `MacIssueFilterStateTests.testPerDesktopIssueStateDoesNotCollide` verifies per-Desktop issue state isolation.
- `MacSidebarSmokeTests.testIssueListFiltersSortsResetsAndLoadsMore` verifies the Mac UI path for pagination, issue sections, drafts, priority sort, Mine, search, and reset.

Validation:
- `git diff --check` passed.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build` passed.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests` passed: 29 tests, 0 failures.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests` passed: 8 tests, 0 failures.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -destination 'platform=iOS Simulator,id=002673DD-F669-4F62-A9BB-B5009A96E818' test -only-testing:IssueCTLTests/APIClientExtensionTests` passed: 36 tests, 0 failures.
- `pnpm typecheck` passed.
- `pnpm lint` passed with existing warnings only.

Notes:
- A combined Mac `test` invocation with UI tests and `CODE_SIGNING_ALLOWED=NO` was interrupted after unit tests completed because the UI runner stalled. The accepted gate uses explicit Mac unit and signed Mac UI smoke commands, which both passed.
