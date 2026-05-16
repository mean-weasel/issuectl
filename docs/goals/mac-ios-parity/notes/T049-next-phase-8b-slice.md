# T049 Next Phase 8B Slice

Result: done.

Decision: approved.

Next worker: T050.

Scope: implement Active Sessions parity before embedded terminal work. This slice should add search, repo filtering, terminal status previews, polling, view-issue navigation, open-terminal behavior through the existing `ensure-ttyd` path, and end-session recovery.

Branch strategy:

- Integration branch: `mac-sidebar-spaces-option-a`
- Worker branch: `mac-parity-phase-8b-sessions`
- Worker PR base: `mac-sidebar-spaces-option-a`

Rationale:

- Phase 8A already covered launch options and request construction.
- Active-session list parity is independently useful and maps to several Phase 8 acceptance criteria.
- Embedded terminal/WKWebView work has different UI risk and should remain a follow-up slice.

Excluded from T050:

- Embedded terminal window/WKWebView and terminal text-size controls.
- Dirty worktree readiness matrix.
- Explicit ttyd respawn controls beyond the existing `ensure-ttyd` behavior used by Open Terminal.

Verification for T050:

- `git diff --check`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8b-dd -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8b-dd -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`
- `pnpm typecheck`
- `pnpm lint`
