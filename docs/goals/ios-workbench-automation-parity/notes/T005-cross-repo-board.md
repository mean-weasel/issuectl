# T005 Cross-Repo Board Receipt

## Result

Implemented the iOS cross-repo work board as a new Issues section backed by the verified `WorkbenchBootstrap` projections. The board groups open workbench issues by repo, preserves repo payload order, shows running issue state, counts active PR sessions per repo, supports existing repo filters, search, sort order, and a running-only toggle, and navigates rows through the existing issue-detail route.

## Changed Files

- `apple/IssueCTL/Views/Shared/SectionTabs.swift`
- `apple/IssueCTL/Views/Issues/IssueListView.swift`
- `apple/IssueCTLTests/ViewLogicTests.swift`
- `apple/IssueCTLUITests/IssueCTLUITests.swift`
- `docs/goals/ios-workbench-automation-parity/notes/T005-cross-repo-board.md`
- `docs/goals/ios-workbench-automation-parity/state.yaml`

## Implementation Notes

- Kept the board inside the existing Issues source files because the Xcode project uses explicit source membership, and adding new Swift files would have required `.pbxproj` edits outside the T005 allowed scope.
- Added `IssueSection.board` with a stable accessibility identifier `section-tab-board`.
- Added `issueListWorkbenchBoardSections(...)` as testable view logic for repo grouping, active issue deployment detection, active PR deployment counts, running-only filtering, search, and sort behavior.
- Added Board UI controls with `issues-board-running-toggle` and row identifiers shaped as `board-issue-row-<repo>-<issue>`.

## Verification

- `git diff --check`: pass.
- Red proof: focused `ViewLogicTests` failed before implementation because `issueListWorkbenchBoardSections` did not exist.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests/ViewLogicTests -only-testing:IssueCTLTests/WorkbenchBootstrapMapperTests`: pass, 80 tests.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLUITests/IssueCTLUITests/testIssuesBoardSectionIsReachable`: pass.
- Direct inspection with `rg` found the board section enum, board grouping helper, board toggle, board row identifiers, section header, active PR session count, and T005 tests.

## Broad UI Suite Blocker

The board's planned broad UI verifier:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLUITests/IssueCTLUITests
```

ran 17 UI tests and failed only `IssueCTLUITests.testRepoContextIsVisibleAcrossPrimaryTabs`. A focused rerun of that single test failed the same way. The failure is not in the T005 board path: the Active tab renders `repo-context-filter-button` and active session row `session-reenter-terminal-9001`, but no `repo-context-active` chip.

Source inspection shows `apple/IssueCTL/Views/Sessions/SessionListView.swift` passes `showsActiveSummary: false` to `RepoContextStrip`, while the test expects `repo-context-active`. T005 explicitly stopped before editing Sessions, Terminal, shared models, or API clients, so this is recorded as an out-of-scope verifier blocker for the next Judge/PM decision rather than silently widening the Worker slice.

## Strongest Disproof Attempt

The most realistic failure mode was that adding a new Issues section would break existing tab navigation or hide the board in the horizontal section picker. The focused Board UI test proved `Issues -> Board -> Running only` is reachable on iPhone 17, while the full UI suite exercised existing issue, PR, draft, launch, active-session, toolbar, and recovery flows before hitting the separate Active-tab repo-context assertion.
