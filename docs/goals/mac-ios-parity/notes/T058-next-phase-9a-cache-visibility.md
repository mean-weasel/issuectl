# T058 Next Slice Decision: Phase 9A Cache Visibility

Date: 2026-05-14

## Decision

`approved`

Select T059 as the next worker task: Phase 9A Mac cache/offline visibility.

## Rationale

Phase 9 is too broad for one PR because it includes visible offline state, cache age, queue persistence, FIFO replay, failure management, settings UI, and dogfood outage tests. The safest next slice is to first expose the cache/offline state that already exists in the shared client and Mac surfaces.

Current state:

- Shared models already expose `fromCache` and `cachedAt` for issues, issue detail, PRs, PR detail, and active deployments.
- `NetworkMonitor` already exists and is wired into the Mac app delegate/coordinator.
- Mac PR list and active sessions already show cached-data banners.
- Mac issue list does not yet surface cached issue responses or cache age.
- Mac issue detail does not yet surface cached detail responses or cache age.
- Offline action queue/replay should stay out of this slice.

## Worker Slice

T059 should implement:

- Network/offline status banner in the Mac sidebar when network/server state indicates offline or unavailable.
- Issue list cached-data banner and cache age using existing `IssuesResponse.fromCache` / `cachedAt`.
- Issue detail cached-data banner and cache age using existing `IssueDetailResponse.fromCache` / `cachedAt`.
- Shared small cache-age formatting helper or local helper with focused tests.
- UI fixture paths for deterministic cached/offline banners if needed.
- UI tests that assert cached/offline indicators without requiring a real outage.

## Excluded Scope

- Offline action queue.
- Queue replay and retry policy.
- Offline queue settings view.
- Notifications.
- Today/Attention surface.
- Backend contract changes unless a minimal fixture-only addition is needed for deterministic Mac tests.

## Branch Strategy

- Integration branch: `mac-sidebar-spaces-option-a`
- Worker branch: `mac-parity-phase-9a-cache-visibility`
- PR base: `mac-sidebar-spaces-option-a`

## Verification

- `git diff --check`
- `pnpm typecheck`
- `pnpm lint`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase9a-cache -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase9a-cache -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`

## Stop Conditions

- Accurate detail/list cache indicators require backend/API contract changes beyond existing `fromCache` / `cachedAt`.
- Network status cannot be observed in the Mac sidebar without broad coordinator changes.
- Offline queue/replay becomes necessary for a coherent user experience in this slice.
- Local validation fails twice for the same unexplained reason.
