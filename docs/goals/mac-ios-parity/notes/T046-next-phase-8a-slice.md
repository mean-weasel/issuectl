# T046 Phase 8A Slice Decision

Decision: approved.

Next worker: T047.

Scope: implement the first Phase 8 launch parity slice by adding a Mac launch options sheet and request-construction path. Keep the existing one-click launch behavior intact while allowing explicit launch agent, workspace mode, branch name, selected comments, selected files, preamble, and resume behavior.

Branch strategy:
- integration branch: `mac-sidebar-spaces-option-a`
- worker branch: `mac-parity-phase-8a-launch-options`
- PR base: `mac-sidebar-spaces-option-a`

Excluded follow-up scope:
- Embedded terminal window and terminal controls.
- Active sessions search, repo filters, polling, and terminal preview.
- Dirty worktree backend checks if they require routes not already exposed to the Mac app.

Allowed files:
- `apple/IssueCTLMac/Views/MacIssueDetailView.swift`
- `apple/IssueCTLMac/Views/MacSidebarStore.swift`
- `apple/IssueCTLMac/App/IssueCTLMacApp.swift`
- `apple/IssueCTLMacTests/**`
- `apple/IssueCTLMacUITests/**`
- `docs/goals/mac-ios-parity/**`

Validation:
- `git diff --check`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8a-dd -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8a-dd -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`
- `pnpm typecheck`
- `pnpm lint`
