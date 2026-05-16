# T041 Phase 7B PR Actions

## Result

Implemented Mac PR detail mutating actions for open, unmerged pull requests:

- Comment sheet posts through the shared PR comment endpoint and refreshes the detail surface with a success message.
- Approve posts an `APPROVE` review through the shared PR review endpoint and refreshes review rows.
- Request Changes requires text, posts `REQUEST_CHANGES`, and preserves typed text plus an inline error on failure.
- Merge menu supports merge commit, squash, and rebase methods through the shared PR merge endpoint.
- Merged/closed PR details hide mutating actions after refresh.

## Pull Request

- PR: https://github.com/mean-weasel/issuectl/pull/435
- Branch: `mac-parity-phase-7b-pr-actions`
- Base: `mac-sidebar-spaces-option-a`

## Validation

- `git diff --check` passed.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase7b-dd -only-testing:IssueCTLMacTests/MacIssueFilterStateTests` passed: 19 tests.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase7b-dd -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testPullRequestDetailActionsSucceedAndRefresh -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testPullRequestActionFailurePreservesTypedText` passed: 2 tests.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase7b-dd -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests` passed: 24 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed with existing warnings only.

## Notes

- The Mac UI test fixture now handles PR comment, review, and merge endpoints for `org/alpha#10`, including failure toggles for recoverability coverage.
- The PR action UI remains scoped to the PR detail sheet; list-row actions and linked issue navigation are still excluded from this slice.
