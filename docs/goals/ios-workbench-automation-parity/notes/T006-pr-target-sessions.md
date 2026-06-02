# T006 PR Target Sessions Receipt

## Result

Completed the PR-target active-session parity slice for existing deployments. The iOS session surface now treats active deployments as issue or PR targets, shows PR labels in session rows and controls, guards issue-only navigation for PR sessions, preserves target metadata when ending sessions, and keeps Terminal titles target-aware.

## Changed files

- `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- `apple/IssueCTL/Views/Sessions/SessionRowView.swift`
- `apple/IssueCTL/Views/Terminal/TerminalView.swift`
- `apple/IssueCTLShared/Models/Deployment.swift`
- `apple/IssueCTLShared/Services/APIClient.swift`
- `apple/IssueCTLTests/APIClientExtensionTests.swift`
- `apple/IssueCTLTests/EnumTests.swift`
- `apple/IssueCTLTests/ModelDecodingTests.swift`
- `apple/IssueCTLTests/ViewLogicTests.swift`
- `apple/IssueCTLUITests/Helpers/MockServer.swift`
- `apple/IssueCTLUITests/SessionManagementTests.swift`
- `docs/goals/ios-workbench-automation-parity/notes/T006-pr-target-sessions.md`
- `docs/goals/ios-workbench-automation-parity/state.yaml`

## Verification

- `git diff --check`: passed.
- Focused model/API/view logic tests passed: 162 tests and 0 failures.
- `EnumTests` passed: 29 tests and 0 failures, including `testEndSessionRequestBodyIncludesTargetFields`.
- Focused PR-session UI test passed.
- Full `SessionManagementTests` passed with the new PR case included: 6 tests and 0 failures.
- Model/API/WorkbenchBootstrap mapper verifier passed: 92 tests and 0 failures.
- Direct inspection found target labels in session rows/sheets, issue-only navigation guards, target-aware Terminal title and end-session call sites, and the PR UI fixture.

## Strongest disproof

The strongest realistic failure mode was that model decoding and source inspection would look target-aware while the Active tab still rendered PR sessions as issues. I added a PR-target active deployment UI fixture and a focused UI test that opens the session controls sheet, verifies `PR #44` and `PR #44 Session`, confirms `View Issue` is absent, and confirms the replacement `PR Review` action is disabled. The focused test and the full `SessionManagementTests` suite both passed.
