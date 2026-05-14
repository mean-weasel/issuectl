# T050 Phase 8B Active Sessions

## Result

Implemented Phase 8B Active Sessions parity on `mac-parity-phase-8b-sessions` for draft PR #438 into `mac-sidebar-spaces-option-a`.

## Product Changes

- Added a Mac Active Sessions projection that filters deterministically by selected repos and search text.
- Search covers repo full name, issue number, branch, workspace path, workspace mode, terminal preview status, latest terminal line, and preview lines.
- Made repository filters visible by default in Active Sessions so filtering is discoverable without opening settings.
- Added terminal preview state to `MacSidebarStore` and refreshes `/api/v1/sessions/previews` after initial load and session refresh.
- Added polling from the Active Sessions view so started, ended, and ready-state changes are refreshed while the view is mounted.
- Added row actions for viewing the associated issue, opening the terminal through `ensure-ttyd`, and ending a session.
- Added recoverable error handling for preview loading, terminal open, refresh, and end-session failures.
- Extended Mac UI fixtures with active session deployments, terminal preview data, `ensure-ttyd`, end-session success/failure, and running issue detail endpoints.

## Acceptance Evidence

- `MacSessionListProjection` unit coverage confirms repo filtering and search by repo, branch, issue number, workspace path, and preview text.
- UI coverage confirms:
  - Session preview text is rendered.
  - Search filters to a preview line.
  - Repository filter hides/shows sessions.
  - View Issue opens the matching issue detail.
  - Open Terminal calls `ensure-ttyd` and reports the port.
  - End Session removes the ended row.
  - End Session failure keeps the row visible and shows an error.

## Validation

- PASS: `git diff --check`
- PASS: `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8b-dd -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`
  - 22 tests passed.
- PASS: `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8b-dd -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`
  - 29 tests passed.
- PASS: `pnpm typecheck`
- PASS: `pnpm lint`
  - Existing warnings only; no lint errors.

## Residual Scope

- Embedded terminal WKWebView and terminal text-size controls remain excluded from this slice per T049.
- Dirty worktree readiness matrix remains excluded from this slice per T049.
- PR #438 still needs push, ready-for-review transition, check inspection, and merge or accepted no-check replacement validation.
