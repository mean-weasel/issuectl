# T047 Phase 8A Launch Options

Result: done.

Branch: `mac-parity-phase-8a-launch-options`
Base: `mac-sidebar-spaces-option-a`
PR: https://github.com/mean-weasel/issuectl/pull/437

Implemented the first Phase 8 launch parity slice for the Mac app. The issue detail view keeps the existing one-click Launch button and adds a launch options sheet for open issues without active sessions. The sheet lets the user choose agent, workspace mode, branch name, selected comments, referenced files, preamble text, and automatic/resume/reset behavior.

The launch store now accepts optional `MacIssueLaunchOptions`, converts them into the existing shared `LaunchRequestBody`, and still refreshes active sessions before launch so an existing active session is returned instead of creating a duplicate deployment.

Changed files:

- `apple/IssueCTLMac/Views/MacIssueDetailView.swift`
- `apple/IssueCTLMac/Views/MacSidebarStore.swift`
- `apple/IssueCTLMac/App/IssueCTLMacApp.swift`
- `apple/IssueCTLMacTests/MacIssueFilterStateTests.swift`
- `apple/IssueCTLMacUITests/MacSidebarSmokeTests.swift`
- `docs/goals/mac-ios-parity/state.yaml`

Acceptance evidence:

- Existing default Launch path is covered by `testDefaultIssueLaunchUsesExistingOneClickFlow`.
- Custom options request construction is covered by `testCustomIssueLaunchOptionsBuildLaunchRequest`, with the fixture server asserting the posted JSON payload.
- Launch option defaults and request body sorting/fields are covered by `testMacLaunchOptionsDefaultsUseSettingsLocalPathAndGeneratedBranch` and `testMacLaunchOptionsBuildRequestBodyWithExplicitChoices`.
- Active-session duplicate prevention remains in `MacSidebarStore.launchIssue` before request construction.

Validation:

- `git diff --check`: pass.
- `pnpm typecheck`: pass.
- `pnpm lint`: pass with pre-existing warnings.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8a-dd -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`: pass, 21 tests.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase8a-dd -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`: pass, 27 tests.

Excluded follow-up scope:

- Embedded terminal window and controls.
- Active sessions search/repo filters and polling.
- Dirty worktree readiness checks.
