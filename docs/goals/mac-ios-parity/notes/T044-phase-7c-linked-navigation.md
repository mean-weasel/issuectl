# T044 Phase 7C Linked Navigation Receipt

Result: done.

PR: https://github.com/mean-weasel/issuectl/pull/436

Implemented:
- Mac issue detail linked PR rows now open the Mac PR detail sheet for the linked PR.
- Mac PR detail linked issue rows now open the Mac issue detail sheet for the linked issue.
- Linked navigation preserves the current repo context.
- The Mac UI fixture now serves linked PR #7 detail.
- `MacSidebarSmokeTests` covers both linked navigation directions.

Validation:
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase7c-dd -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testLinkedIssueAndPullRequestDetailNavigation` passed, 1 test.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase7c-dd -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests` passed, 25 tests.
- `git diff --check` passed.
- `pnpm typecheck` passed.
- `pnpm lint` passed with existing warnings only.

Notes:
- During UI test development, nested detail sheets opened far enough to the right that close buttons were not reliably hittable on this display. The test now dismisses nested sheets via Escape, matching the existing PR detail cancel shortcut and avoiding coordinate-sensitive clicks.
