# T001 Scout Receipt: Main Baseline Reconciliation

## Result

`done`

## Main-Based Checkout

- Work root: `/Users/neonwatty/Desktop/issuectl/.worktrees/ios-web-parity-main`
- Branch: `codex/ios-web-parity-main`
- GitHub main ref used: `c309bef6f127d1326810f5d428fd3f28b988c48c`
- Evidence: `git fetch origin main` updated `/Users/neonwatty/Desktop/issuectl` `origin/main` from `24fa9e5` to `c309bef`, then this checkout fetched that remote-tracking ref as `github/main` and switched to `codex/ios-web-parity-main` at the same SHA.
- Current main-based changes are only GoalBuddy/planning artifacts:
  - `docs/goals/ios-web-parity/`
  - `docs/superpowers/plans/2026-05-28-ios-web-parity.md`

GitHub network note: direct clone from `git@github.com:mean-weasel/issuectl.git` failed in this sandbox with DNS resolution failure, but `git fetch origin main` succeeded in the original checkout first. The main-based checkout was therefore made from the fetched GitHub `origin/main` object.

GoalBuddy board note: the static board generated successfully, but starting the local board server failed in this sandbox with `listen EPERM: operation not permitted 127.0.0.1:41737`. `state.yaml` remains authoritative and `visual_board.local.status` is `generated`.

GoalBuddy update check: package `0.3.7`; latest version could not be checked because `npm` timed out in the restricted network environment.

## Baseline Findings

GitHub `main` already contains the major web/core backend foundation:

- Workbench aggregate route and tests:
  - `packages/web/app/api/v1/workbench/route.ts`
  - `packages/web/app/api/v1/workbench/route.test.ts`
  - `packages/web/lib/workbench-data.ts`
  - `packages/web/components/workbench/workbench-types.ts`
- Web workbench UI:
  - `packages/web/app/workbench/**`
  - `packages/web/components/workbench/**`
  - `packages/web/e2e/workbench.spec.ts`
- Webhook automation and PR review backend:
  - `packages/web/lib/github-webhook-handler.ts`
  - `packages/web/lib/webhook-intent-worker.ts`
  - `packages/web/lib/webhook-pr-intent.ts`
  - `packages/web/lib/webhook-pr-launch.ts`
  - `packages/web/lib/webhook-health.ts`
  - matching webhook tests under `packages/web/lib/*.test.ts`
- Core target-aware deployments and webhook schema:
  - `packages/core/src/db/deployments.ts`
  - `packages/core/src/db/webhooks.ts`
  - `packages/core/src/db/webhook-records.ts`
  - `packages/core/src/db/pr-reviews.ts`
  - `packages/core/src/launch/launch.ts`
  - `packages/core/src/launch/workspace.ts`
- Repo automation fields and routes:
  - `packages/core/src/db/repos.ts`
  - `packages/web/app/api/v1/repos/route.ts`
  - `packages/web/app/api/v1/repos/[owner]/[repo]/route.ts`
- Existing mobile-usable repo label recreation route:
  - `packages/web/app/api/v1/repos/[owner]/[repo]/labels/route.ts`

iOS on GitHub `main` is still behind that model:

- `apple/IssueCTL/App/ContentView.swift` has tabs: Today, Issues, PRs, Active. There is no Board tab.
- `apple/IssueCTLShared/Models/Repo.swift` only decodes `id`, `owner`, `name`, `localPath`, `branchPattern`, and `createdAt`; it does not decode repo automation fields.
- `apple/IssueCTLShared/Models/Deployment.swift` only models issue sessions. `ActiveDeployment.issueNumber` is non-optional, there is no `targetType`, no `targetNumber`, no trigger/agent/terminal metadata, and `EndSessionRequestBody` cannot send target fields.
- `apple/IssueCTLShared/Services/APIClient.swift` has no `/api/v1/workbench` method.
- `apple/IssueCTLShared/Services/APIClient+Settings.swift` can add/remove repos and edit local path/branch pattern only; it has no automation settings, webhook configuration, or webhook health methods.
- `apple/IssueCTL/Views/Sessions/SessionListView.swift` and `SessionRowView.swift` render everything as issue sessions.

## Active Dirty Checkout Findings

The active checkout at `/Users/neonwatty/Desktop/issuectl` is on `codex/webhook-tunnel-qa-hardening` with many uncommitted changes. It should be treated as evidence, not as a branch to copy wholesale.

Dirty Apple files with useful PR-session work to preserve/port:

- `apple/IssueCTLShared/Models/Deployment.swift`
  - Adds `DeploymentTargetType`.
  - Adds `ActiveDeployment.targetType`, `targetNumber`, `targetLabel`, `targetTitle`, and `isIssueTarget`.
  - Adds custom decoding so PR sessions can decode from `issue_number: null`, `target_type: "pr"`, `target_number`.
  - Adds target fields to `EndSessionRequestBody`.
- `apple/IssueCTLShared/Services/APIClient.swift`
  - Extends `endSession` to send `targetType` and `targetNumber`.
- `apple/IssueCTL/Views/Sessions/SessionListView.swift`
  - Searches by target label instead of issue number only.
  - Sends target fields when ending sessions.
  - Disables issue navigation for PR sessions.
- `apple/IssueCTL/Views/Sessions/SessionRowView.swift`
  - Shows `deployment.targetLabel`.
- `apple/IssueCTL/Views/Issues/IssueDetailView.swift`
  - Filters active deployments to `targetType == .issue`.
- `apple/IssueCTLTests/EnumTests.swift`
  - Adds target enum and end-session body encoding tests.
- `apple/IssueCTLTests/ModelDecodingTests.swift`
  - Adds PR active deployment decoding coverage.

Additional dirty Apple files reference target-aware behavior and need review before implementation:

- `apple/IssueCTL/Helpers/RepoFilterHelpers.swift`
- `apple/IssueCTL/Views/Launch/LaunchView.swift`
- `apple/IssueCTL/Views/Terminal/TerminalView.swift`
- `apple/IssueCTLMac/Views/MacIssueFilterState.swift`
- `apple/IssueCTLMac/Views/MacSessionsView.swift`
- `apple/IssueCTLMac/Views/MacSidebarStore.swift`
- `apple/IssueCTLMac/Views/MacTodayView.swift`

Do not port dirty `apple/IssueCTL/Generated/AppVersion.swift`; it is generated/version churn.

Dirty web files in the active checkout overlap web detail/label/settings work, but GitHub `main` already has substantial versions of these capabilities. Re-check before copying anything from the dirty web tree:

- `packages/web/app/issues/[owner]/[repo]/[number]/page.tsx`
- `packages/web/app/pulls/[owner]/[repo]/[number]/page.tsx`
- `packages/web/components/issue/LabelManager.tsx`
- `packages/web/components/repos/RepoSettingsPanel.tsx`
- `packages/web/lib/webhook-health.ts` is untracked in the active checkout but already exists on GitHub `main`.

## REST Endpoint Gap List

Already present on GitHub `main`:

- `GET /api/v1/workbench`
- `GET/POST /api/v1/repos`
- `PATCH/DELETE /api/v1/repos/:owner/:repo`
- repo automation fields in repo create/update
- `POST /api/v1/repos/:owner/:repo/webhook` with `action: "create" | "rotate"`
- `GET /api/v1/repos/:owner/:repo/labels`
- `POST /api/v1/repos/:owner/:repo/labels` with `{ action: "recreate" }`
- issue label toggle route at `POST /api/v1/issues/:owner/:repo/:number/labels`
- PR detail/comment/review/merge routes

Still missing for iOS parity:

- `GET /api/v1/repos/:owner/:repo/webhook/health`
  - Web pages call `getWebhookAutomationHealth(db, repo)` server-side, but there is no mobile REST route.
- `POST /api/v1/pulls/:owner/:repo/:number/labels`
  - Web has the server action `togglePullLabel`, but no REST route for iOS.

Likely later, not first-slice required:

- Webhook ping as a REST action. Current repo webhook REST route supports only `create` and `rotate`; web server actions appear to handle broader repo automation operations. iOS can start with create/rotate plus health, then add ping if the settings UX requires it.

## Recommended First Worker Slice

Proceed with a contracts/API/mock-server foundation slice. This is the largest safe useful first slice because it makes the iOS app capable of understanding current web state before visible UI work begins.

### Objective

Implement and verify iOS shared contracts plus mobile-required REST gaps:

- Extend Swift `Repo` for automation fields.
- Complete target-aware `Deployment` and `ActiveDeployment` decoding, preserving and expanding the dirty active-checkout work.
- Add Swift `WorkbenchPayload`/summary models matching `packages/web/components/workbench/workbench-types.ts`.
- Add `APIClient.workbench(...)`.
- Extend settings/update repo request models for automation fields.
- Add API client methods for webhook create/rotate, webhook health, repo label recreation, and PR label toggling.
- Extend the iOS mock server and tests for those contracts.
- Add web REST routes/tests for webhook health and PR label toggle if missing.

### Allowed Files

- `apple/IssueCTLShared/Models/Repo.swift`
- `apple/IssueCTLShared/Models/Deployment.swift`
- `apple/IssueCTLShared/Models/Workbench.swift`
- `apple/IssueCTLShared/Services/APIClient.swift`
- `apple/IssueCTLShared/Services/APIClient+Settings.swift`
- `apple/IssueCTLShared/Services/APIClient+DetailActions.swift`
- `apple/IssueCTLTests/EnumTests.swift`
- `apple/IssueCTLTests/ModelDecodingTests.swift`
- `apple/IssueCTLTests/APIClientTests.swift`
- `apple/IssueCTLTests/APIClientExtensionTests.swift`
- `apple/IssueCTLUITests/Helpers/MockServer.swift`
- `packages/web/app/api/v1/repos/[owner]/[repo]/webhook/health/route.ts`
- `packages/web/app/api/v1/repos/[owner]/[repo]/webhook/health/route.test.ts`
- `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.ts`
- `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.test.ts`
- `docs/goals/ios-web-parity/**`

### Verify

- `git diff --check`
- `pnpm --dir packages/web test -- webhook`
- `pnpm --dir packages/web test -- labels`
- `pnpm --dir packages/web test -- workbench`
- `pnpm --dir packages/web typecheck`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:IssueCTLTests/EnumTests`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:IssueCTLTests/ModelDecodingTests`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:IssueCTLTests/APIClientTests`

If `xcodebuildmcp` is available during execution, prefer equivalent simulator test invocations through that tool.

### Stop If

- A required Swift model name conflicts with existing app-wide conventions.
- Webhook health requires live GitHub access in tests instead of a mocked helper.
- PR label toggling cannot reuse the existing `togglePullLabel`/core label helpers safely.
- The implementation needs visible UI files before the shared contract/API foundation is verified.
- XcodeGen/project file updates are required unexpectedly; pause for Judge/PM to decide whether to include project generation in this slice.

## Recommended Next Task

Advance to `T002` Judge. The Judge should approve or adjust the first Worker slice above, then activate `T003`.
