# T055 Judge Receipt: Phase 8D Terminal Window Slice

Date: 2026-05-14

## Decision

Approved next worker slice: Phase 8D Embedded Mac Terminal Window.

The next safe slice should close the remaining terminal-window portion of Phase 8 rather than introduce a prerequisite. The current Mac app already has enough supporting infrastructure to keep this PR bounded:

- `MacSidebarStore.terminalAccess(api:session:)` calls `ensureTtyd`, handles unavailable terminal responses, and builds the authenticated terminal URL with `terminalToken`.
- Issue detail and Active Sessions already know how to find active deployments and request terminal access.
- Active Sessions already displays duration, status, previews, repo filters, view issue, open terminal, end session, and polling.
- Fixture routes already cover `ensure-ttyd` for active deployments and support a respawn environment toggle.

The gap is that Mac still opens the terminal externally and does not provide an embedded native terminal surface with reconnect/respawn, text-size, duration, and end-session controls.

## Worker Slice

Task ID: T056

Objective: Implement Phase 8D embedded terminal parity for the Mac app. Opening a terminal from issue detail or Active Sessions should present a native Mac embedded terminal surface backed by the existing `ensureTtyd` token URL. The surface must include terminal loading/error states, text-size control, reconnect/respawn action, visible session duration, and end-session control.

Branch strategy:

- Integration branch: `mac-sidebar-spaces-option-a`
- Worker branch: `mac-parity-phase-8d-terminal-window`
- PR base: `mac-sidebar-spaces-option-a`

Allowed files:

- `apple/IssueCTLMac/Views/MacIssueDetailView.swift`
- `apple/IssueCTLMac/Views/MacSessionsView.swift`
- `apple/IssueCTLMac/Views/MacSidebarStore.swift`
- `apple/IssueCTLMac/App/IssueCTLMacApp.swift`
- `apple/IssueCTLMacTests/**`
- `apple/IssueCTLMacUITests/**`
- `apple/IssueCTLShared/Services/APIClient+AdvancedSettings.swift` only if terminal access metadata must be extended
- `apple/IssueCTL.xcodeproj/project.pbxproj` only if a new Swift source file is required
- `docs/goals/mac-ios-parity/**`

## Acceptance Criteria

- Issue detail opens an embedded Mac terminal surface for an active session without relying on the default browser.
- Active Sessions opens the same embedded terminal surface for a ready session.
- The embedded terminal uses `ensure-ttyd` and the authenticated token URL currently produced by the shared Mac store path.
- Terminal access shows progress while loading and a recoverable error if `ensure-ttyd` fails or returns unavailable.
- Reconnect/respawn re-runs `ensure-ttyd`, refreshes the embedded terminal URL, and surfaces whether the terminal was respawned.
- Text-size control updates the embedded terminal configuration and is covered by a deterministic test. Persist it if an existing Mac preferences path is available without broadening the slice; otherwise record persistence as follow-up.
- Session duration is visible inside the terminal surface.
- End Session is available inside the terminal surface, calls the existing end-session API, removes or refreshes the ended session, and closes or updates the terminal surface predictably.
- Existing external terminal URL construction remains covered at the store level even though the primary Mac UI path becomes embedded.
- Existing launch, readiness, Active Sessions filtering, and end-session behavior remain intact.

## Required Validation

- `git diff --check`
- `pnpm typecheck`
- `pnpm lint`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8d-terminal -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8d-terminal -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`

The UI smoke suite should include fixture-backed coverage for opening the embedded terminal from Active Sessions, reconnect/respawn, changing text size, visible duration, ending a session from the terminal surface, and terminal access failure recovery.

## Dogfood Evidence Required Before Merge

- Launch an issue in clone mode and open the embedded terminal.
- Launch an issue in worktree mode and open the embedded terminal.
- Trigger reconnect/respawn and verify the terminal surface updates.
- Change terminal text size and verify the embedded terminal remains usable.
- End the session from the embedded terminal surface.
- Relaunch or open an existing session and verify the embedded path still works.

## Excluded Follow-Up Scope

- Offline/cache behavior beyond existing Active Sessions cache banner.
- Notifications, Today extension parity, or widget behavior.
- Per-Space desktop filter behavior.
- Backend changes beyond fixture routes needed for deterministic Mac tests.
- A custom terminal emulator; embedding the authenticated ttyd web terminal is sufficient for this slice.
