# T068 Phase 11 Today Decision

Date: 2026-05-14

## Decision

Decision: `staged_compact_first`

Full outcome complete: `false`

## Rationale

The Mac app should get a sidebar-native `Today`/attention surface first, not a separate full iOS-style Today window.

Evidence:

- The Mac app is intentionally a menu-bar/sidebar client with fast per-Desktop access.
- Existing Mac sections already cover Issues, PRs, Drafts, and Active sessions.
- iOS Today is a dashboard over issues, PRs, active sessions, metrics, search, and quick create.
- A compact sidebar section can close the immediate work-queue gap while reusing the Mac issue detail sheet, PR detail sheet, session open/end behavior, and direct issue creation sheet.
- A separate full Today window can remain a future enhancement if the compact surface proves too cramped during dogfood.

## Selected Worker

Worker: `T069`

Selected slice: Phase 11A compact Mac Today / Attention sidebar section.

## Scope

Add a first-class `Today` section to the Mac sidebar that provides:

- Metrics for active sessions, review-needed PRs, and assigned/open issues.
- A compact attention queue containing review-needed PRs, assigned/blocking issues, and active sessions.
- A global search field over loaded Today issues and PRs.
- Row actions that open existing Mac issue/PR detail surfaces and active session terminals.
- A quick create button that opens the existing direct issue creation flow.
- Cached/offline indicators based on issue, PR, and session response metadata.

Non-goals for this slice:

- Do not add a separate full Today window.
- Do not duplicate full iOS Today visual layout.
- Do not add new backend endpoints.
- Do not change notification or offline queue behavior.

## Allowed Files

- `apple/IssueCTLMac/Views/MacSidebarRootView.swift`
- `apple/IssueCTLMac/Views/MacSidebarStore.swift`
- `apple/IssueCTLMac/Views/MacDraftsView.swift`
- `apple/IssueCTLMac/Views/MacTodayView.swift`
- `apple/IssueCTLMacTests/**`
- `apple/IssueCTLMacUITests/**`
- `apple/IssueCTLMac/App/IssueCTLMacApp.swift`
- `apple/IssueCTL.xcodeproj/project.pbxproj`
- `docs/goals/mac-ios-parity/**`

## Acceptance Criteria

- Mac sidebar has a `Today` section in expanded and collapsed section controls.
- User can see active-session, review-needed PR, and assigned/open issue counts from Mac without opening iOS or web.
- Attention rows include at least one review-needed PR, one assigned/blocking issue when fixture data provides it, and one active session when present.
- Row actions open the existing Mac PR detail, issue detail, or session terminal/open behavior.
- Search filters matching issues and PRs by title/body/repo/number and preserves row navigation.
- Quick create opens the existing Mac direct issue creation flow and refreshes Today data after success.
- Cached/offline indicators reflect the underlying issue, PR, or session response cache metadata.
- The implementation reuses existing Mac detail/create surfaces instead of creating incompatible duplicates.

## Validation

- `git diff --check`
- `pnpm typecheck`
- `pnpm lint`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase11a-mac -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase11a-mac -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testTodayAttentionSectionShowsMetricsSearchAndNavigation`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase11a-mac -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testTodayQuickCreateOpensDirectIssueFlow`

## Stop Conditions

- Adding the section requires rewriting sidebar navigation or per-Desktop state.
- Reusing the direct issue creation sheet requires a broad extraction beyond a small access-level change.
- Stable UI navigation cannot be tested without brittle menu-bar automation.
- The fixture server lacks enough issue/PR/session data and cannot be extended inside the allowed file set.
