# T001 Board Validation

Date: 2026-05-15T14:51:37Z

Decision: approved.

The board is valid for execution. The first implementation slice should remain the highest-impact sidebar filter simplification because it directly addresses the user's stated example and has a narrow file scope.

Branch strategy:

- Integration branch: `mac-sidebar-spaces-option-a`
- First worker branch: create from current integration branch when ready to commit, suggested `mac-ux-sidebar-filter-tray`
- PR base: `mac-sidebar-spaces-option-a`
- Open a draft PR early after the first coherent commit, with T002 acceptance criteria in the PR body.

Existing dirty work to preserve:

- `apple/IssueCTLMac/Views/MacSettingsView.swift`
- `apple/IssueCTLMacUITests/MacSidebarSmokeTests.swift`

These changes are the already-reviewed Add Repository browse UX/performance fix. T002 may need to edit `MacSidebarSmokeTests.swift`; it must work with the existing edits and not revert them.

T002 objective:

Simplify sidebar filters across Issues and Pull Requests by keeping search visible, moving secondary filters into collapsible filter groups, keeping Repositories as a separate collapsed disclosure, and preserving per-desktop issue filter behavior.

Allowed files for T002:

- `apple/IssueCTLMac/Views/MacIssuesView.swift`
- `apple/IssueCTLMac/Views/MacPullRequestsView.swift`
- `apple/IssueCTLMac/Views/MacIssueFilterState.swift`
- `apple/IssueCTLMac/Platform/MacSidebarPreferences.swift`
- `apple/IssueCTLMacTests/**`
- `apple/IssueCTLMacUITests/**`
- `docs/goals/mac-ux-cleanup/**`

Verification commands for T002:

```bash
git diff --check
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' build
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' -only-testing:IssueCTLMacTests test
pkill -f IssueCTLMac.app/Contents/MacOS/IssueCTLMac || true
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64,id=00008132-001105AE2E99801C' -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testSidebarFiltersCanBeCollapsedAndAdjusted test
```

Stop conditions:

- Shared filter abstraction requires broad rewrites outside the allowed files.
- UI automation cannot initialize after stopping the dogfood app and using the concrete Mac destination.
- Existing per-desktop issue filter tests fail for unclear reasons.
- Existing Add Repository browse changes would need to be reverted or substantially rewritten.
