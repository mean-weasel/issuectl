# T038 Phase 7A PR Browse Implementation

## Result

Implemented the first Phase 7 Mac pull-request slice on `mac-parity-phase-7a-pr-browse` with draft PR #434 targeting `mac-sidebar-spaces-option-a`.

## Scope

- Added a native Mac `PRs` sidebar section in expanded and collapsed modes.
- Added read-only PR browse UI with Review/Open/Merged/Closed sections.
- Matched iOS review-attention semantics for open PRs with failing or pending checks.
- Added search, repo filter, mine filter, sort, reset, and incremental pagination.
- Added read-only PR detail showing body, checks, changed files, reviews, linked issue, and branch/diff summary.
- Added deterministic Mac UI fixture endpoints for PR list/detail success and failure paths.
- Explicitly excluded merge, approve, request changes, and PR comments from this slice.

## Validation

- `git diff --check` passed.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase7a-dd -only-testing:IssueCTLMacTests/MacIssueFilterStateTests -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testPullRequestListFiltersPaginatesAndOpensDetail -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testPullRequestFailuresAreRecoverableAndPreserveFilters` passed.

## Notes

- The first local `xcodebuild` attempt using the default DerivedData failed while linking the UI test runner because Xcode could not write the existing runner binary. Re-running with isolated DerivedData at `/tmp/issuectl-phase7a-dd` removed the stale artifact and passed.
- UI tests dismiss PR detail with Escape because the sheet Done button can be reported outside the hittable region on the current multi-display/macOS desktop layout.
- Repo filters are expanded by default in the PR surface to make the filter location explicit during dogfood.
