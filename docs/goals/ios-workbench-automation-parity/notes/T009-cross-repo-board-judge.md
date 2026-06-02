# T009 Cross-Repo Board Judge

## Verdict

T005 is accepted as a completed cross-repo Board slice. It moved the iOS app closer to the goal oracle by adding a Board section that groups workbench issues across repos, shows running issue state, counts active PR sessions, supports existing filters/search/sort, and preserves issue navigation.

## Active-Tab Verifier Disposition

The failed broad UI-suite check should be treated as a real verifier blocker, not as a reason to reject T005. The evidence is specific:

- The focused Board UI smoke passed.
- The full `IssueCTLUITests` run failed only `testRepoContextIsVisibleAcrossPrimaryTabs`.
- A focused rerun of `testRepoContextIsVisibleAcrossPrimaryTabs` reproduced the same failure.
- The Active tab renders `repo-context-filter-button` and an active session row, but not `repo-context-active`.
- Source inspection shows `SessionListView` passes `showsActiveSummary: false` to `RepoContextStrip`, contradicting the test's expectation.

Because Sessions were explicitly outside T005's allowed files, the right next move is a narrow Worker package that fixes the Active-tab repo context surface and reruns the focused and broad UI verification before PR/session parity work.

## Parallelization Decision

Do not fan out T006/T007/T008 yet. The root worktree is still dirty, several queued scopes overlap shared Swift and UI-test files, and the broad UI verifier is currently blocked by a deterministic Sessions issue. Run one Worker in the current root.

## Next Worker Package

Activate T010: restore Active-tab active repo context summary.

Allowed files:

- `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- `apple/IssueCTLUITests/IssueCTLUITests.swift`
- `docs/goals/ios-workbench-automation-parity/notes/T010-active-repo-context.md`
- `docs/goals/ios-workbench-automation-parity/state.yaml`

Verification:

- `git diff --check`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLUITests/IssueCTLUITests/testRepoContextIsVisibleAcrossPrimaryTabs`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLUITests/IssueCTLUITests/testIssuesBoardSectionIsReachable`
- Run the full `IssueCTLUITests` suite if the focused tests pass, because T005's broad verifier was the thing this worker is unlocking.

Stop if:

- The fix requires shared model/API changes.
- The failure is caused by test server data instead of the Sessions view.
- A second unrelated UI failure appears in the full suite and cannot be isolated with a focused rerun.

## Full Outcome

Not complete. T006 PR automation/session parity, T007 repo automation health, T008 diagnostics, and T999 final audit remain queued.
