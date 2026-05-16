# T037 Phase 7 First Slice Decision

## Decision

`approved`.

Implement Phase 7A as a child PR: Mac pull-request browse plus read-only detail.

This is the largest safe first Phase 7 slice because it establishes the missing Mac PR surface, validates shared PR list/detail APIs, and creates deterministic fixture coverage without also introducing mutating review/merge/comment failure-state complexity.

## Evidence

- iOS PR surface exists in `apple/IssueCTL/Views/PullRequests/PRListView.swift`, `PRDetailView.swift`, `PRRowView.swift`, `CommentSheet.swift`, and `RequestChangesSheet.swift`.
- Shared models and APIs already exist in `apple/IssueCTLShared/Models/PullRequest.swift` and `apple/IssueCTLShared/Services/APIClient.swift`.
- Mac currently has no PR sidebar section; it only renders linked PRs inside issue detail.
- Mac sidebar patterns already exist for sections, list projection, filters, pagination, fixture endpoints, and UI smoke tests.

## First Worker Slice

Implement a Mac `PRs` sidebar section with:

- Review/Open/Merged/Closed PR sections matching iOS semantics.
- Per-repo loading for tracked repositories using `api.pulls`.
- Repo filter, search, mine filter, Updated/Created sort, reset, section counts, filter summary, and load-more pagination.
- Read-only PR detail using `api.pullDetail`, showing title/body/metadata, author, head/base, checks, changed files, reviews, linked issue, and open-on-GitHub.
- Deterministic Mac fixture routes for PR list and PR detail.

## Explicitly Excluded

- Merge strategies.
- Approve.
- Request changes.
- Comment on PR.
- Linked issue deep navigation from PR detail back to Mac issue detail.
- Offline queue behavior beyond showing cached indicators if existing shared API state makes it straightforward.

Those excluded mutating/navigational actions should be sized as the next Phase 7 slice after the read-only PR surface is merged.

## Worker Plan

- Branch: `mac-parity-phase-7a-pr-browse`
- Base: `mac-sidebar-spaces-option-a`
- PR: open draft early before implementation.
- Merge gate: GitHub checks green, or if no checks are configured, complete local validation recorded in the receipt.

## Allowed Files

- `apple/IssueCTLMac/Views/MacSidebarRootView.swift`
- `apple/IssueCTLMac/Views/MacSidebarStore.swift`
- `apple/IssueCTLMac/Views/MacPullRequestsView.swift`
- `apple/IssueCTLMac/App/IssueCTLMacApp.swift`
- `apple/IssueCTLMacTests/**`
- `apple/IssueCTLMacUITests/**`
- `apple/IssueCTL.xcodeproj/project.pbxproj`
- `docs/goals/mac-ios-parity/**`

## Required Acceptance

- Mac sidebar exposes a `PRs` section in expanded and collapsed sidebar modes.
- User can browse PRs from tracked repos and section counts match deterministic fixture data.
- Review section contains open PRs with failing or pending checks, matching iOS `needsReviewAttention`.
- Search, repo filter, mine filter, sort, reset, and pagination behave deterministically.
- User can open PR detail and inspect checks, changed files, linked issue, reviews, and body content.
- Failed PR list/detail loads show recoverable errors and preserve the selected PR filters.

## Required Validation

- `git diff --check`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLTests/APIClientExtensionTests`
- `pnpm typecheck`
- `pnpm lint`

## Stop Conditions

- Shared PR list/detail API contract cannot support the Mac read-only surface without backend changes.
- Xcode project structure requires files outside allowed scope.
- Deterministic PR fixture data cannot represent review/open/merged/closed sections.
- Local validation fails twice for the same unexplained reason.
