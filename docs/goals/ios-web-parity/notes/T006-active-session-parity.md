# T006 Worker Receipt: Active Session Parity

## Result

`done`

## Summary

Completed the target-aware active-session slice for issue and PR deployments. PR sessions now present as PR sessions, route to PR detail from the controls sheet, keep terminal titles target-aware, and use target-aware end-session request bodies from both the Active tab and terminal surface.

## Implementation Notes

- Added PR navigation from `SessionListView` by registering `PRDestination` and routing non-issue deployments to `PRDetailView` instead of disabling the target action.
- Made the session controls sheet target-aware: the title uses `targetLabel`, issue sessions offer `View Issue`, PR sessions offer `View Pull Request`, and both actions have stable UI identifiers.
- Updated terminal titles to use `deployment.targetTitle`, so PR terminal sessions no longer display issue-style numbering.
- Kept end-session calls wired through `deployment.targetType` and `deployment.targetNumber` from both Active-tab controls and `TerminalView`.
- Extended the UI mock server with PR deployment fixtures, dynamic deployment-end handling, recorded end-session payloads, and target-aware session preview text.

## Verification

- Red check: `IssueCTLUITests/IssueCTLUITests/testPullRequestSessionControlsOpenPullRequestDetail` failed before implementation because `session-target-action-9507` was missing and the PR action was disabled.
- `git diff --check` passed.
- `IssueCTLUITests/IssueCTLUITests/testPullRequestSessionControlsOpenPullRequestDetail` and `IssueCTLUITests/IssueCTLUITests/testEndingPullRequestSessionSendsTargetAwareBody` passed: 2 tests, 0 failures.
- Focused regression passed: `IssueCTLTests/EnumTests/testEndSessionRequestBodyIncludesTargetFields`, `IssueCTLTests/ModelDecodingTests/testActiveDeploymentDecodesPrTargetWithoutIssueNumber`, `IssueCTLTests/ModelDecodingTests/testActiveDeploymentsResponseDecoding`, the two new PR session UI tests, `IssueCTLUITests/IssueCTLUITests/testLaunchingIssueCanBeReenteredFromActiveSessions`, `IssueCTLUITests/IssueCTLUITests/testRunningIssueDetailShowsReentryInsteadOfLaunch`, `IssueCTLUITests/SessionManagementTests/testEndSessionFromActiveTab`, and `IssueCTLUITests/SessionManagementTests/testIdleSessionsSortToTop`: 9 tests, 0 failures.

## Remaining Risk

The full `IssueCTL` scheme was not rerun in this slice because the prior full-scheme attempts were environment-limited by MCP timeout/CoreSimulator service instability. Focused target-aware session behavior is covered, and final PR readiness should still include a full scheme or CI run once the simulator service is stable.

Repo automation settings, webhook health controls, and label automation UX remain queued for T007/T008.

## Next Task

Activate `T007` to implement repo automation settings, webhook health, webhook controls, and label health actions in iOS settings.
