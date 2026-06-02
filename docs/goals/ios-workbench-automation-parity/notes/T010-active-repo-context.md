# T010 Active Repo Context Receipt

## Result

Restored the Active tab repo-context summary by deriving active repo full names from active deployments and passing them into `RepoContextStrip`.

## Changed files

- `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- `docs/goals/ios-workbench-automation-parity/notes/T010-active-repo-context.md`
- `docs/goals/ios-workbench-automation-parity/state.yaml`

## Verification

- `git diff --check`: passed.
- Focused repo-context UI test: passed.
- Focused Board UI smoke: passed.
- Full `IssueCTLUITests` suite: passed, 17 tests and 0 failures.
- Direct inspection confirmed `SessionListView` now computes `activeRepoFullNames` and supplies them to `RepoContextStrip`.

## Strongest disproof

The strongest realistic failure mode was that the broad iOS UI suite would still fail outside the focused repo-context test after the Active-tab chip was restored. I reran the full `IssueCTLUITests` target on iPhone 17; it completed with 17 tests and 0 failures.
