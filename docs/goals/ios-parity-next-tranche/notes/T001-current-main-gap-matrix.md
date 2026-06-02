# T001 Current Main Gap Matrix

## Baseline

- Worktree: `/Users/neonwatty/Desktop/issuectl/.worktrees/ios-web-parity-plan-20260601`
- Branch: `codex/ios-web-parity-plan-20260601`
- HEAD: `86248bc06cdae7725673b41960a2e66c264b94a5`
- HEAD summary: `86248bc Merge pull request #582 from mean-weasel/codex/ios-workbench-api-parity-20260531`
- `git merge-base --is-ancestor HEAD origin/main`: pass
- Dirty status: only setup artifacts are untracked: `docs/goals/ios-parity-next-tranche/` and `docs/superpowers/plans/2026-06-01-ios-web-parity-next-tranche.md`
- Verification setup: `pnpm` is available at `9.15.4`, but neither root `node_modules` nor `packages/web/node_modules` exists in this fresh worktree.

## Already Satisfied On Current Main

- Workbench API and payload:
  - `packages/web/app/api/v1/workbench/route.ts` returns `getWorkbenchPayload()`.
  - `apple/IssueCTLShared/Services/APIClient.swift` has `workbench(refresh:maxAge:)`.
  - `apple/IssueCTLShared/Models/Repo.swift` has `WorkbenchPayload` and `WorkbenchRepo`.
- Native iOS Board:
  - `apple/IssueCTL/Views/Workbench/BoardView.swift` renders the Board tab from `WorkbenchStore`.
  - `apple/IssueCTL/ViewModels/WorkbenchStore.swift` computes draft/open/running/closed board counts and visible issues.
- Repo automation settings:
  - `apple/IssueCTLShared/Models/Repo.swift` decodes `autoLaunchIssues`, `autoReviewPrs`, agent fields, webhook fields, payload mode, and review preamble.
  - `apple/IssueCTLShared/Services/APIClient+Settings.swift` sends the repo automation update fields.
  - `apple/IssueCTL/Views/Settings/EditRepoSheet.swift` exposes automation toggles and webhook controls.
- Sessions, diagnostics, and PR review runs:
  - `apple/IssueCTLShared/Models/Repo.swift` has `SessionsOverviewResponse`, review run models, and diagnostics payloads.
  - `apple/IssueCTLShared/Services/APIClient.swift` has sessions overview, webhook events, review runs, review actions, and diagnostics client calls.
  - `apple/IssueCTL/Views/Sessions/SessionListView.swift` shows sessions, reviews, diagnostics, terminals, and review details.
- Automation feeds:
  - `apple/IssueCTL/Views/Settings/AutomationFeedView.swift` provides the global automation feed.
  - `apple/IssueCTL/Views/Settings/RepoAutomationActivityView.swift` provides repo-scoped automation activity.
- Web current behavior:
  - `packages/web/components/workbench/WorkbenchShell.tsx` has Issues, Board, PRs, Workbench, Quick Create, and Settings modes.
  - `packages/web/components/workbench/BoardFocus.tsx` provides the web cross-repo board with running-only and sort controls.
  - `packages/web/app/api/v1/settings/route.ts` allows `public_webhook_base_url`.
  - `packages/web/lib/webhook-health.ts` can return webhook health states `ok`, `warning`, `error`, or `unknown`.

## Real Remaining Gaps

1. Board route context is parsed but dropped:
   - `apple/IssueCTL/Services/SetupLink.swift` parses `.board(repoFullName:deploymentId:)`.
   - `apple/IssueCTL/App/ContentView.swift` handles `.board` by selecting the Board tab and setting `pendingRoute = nil`.
   - `apple/IssueCTL/Views/Workbench/BoardView.swift` has no route binding and no deployment/repo focus helper.
2. Sessions and review route context is parsed but dropped:
   - `SetupLink.swift` parses `.sessions(repoFullName:)` and `.review(id:)`.
   - `ContentView.swift` selects the Active tab but sets `pendingRoute = nil`.
   - `SessionListView.swift` has no route binding and no route consumer for repo filters or review detail.
3. Public webhook base URL is not editable in iOS:
   - `packages/web/app/api/v1/settings/route.ts` allows `public_webhook_base_url`.
   - `apple/IssueCTLShared/Services/APIClient+AdvancedSettings.swift` can PATCH arbitrary settings keys.
   - `apple/IssueCTL/Views/Settings/AdvancedSettingsView.swift` omits `public_webhook_base_url` from state, editable fields, load, and form UI.
4. Webhook health `unknown` is not distinct in iOS:
   - `packages/web/lib/webhook-health.ts` declares `unknown`.
   - `apple/IssueCTLShared/Models/Repo.swift` stores `WebhookAutomationHealth.state` as `String`.
   - `EditRepoSheet.swift` maps all non-`ok` states to the same warning icon and orange tint.
5. Stream refreshes are uncoalesced:
   - `SessionListView.streamSessionUpdates()` calls `load(includeRepos:false)` on every websocket message.
   - Automation feed views have similar refresh-on-message patterns.
6. Today/Issues first-read consistency remains a conditional follow-up:
   - Board uses `/api/v1/workbench`.
   - Today and Issues still have their own read paths.
   - This should only be implemented if it fits existing view-model boundaries without creating a new app-wide state container.
7. Cleanup should be precise:
   - The prior plan mentioned an obsolete automation-list endpoint comment, but current source shows a diagnostics dependency comment in `APIClient.deploymentDiagnostics` and a user-facing fallback string in `SessionListView`.
   - Because current main now has diagnostics routes, cleanup can update that wording, but it should not remove useful fallback behavior for older servers.

## Not This Tranche

- Replacing the web Workbench shell.
- Rewriting iOS Board into the web horizontal column layout.
- Adding new webhook server behavior.
- Implementing automatic issue-to-PR-to-review chaining.
- Exposing terminal backend override in iOS without an owner product decision; web restricts it to approved test repos.
- Building target-wide standalone diagnostics outside the existing sessions overview/diagnostics surfaces.

## Recommended First Vertical Slice

Pick route-focus parity first. It is the largest safe user-visible slice with bounded files:

- `apple/IssueCTL/App/ContentView.swift`
- `apple/IssueCTL/Views/Workbench/BoardView.swift`
- `apple/IssueCTL/ViewModels/WorkbenchStore.swift`
- `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- `apple/IssueCTLTests/ViewLogicTests.swift`
- `apple/IssueCTLTests/WorkbenchStoreTests.swift`

Focused verification:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/ViewLogicTests \
  -only-testing:IssueCTLTests/WorkbenchStoreTests \
  -quiet
```

Manual/simulator proof should later open:

```bash
xcrun simctl openurl booted "issuectl://workbench?repo=org%2Fapp&deployment=42"
xcrun simctl openurl booted "issuectl://sessions?repo=org%2Fapp"
xcrun simctl openurl booted "issuectl://reviews/16"
```
