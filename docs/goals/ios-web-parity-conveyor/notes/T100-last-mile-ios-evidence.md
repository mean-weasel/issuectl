# T100 Last-Mile iOS Evidence

Date: 2026-06-02

## Scope

Recorded evidence for the fresh-worktree iOS last-mile parity pass on branch `codex/ios-web-parity-analysis-20260602`.

This pass was Apple-only. No web/API package files changed, so the web checks from the plan were intentionally skipped.

## Verification

- PASS `IssueCTLTests`: 332 tests, 0 failures.
- PASS `IssueCTLPreviewUITests/IssueCTLUITests`: 26 tests, 0 failures.
- PASS `IssueCTLPreviewUITests/SessionManagementTests`: 9 tests, 0 failures.
- PASS `IssueCTLPreviewUITests/PRBrowseTests`: 5 tests, 0 failures.
- PASS `IssueCTLPreviewUITests/IssueDetailActionTests`: 8 tests, 0 failures.
- PASS `IssueCTLTests/APIClientTests`: 32 tests, 0 failures.
- PASS `IssueCTLTests/APIClientExtensionTests`: 46 tests, 0 failures.

## Workflow Evidence

- Cross-repo Board route context: `ViewLogicTests/testAppRouteParsesWorkbenchIssueQuery`, `ViewLogicTests/testAppRouteParsesWorkbenchDeploymentQuery`, `WorkbenchStoreTests/testBoardRouteSelectsRepoAndIssueFilter`, and `WorkbenchStoreTests/testBoardRouteCanFocusIssueByDeployment`.
- Issue auto-launch label evidence: `IssueDetailActionTests/testIssueAutoLaunchLabelControlTogglesAutomationLabel` verifies the label control reaches the issue detail surface and shows automation evidence after toggling.
- PR auto-review label evidence: `PRBrowseTests/testPRAutoReviewLabelControlTogglesAutomationLabel` verifies the PR label control reaches the PR detail surface and shows automation/review evidence after toggling.
- Review-run write-action clarity: `SessionManagementTests/testReviewDetailExplainsDisabledMobileActionsWithWebFallback` and `SessionManagementTests/testReviewDetailRetryActionSubmitsWhenMobileActionsEnabled`.
- PTY bridge handoff: `SessionManagementTests/testPtyBridgeSessionOffersWebWorkbenchHandoff` verifies PTY bridge sessions offer the web workbench handoff, while existing terminal tests keep native ttyd re-entry covered.
- Automation activity outside Settings: `IssueCTLUITests/testAutomationFeedIsReachableFromTodayAndActiveTabs` and `SessionManagementTests/testSessionControlsOpenTargetAutomationActivity`.

## Notes

- `IssueCTLUITests`, `SessionManagementTests`, and `IssueDetailActionTests` exceeded the 120 second MCP call window, but their underlying `xcodebuild` processes completed successfully and were verified from their `.xcresult` bundles.
- Xcode regenerated `apple/IssueCTL/Generated/AppVersion.swift` during verification; it was restored to the repository baseline after the test runs.
