# T056 Phase 8D Terminal Window Receipt

Date: 2026-05-14

## Result

Implemented Phase 8D embedded Mac terminal parity in draft PR #440:

https://github.com/mean-weasel/issuectl/pull/440

Branch: `mac-parity-phase-8d-terminal-window`
Base: `mac-sidebar-spaces-option-a`

## Scope

- Replaced external browser terminal opening with a native resizable Mac terminal window.
- Opened the terminal window from both issue detail active-session actions and Active Sessions rows.
- Backed the window by existing `ensureTtyd` access, terminal token URL, and end-session APIs.
- Added persisted terminal text size via `@AppStorage("macTerminalFontSize")`.
- Added terminal loading, connected, respawned, error, retry, reconnect, duration, close, and end-session controls.
- Added fixture coverage for terminal failure and respawn paths.
- Added UI coverage for connected, respawned, failure/retry, text-size control, and end-session behavior.

## Changed Files

- `apple/IssueCTLMac/App/IssueCTLMacApp.swift`
- `apple/IssueCTLMac/Views/MacIssueDetailView.swift`
- `apple/IssueCTLMac/Views/MacSessionsView.swift`
- `apple/IssueCTLMac/Views/MacSidebarStore.swift`
- `apple/IssueCTLMacUITests/MacSidebarSmokeTests.swift`
- `docs/goals/mac-ios-parity/state.yaml`
- `docs/goals/mac-ios-parity/notes/T056-phase-8d-terminal-window.md`

## Acceptance Evidence

- Native embedded terminal surface exists as a Mac `NSWindow` hosting a SwiftUI terminal controller with `WKWebView`.
- Terminal URL includes `terminalToken`, persisted `fontSize`, fixed `lineHeight`, `disableResizeOverlay`, and canvas renderer query parameters.
- Active Sessions terminal flow opens `org/alpha #2 Terminal`, shows connected status, exposes duration and text-size control, reconnects, and can end the session.
- Respawn path shows `Terminal respawned on port 7700`.
- Failure path shows `mac-terminal-error` and `mac-terminal-retry-button`.

## Validation

- `git diff --check`: pass
- `pnpm typecheck`: pass
- `pnpm lint`: pass with pre-existing warnings
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8d-terminal -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`: pass, 22 tests, 0 failures
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8d-terminal -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`: pass, 35 tests, 0 failures

## Residual Gate

T057 owns the PR gate: push the branch, inspect PR #440, check GitHub CI or record no configured checks, dogfood the terminal if possible, mark the PR ready, merge when acceptable, and select the next parity slice.
