# T021 Phase 5 Slice Plan

## Decision

Approved. Phase 5 should be split. One PR for all issue-detail parity rows would mix presentation, comment lifecycle, issue editing, labels, assignees, reassignment, linked context, and image behavior across too many UI paths.

## Next Worker

Implement Phase 5A: Mac issue-detail core actions and context display.

This slice should add:

- Markdown rendering for issue bodies and comments, with a plain-text fallback.
- Render linked pull requests from `IssueDetailResponse.linkedPRs`.
- Render issue deployments/sessions from `IssueDetailResponse.deployments`, opening terminal for active sessions where possible.
- Load current user in the Mac detail surface and permission-gate own-comment edit/delete actions.
- Add an Edit Issue sheet for title/body updates.
- Add Close With Comment behavior while preserving existing close/reopen behavior.
- Add Edit Own Comment and Delete Own Comment actions.
- Refresh detail and sidebar row state after every successful mutation.
- Preserve unsaved sheet input and show recoverable errors on failed mutations.

This slice intentionally defers labels, assignees, reassign, and image lightbox to a follow-up Phase 5B PR because they require separate picker flows and broader cache/list interaction checks.

## Branch And PR

- Base: `mac-sidebar-spaces-option-a`
- Branch: `mac-parity-phase-5a-detail-core-actions`
- PR base: `mac-sidebar-spaces-option-a`
- Open draft PR early with this acceptance map.

## Acceptance Map

- Edit issue: Mac UI can change title/body, sends `PATCH /api/v1/issues/:owner/:repo/:number`, refreshes detail and sidebar row, and keeps input on failure.
- Close with comment: Mac UI can close with an optional comment, sends state body with `comment`, refreshes detail/sidebar counts, and keeps input on failure.
- Own comment edit/delete: current user is loaded; only own comments expose edit/delete; edit sends `PATCH .../comments`; delete sends `DELETE .../comments`; refreshed comments reflect the change.
- Markdown: body and comments render inline markdown/code blocks with fallback plain text on parse failure.
- Linked context: linked PR and deployment/session sections render from detail payload; active terminal-capable sessions expose an Open action.
- Existing actions: existing comment, close/reopen, priority, GitHub link, and launch remain available.

## Allowed Files

- `apple/IssueCTLMac/Views/MacIssueDetailView.swift`
- `apple/IssueCTLMac/Views/MacSidebarStore.swift`
- `apple/IssueCTLMac/App/IssueCTLMacApp.swift`
- `apple/IssueCTLMacTests/**`
- `apple/IssueCTLMacUITests/**`
- `apple/IssueCTLTests/APIClientExtensionTests.swift`
- `docs/goals/mac-ios-parity/**`

If a new Mac-only helper file is needed, stop and add `apple/IssueCTL.xcodeproj/project.pbxproj` to the Worker scope before editing it.

## Verification

- `git diff --check`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -destination 'platform=iOS Simulator,id=002673DD-F669-4F62-A9BB-B5009A96E818' test -only-testing:IssueCTLTests/APIClientExtensionTests`
- `pnpm typecheck`
- `pnpm lint`

## Stop Conditions

- API payloads required by the Mac action UI do not match shared API client methods.
- UI tests cannot deterministically reach detail action controls after one stabilization attempt.
- Implementing labels, assignees, reassign, or image lightbox becomes necessary to keep this PR coherent.
- Any required files fall outside the allowed scope above.
