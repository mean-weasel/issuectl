# T008 Worker Receipt: Automation Label UX

## Result

`done`

## Summary

Implemented the issue auto-launch and PR auto-review label UX in native iOS detail screens. Issue detail now exposes an `issuectl:auto-launch` control, PR detail exposes an `issuectl:auto-review` control, both cards show repo automation state plus webhook health context, and both refresh detail/workbench state after label mutation.

## Implementation Notes

- Added a shared `AutomationLabelStatusCard` and `AutomationLabelKind` so issue and PR automation controls share one visual and behavioral pattern.
- Added issue detail automation state loading from repo settings plus webhook health, then wired the card to `APIClient.toggleLabel`.
- Added PR label decoding to `GitHubPull`, PR detail automation state loading, and the PR card wired to `APIClient.togglePullLabel`.
- Extended UI mocks with automation labels, mutable PR labels, and recorded issue/PR label action payloads.
- Kept webhook health context non-blocking; label controls still render when health fails, with repo automation state as the fallback context.

## Verification

- Red check: `IssueCTLUITests/IssueDetailActionTests/testIssueAutoLaunchLabelControlTogglesAutomationLabel` and `IssueCTLUITests/PRBrowseTests/testPRAutoReviewLabelControlTogglesAutomationLabel` failed before implementation because `issue-auto-launch-label-button` and `pr-auto-review-label-button` were missing.
- `git diff --check` passed.
- The two automation-label UI tests passed after implementation.
- Focused regression passed: `IssueDetailActionTests/testIssueAutoLaunchLabelControlTogglesAutomationLabel`, `PRBrowseTests/testPRAutoReviewLabelControlTogglesAutomationLabel`, `PRBrowseTests/testPRDetailShowsChecksAndBranchInfo`, `ModelDecodingTests/testPullDetailResponseDecoding`, `APIClientExtensionTests/testTogglePullLabelUsesPullLabelEndpoint`, and `APIClientExtensionTests/testToggleLabelBodyEncoding`: 6 tests, 0 failures.

## Remaining Risk

The full `IssueCTL` scheme and web `pnpm` verification remain deferred to final audit/CI because broad local runs have been blocked by simulator timeout/CoreSimulator instability and fresh-checkout JS dependency gaps. This slice did not add new web routes; it uses the REST shims verified in T003.

## Next Task

Activate `T009` Judge for the final parity audit against the original plan and all receipts.
