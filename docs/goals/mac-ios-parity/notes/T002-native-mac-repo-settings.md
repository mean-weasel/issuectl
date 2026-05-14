# T002 Worker Receipt: Native Mac Repository Settings

## Result

Implemented the first Phase 1 slice and opened draft child PR #423.

PR: https://github.com/mean-weasel/issuectl/pull/423

Branch: `mac-parity-phase-1-repos`

Base: `mac-sidebar-spaces-option-a`

Commit: see current PR head; the receipt commit updates board state and therefore changes the branch SHA.

## Changed Files

- `apple/IssueCTLMac/Views/MacSettingsView.swift`
- `apple/IssueCTLMac/Views/MacIssueFilterState.swift`
- `apple/IssueCTLMacTests/MacIssueFilterStateTests.swift`
- `apple/IssueCTLUITests/Helpers/MockServer.swift`

## Acceptance Criteria Evidence

- Manual add: `MacAddRepoSheet` parses `owner/name` with `MacRepoNameInput` and calls `api.addRepo(owner:name:)`.
- Local validation: `MacRepoNameInput` rejects malformed inputs in `IssueCTLMacTests`.
- Browse add: `MacAddRepoSheet` loads `api.githubRepos(refresh:)`, supports search/refresh, and disables already tracked repos.
- Edit: `MacEditRepoSheet` persists local path and branch pattern via `api.updateRepo`.
- Remove: `MacSettingsRepoRow` exposes remove, `MacSettingsView` confirms before calling `api.removeRepo`.
- Sidebar filters: after add/edit/remove, settings refreshes `SpaceSidebarCoordinator.store` and re-runs each learned Desktop's `MacIssueFilterState.syncRepoSelection(repos:)`.
- Empty/loading/recoverable errors: Mac settings now renders loading, empty, primary error, refresh error, add error, edit error, and browse error states.
- Accessibility identifiers: added identifiers for Mac settings repo controls, add/edit fields, browse controls, and error states.
- Mock API support: `MockIssueCTLServer` now handles `GET /api/v1/repos/github` and `POST /api/v1/repos`.

## Validation

- `git diff --check`: pass.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build`: pass.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests`: pass, 23 tests.
- `pnpm typecheck`: pass.
- `pnpm lint`: pass with pre-existing warnings.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacUITests`: interrupted after no test output for about 60 seconds; this matches the existing accessory/menu-bar automation instability recorded in the plan.

## GitHub CI

`gh pr checks 423` reports no checks on `mac-parity-phase-1-repos`.

## Remaining Risk For Judge

- The implementation is concentrated in `MacSettingsView.swift`; Judge should decide whether to split helper views into dedicated files in a later cleanup PR.
- Full Mac UI automation is not green because the suite hangs before test output; Judge should decide whether local build/unit tests plus documented UI limitation are sufficient for this draft PR, or require a deterministic replacement test before merge.
- Real local dogfood with `issuectl web` has not been performed in this task to avoid mutating the user's actual tracked repository configuration without an explicit dogfood window.
