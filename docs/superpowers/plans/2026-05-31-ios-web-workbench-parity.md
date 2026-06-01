# iOS Web Workbench Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the iOS and macOS Apple clients up to date with the web workbench, webhook automation, PR review-session, and diagnostics contracts.

**Architecture:** Start by hardening the shared Swift contract layer so native clients can decode target-aware deployments, webhook-enabled repos, workbench summaries, and diagnostics without crashing on new server fields. Then wire those contracts into the existing Today, Issues, Sessions, Settings, PR, and terminal surfaces as incremental native parity slices, keeping detail screens on existing focused endpoints and using `/api/v1/workbench` as an optional aggregate refresh path.

**Tech Stack:** Swift 6, SwiftUI, URLSession async/await, XcodeGen, Next.js App Router REST routes, pnpm/Turborepo, SQLite diagnostics journal.

---

## Current Slice Status

Implemented in this worktree on 2026-05-31:

- Shared Apple deployment contracts now decode target-aware issue and PR sessions, including `targetType`, `targetNumber`, launch `agent`, `terminalBackend`, `triggeredBy`, terminal/completion metadata, and launch `correlationId`.
- End-session requests now preserve the target metadata expected by the web route while keeping the existing issue-number field for compatibility.
- iOS and macOS session/terminal surfaces use target labels such as `#42` or `PR #42` and avoid treating PR sessions as issue sessions.
- Focused tests cover PR-target deployment decoding, terminal-backend encoding/decoding, launch response metadata, and issue-running helpers ignoring PR sessions with the same number.

Still remaining from the broader plan:

- Native `/api/v1/workbench` aggregate models and refresh path.
- Repo automation/webhook settings surfaces.
- Diagnostics journal REST surface and native timeline.
- PR review-session launch/review controls beyond safe display and session ending.

---

## Evidence Summary

The current web direction is centered on `/workbench`, not the older per-repo dashboard alone.

- Web workbench page: `packages/web/app/workbench/page.tsx`
- Workbench payload builder: `packages/web/lib/workbench-data.ts`
- Workbench contract: `packages/web/components/workbench/workbench-types.ts`
- Board/global issue surfaces: `packages/web/components/workbench/BoardFocus.tsx`, `packages/web/components/workbench/GlobalIssuesFocus.tsx`
- Repo overview operational cards: `packages/web/components/workbench/RepoOverviewFocus.tsx`
- Webhook worker: `packages/web/lib/github-webhook-handler.ts`, `packages/web/lib/webhook-intent-worker.ts`, `packages/web/lib/webhook-pr-intent.ts`, `packages/web/lib/webhook-pr-launch.ts`
- Launch/session REST contracts: `packages/web/app/api/v1/launch/[owner]/[repo]/[number]/route.ts`, `packages/web/app/api/v1/deployments/route.ts`, `packages/web/app/api/v1/deployments/[id]/end/route.ts`

The committed Apple client already has a strong multi-repo issue/PR/session foundation, but the clean worktree is behind the web contract in these ways:

- `apple/IssueCTLShared/Models/Deployment.swift` is issue-centered and lacks `targetType`, `targetNumber`, `triggeredBy`, `terminalBackend`, `terminalReason`, completion fields, and PR target labels.
- `apple/IssueCTLShared/Models/Repo.swift` lacks repo automation fields now returned by the server: `autoLaunchIssues`, `autoReviewPrs`, `issueAgent`, `reviewAgent`, `webhookId`, `reviewPreamble`, `webhookPayloadMode`.
- `apple/IssueCTLShared/Services/APIClient.swift` does not call `/api/v1/workbench`, does not send `terminalBackend` on launch, and does not decode `correlationId` or returned `terminalBackend`.
- Native Settings only edits local path and branch pattern; web repo settings now expose automation toggles, webhook install/rotate, payload mode, label health, recent deliveries, and activity.
- There is no native diagnostics journal surface, while repo instructions say launch/terminal failures should be debugged diagnostics-first.

The original dirty checkout at `/Users/neonwatty/Desktop/issuectl` contains useful in-progress Apple changes, especially target-aware deployment decoding and session UI guards. Preserve and finish those; do not throw them away.

---

## File Structure

Modify shared contracts first:

- `apple/IssueCTLShared/Models/Deployment.swift`: target-aware deployment/session enums and decoded fields.
- `apple/IssueCTLShared/Models/Repo.swift`: repo automation fields and payload-mode enum.
- `apple/IssueCTLShared/Models/Workbench.swift`: new aggregate workbench models.
- `apple/IssueCTLShared/Models/Diagnostics.swift`: new diagnostics journal models.
- `apple/IssueCTLShared/Services/APIClient.swift`: launch response/request updates and workbench cache invalidation.
- `apple/IssueCTLShared/Services/APIClient+Settings.swift`: repo automation and webhook request/response bodies.
- `apple/IssueCTLShared/Services/APIClient+Diagnostics.swift`: diagnostics REST calls.

Add or update web REST routes only where native parity needs a real API:

- `packages/web/app/api/v1/diagnostics/route.ts`: read-only diagnostics query.
- `packages/web/app/api/v1/repos/[owner]/[repo]/webhook/route.ts`: already exists; use from Apple.
- `packages/web/app/api/v1/repos/[owner]/[repo]/labels/route.ts`: already exists; use for label health.
- Optional later route: `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.ts` if PR label parity needs a REST endpoint.

Wire native UI after the contracts are tested:

- `apple/IssueCTL/Views/Today/TodayView.swift`
- `apple/IssueCTL/Views/Issues/IssueListView.swift`
- `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- `apple/IssueCTL/Views/Sessions/SessionRowView.swift`
- `apple/IssueCTL/Views/Terminal/TerminalView.swift`
- `apple/IssueCTL/Views/Settings/SettingsView.swift`
- `apple/IssueCTL/Views/Settings/EditRepoSheet.swift`
- `apple/IssueCTL/Views/Settings/RepoAutomationSettingsView.swift`
- `apple/IssueCTL/Views/Settings/DiagnosticsTimelineView.swift`
- `apple/IssueCTLMac/Views/MacSidebarStore.swift`
- `apple/IssueCTLMac/Views/MacTodayView.swift`
- `apple/IssueCTLMac/Views/MacSessionsView.swift`
- `apple/IssueCTLMac/Views/MacSettingsView.swift`

Test surfaces:

- `apple/IssueCTLTests/ModelDecodingTests.swift`
- `apple/IssueCTLTests/APIClientTests.swift`
- `apple/IssueCTLTests/APIClientExtensionTests.swift`
- `apple/IssueCTLTests/EnumTests.swift`
- `apple/IssueCTLUITests/Helpers/MockServer.swift`
- `apple/IssueCTLUITests/SessionManagementTests.swift`
- `apple/IssueCTLUITests/SettingsTests.swift`
- `apple/IssueCTLMacTests/MacIssueFilterStateTests.swift`
- `packages/web/app/api/v1/diagnostics/route.test.ts`

---

## Task 1: Land Target-Aware Native Session Contracts

**Files:**
- Modify: `apple/IssueCTLShared/Models/Deployment.swift`
- Modify: `apple/IssueCTLTests/ModelDecodingTests.swift`
- Modify: `apple/IssueCTLTests/EnumTests.swift`
- Modify: `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- Modify: `apple/IssueCTL/Views/Sessions/SessionRowView.swift`
- Modify: `apple/IssueCTL/Views/Terminal/TerminalView.swift`
- Modify: `apple/IssueCTLMac/Views/MacSessionsView.swift`
- Modify: `apple/IssueCTLMac/Views/MacIssueFilterState.swift`

- [ ] **Step 1: Preserve the in-flight target model work**

  Inspect the original dirty checkout diff:

  ```bash
  git -C /Users/neonwatty/Desktop/issuectl diff -- apple/IssueCTLShared/Models/Deployment.swift apple/IssueCTL/Views/Sessions/SessionListView.swift apple/IssueCTL/Views/Sessions/SessionRowView.swift apple/IssueCTLMac/Views/MacSessionsView.swift
  ```

  Bring forward the useful pieces into the implementation branch: `DeploymentTargetType`, `targetNumber`, `targetLabel`, `targetTitle`, `isIssueTarget`, PR-session search labels, and "View Issue" guards for PR targets.

- [ ] **Step 2: Write failing decoding tests**

  Add tests to `apple/IssueCTLTests/ModelDecodingTests.swift` near the active deployment tests:

  ```swift
  func testActiveDeploymentDecodesPrTargetWithoutIssueNumber() throws {
      let json = """
      {
          "id": 44,
          "repo_id": 10,
          "issue_number": null,
          "target_type": "pr",
          "target_number": 44,
          "agent": "codex",
          "branch_name": "feature/pr-review",
          "workspace_mode": "worktree",
          "workspace_path": "/tmp/pr",
          "linked_pr_number": null,
          "state": "active",
          "terminal_backend": "pty_bridge",
          "triggered_by": "webhook",
          "parent_deployment_id": null,
          "webhook_depth": 0,
          "launched_at": "2026-05-31T10:00:00Z",
          "ended_at": null,
          "terminal_reason": null,
          "completion_token": "tok",
          "completion_result_json": null,
          "notification_sent_at": null,
          "ttyd_port": null,
          "ttyd_pid": null,
          "idle_since": null,
          "owner": "mean-weasel",
          "repo_name": "issuectl"
      }
      """.data(using: .utf8)!

      let deployment = try decoder.decode(ActiveDeployment.self, from: json)
      XCTAssertEqual(deployment.targetType, .pr)
      XCTAssertEqual(deployment.targetNumber, 44)
      XCTAssertEqual(deployment.issueNumber, 44)
      XCTAssertEqual(deployment.targetLabel, "PR #44")
      XCTAssertEqual(deployment.terminalBackend, .ptyBridge)
      XCTAssertEqual(deployment.triggeredBy, .webhook)
      XCTAssertFalse(deployment.isIssueTarget)
  }
  ```

  Add enum round-trip tests for `DeploymentTargetType`, `TerminalBackend`, `DeploymentTriggeredBy`, and `DeploymentTerminalReason` in `apple/IssueCTLTests/EnumTests.swift`.

- [ ] **Step 3: Implement the shared model**

  Add these Swift enums and fields in `Deployment.swift`, keeping legacy issue-only JSON compatible:

  ```swift
  enum DeploymentTargetType: String, Codable, Sendable {
      case issue
      case pr
  }

  enum TerminalBackend: String, Codable, Sendable {
      case ttyd
      case ptyBridge = "pty_bridge"
  }

  enum DeploymentTriggeredBy: String, Codable, Sendable {
      case manual
      case webhook
      case commentCommand = "comment_command"
  }
  ```

  Decode `targetNumber` from `target_number ?? issue_number`, decode `issueNumber` from `issue_number ?? target_number`, and default `targetType` to `.issue` for older server fixtures.

- [ ] **Step 4: Update native session UI for PR sessions**

  Replace issue-only labels with target labels in iOS and macOS session lists. PR sessions should show `PR #<number>`, branch, trigger, backend, preview status, and terminal controls, but should not navigate to `IssueDetailView`.

- [ ] **Step 5: Verify**

  ```bash
  xcodebuildmcp test_sim --extraArgs -project apple/IssueCTL.xcodeproj -scheme IssueCTL -only-testing:IssueCTLTests/ModelDecodingTests -only-testing:IssueCTLTests/EnumTests
  ```

  Expected: model and enum tests pass, including legacy issue deployment JSON and PR-target deployment JSON.

---

## Task 2: Extend Launch, End Session, and Terminal Backend Contracts

**Files:**
- Modify: `apple/IssueCTLShared/Models/Deployment.swift`
- Modify: `apple/IssueCTLShared/Services/APIClient.swift`
- Modify: `apple/IssueCTL/Views/Launch/LaunchView.swift`
- Modify: `apple/IssueCTL/Views/Terminal/TerminalView.swift`
- Modify: `apple/IssueCTLTests/APIClientTests.swift`
- Modify: `apple/IssueCTLUITests/Helpers/MockServer.swift`

- [ ] **Step 1: Add launch response coverage**

  Add tests that decode:

  ```json
  {
    "success": true,
    "correlation_id": "launch-correlation",
    "deployment_id": 12,
    "terminal_backend": "pty_bridge",
    "ttyd_port": null,
    "label_warning": null
  }
  ```

  Expected Swift values: `correlationId == "launch-correlation"`, `terminalBackend == .ptyBridge`, `ttydPort == nil`.

- [ ] **Step 2: Update `LaunchRequestBody` and `LaunchResponse`**

  Add:

  ```swift
  let terminalBackend: TerminalBackend?
  let correlationId: String?
  ```

  Keep `terminalBackend` nil by default because the web route only permits overrides for approved test repositories.

- [ ] **Step 3: Update `endSession`**

  Ensure `APIClient.endSession` sends `targetType` and `targetNumber` to match `packages/web/app/api/v1/deployments/[id]/end/route.ts`.

- [ ] **Step 4: Update terminal behavior**

  If `terminalBackend == .ptyBridge` and no `ttydPort` exists, do not show a misleading "missing port" failure. Show a native state that tells the user the session is PTY-backed and expose reconnect/end/diagnostics actions. Keep existing ttyd `WKWebView` behavior for `.ttyd`.

- [ ] **Step 5: Verify**

  ```bash
  xcodebuildmcp test_sim --extraArgs -project apple/IssueCTL.xcodeproj -scheme IssueCTL -only-testing:IssueCTLTests/APIClientTests
  ```

  Expected: request body tests prove target-aware end-session JSON and launch response decoding.

---

## Task 3: Add Workbench Aggregate Models and Optional Fast Path

**Files:**
- Create: `apple/IssueCTLShared/Models/Workbench.swift`
- Modify: `apple/IssueCTLShared/Services/APIClient.swift`
- Modify: `apple/IssueCTLTests/ModelDecodingTests.swift`
- Modify: `apple/IssueCTL/Views/Today/TodayView.swift`
- Modify: `apple/IssueCTL/Views/Issues/IssueListView.swift`
- Modify: `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- Modify: `apple/IssueCTLMac/Views/MacSidebarStore.swift`

- [ ] **Step 1: Write aggregate decoding tests**

  Use a compact fixture matching `packages/web/components/workbench/workbench-types.ts`:

  ```swift
  func testWorkbenchPayloadDecoding() throws {
      let json = """
      {
        "repos": [{
          "id": 1,
          "owner": "mean-weasel",
          "name": "issuectl",
          "local_path": "/Users/me/issuectl",
          "branch_pattern": "issue-{number}-{slug}",
          "auto_launch_issues": true,
          "auto_review_prs": true,
          "issue_agent": "codex",
          "review_agent": "claude",
          "webhook_id": 123,
          "webhook_payload_mode": "metadata",
          "badge_count": 1,
          "deployed_count": 1,
          "launch_agent": "codex",
          "terminal_backend_default": "ttyd",
          "issue_error": null,
          "issues_from_cache": false,
          "issues_cached_at": null,
          "priorities": [],
          "deployments": [],
          "recent_completions": [],
          "webhook_events": [],
          "pr_reviews": [],
          "previews": {},
          "issues": [{
            "number": 506,
            "title": "Keep iOS up to date",
            "state": "open",
            "labels": ["issuectl:auto-launch"],
            "updated_at": "2026-05-31T10:00:00Z",
            "priority": "high",
            "has_active_deployment": false,
            "html_url": "https://github.com/mean-weasel/issuectl/issues/506",
            "author_login": "neonwatty"
          }]
        }],
        "deployments": [],
        "previews": {},
        "settings": {"terminal_backend": "ttyd"},
        "health": {"ok": true, "version": "0.0.0", "timestamp": "2026-05-31T10:00:00Z", "error": null},
        "user": {"login": "neonwatty", "error": null},
        "generated_at": "2026-05-31T10:00:01Z"
      }
      """.data(using: .utf8)!

      let payload = try decoder.decode(WorkbenchPayload.self, from: json)
      XCTAssertEqual(payload.repos[0].issues[0].priority, .high)
      XCTAssertTrue(payload.repos[0].autoLaunchIssues)
      XCTAssertEqual(payload.user.login, "neonwatty")
  }
  ```

- [ ] **Step 2: Implement `Workbench.swift`**

  Mirror the TypeScript contract without importing full issue bodies:

  ```swift
  struct WorkbenchPayload: Codable, Sendable {
      let repos: [WorkbenchRepo]
      let deployments: [ActiveDeployment]
      let previews: [String: SessionPreview]
      let settings: [String: String]
      let health: WorkbenchHealth
      let user: WorkbenchUser
      let generatedAt: String
  }
  ```

- [ ] **Step 3: Add `APIClient.workbench(refresh:)`**

  Fetch `/api/v1/workbench`, cache briefly, and save to offline cache under `workbench`.

- [ ] **Step 4: Use workbench as a fast path**

  In Today, Issues, Sessions, and MacSidebarStore, attempt `workbench(refresh:)` first. Populate repos, active deployments, previews, current user, issue summaries, and cache banners from the aggregate. Keep existing detail/per-repo fetches as fallback and for drill-in.

- [ ] **Step 5: Verify**

  ```bash
  xcodebuildmcp test_sim --extraArgs -project apple/IssueCTL.xcodeproj -scheme IssueCTL -only-testing:IssueCTLTests/ModelDecodingTests
  ```

  Expected: workbench payload decodes and existing issue/session tests continue to pass.

---

## Task 4: Bring Repo Automation Settings to Native

**Files:**
- Modify: `apple/IssueCTLShared/Models/Repo.swift`
- Modify: `apple/IssueCTLShared/Services/APIClient+Settings.swift`
- Create: `apple/IssueCTL/Views/Settings/RepoAutomationSettingsView.swift`
- Modify: `apple/IssueCTL/Views/Settings/EditRepoSheet.swift`
- Modify: `apple/IssueCTL/Views/Settings/SettingsView.swift`
- Modify: `apple/IssueCTLMac/Views/MacSettingsView.swift`
- Modify: `apple/IssueCTLTests/APIClientExtensionTests.swift`
- Modify: `apple/IssueCTLUITests/SettingsTests.swift`

- [ ] **Step 1: Extend `Repo`**

  Add optional-compatible fields with server defaults:

  ```swift
  let autoLaunchIssues: Bool
  let autoReviewPrs: Bool
  let issueAgent: LaunchAgent
  let reviewAgent: LaunchAgent
  let webhookId: Int?
  let reviewPreamble: String?
  let webhookPayloadMode: WebhookPayloadMode
  ```

  Use a custom decoder so older fixtures without these keys still decode.

- [ ] **Step 2: Extend repo update API**

  Update `UpdateRepoRequest` to include:

  ```swift
  let autoLaunchIssues: Bool?
  let autoReviewPrs: Bool?
  let issueAgent: LaunchAgent?
  let reviewAgent: LaunchAgent?
  let reviewPreamble: String?
  let webhookPayloadMode: WebhookPayloadMode?
  ```

- [ ] **Step 3: Add webhook operations**

  Add API methods:

  ```swift
  func configureRepoWebhook(owner: String, name: String, action: WebhookAction) async throws -> ConfigureWebhookResponse
  func repoLabels(owner: String, name: String) async throws -> [GitHubLabel]
  func recreateRepoLabels(owner: String, name: String) async throws -> SuccessResponse
  ```

- [ ] **Step 4: Build the native automation sheet**

  `RepoAutomationSettingsView` should show local path, branch pattern, auto-launch issues, auto-review PRs, issue/review agent, payload mode, webhook id/receiver URL state, label health, and recent webhook events if supplied by `WorkbenchRepo`.

- [ ] **Step 5: Verify**

  ```bash
  xcodebuildmcp test_sim --extraArgs -project apple/IssueCTL.xcodeproj -scheme IssueCTL -only-testing:IssueCTLTests/APIClientExtensionTests
  xcodebuildmcp test_sim --extraArgs -project apple/IssueCTL.xcodeproj -scheme IssueCTLPreview-UISmoke -only-testing:IssueCTLPreviewUITests/SettingsTests
  ```

---

## Task 5: Add Native Diagnostics Journal View

**Files:**
- Create: `packages/web/app/api/v1/diagnostics/route.ts`
- Create: `packages/web/app/api/v1/diagnostics/route.test.ts`
- Create: `apple/IssueCTLShared/Models/Diagnostics.swift`
- Create: `apple/IssueCTLShared/Services/APIClient+Diagnostics.swift`
- Create: `apple/IssueCTL/Views/Settings/DiagnosticsTimelineView.swift`
- Modify: `apple/IssueCTL/Views/Launch/LaunchProgressView.swift`
- Modify: `apple/IssueCTL/Views/Terminal/TerminalView.swift`
- Modify: `apple/IssueCTL/Views/Settings/SettingsView.swift`
- Modify: `apple/IssueCTLTests/ModelDecodingTests.swift`

- [ ] **Step 1: Add read-only diagnostics REST route**

  Implement a `GET /api/v1/diagnostics` route with query params:

  - `deploymentId`
  - `owner`
  - `repo`
  - `targetType`
  - `targetNumber`
  - `issueNumber`
  - `correlationId`
  - `event`
  - `limit`

  It should call `queryDiagnosticEvents` from `packages/core/src/db/diagnostics.ts` and return `{ events }`.

- [ ] **Step 2: Test the route**

  Add route tests proving auth, deployment filtering, target filtering, and limit clamping.

  ```bash
  pnpm --dir packages/web test -- --run app/api/v1/diagnostics/route.test.ts
  ```

- [ ] **Step 3: Add Swift diagnostics models**

  Model:

  ```swift
  struct DiagnosticEvent: Codable, Identifiable, Sendable {
      let id: Int
      let ts: Int
      let level: String
      let event: String
      let source: String
      let correlationId: String?
      let owner: String?
      let repo: String?
      let issueNumber: Int?
      let targetType: DeploymentTargetType?
      let targetNumber: Int?
      let deploymentId: Int?
      let sessionName: String?
      let ttydPort: Int?
      let ttydPid: Int?
      let status: String?
      let message: String?
      let dataJson: String?
  }
  ```

- [ ] **Step 4: Surface diagnostics from failure states**

  Add "View diagnostics" actions from failed launch progress, terminal unavailable/ensure-ttyd failures, and Settings. For a launch failure with `correlationId`, open the timeline filtered by correlation. For terminal/session failures, filter by deployment id.

- [ ] **Step 5: Verify**

  ```bash
  pnpm --dir packages/web test -- --run app/api/v1/diagnostics/route.test.ts
  xcodebuildmcp test_sim --extraArgs -project apple/IssueCTL.xcodeproj -scheme IssueCTL -only-testing:IssueCTLTests/ModelDecodingTests
  ```

---

## Task 6: Add Workbench-Style Native Work Board

**Files:**
- Create: `apple/IssueCTL/Views/Workbench/WorkbenchBoardView.swift`
- Create: `apple/IssueCTL/Views/Workbench/WorkbenchIssueRow.swift`
- Modify: `apple/IssueCTL/App/ContentView.swift`
- Modify: `apple/IssueCTL/Views/Today/TodayView.swift`
- Modify: `apple/IssueCTLMac/Views/MacTodayView.swift`
- Modify: `apple/IssueCTLUITests/Helpers/MockServer.swift`
- Create or modify: `apple/IssueCTLUITests/WorkbenchBoardTests.swift`

- [ ] **Step 1: Design the native board around the web contract**

  Sections:

  - all open issues across tracked repos
  - running issues and PR review sessions
  - recent completions
  - recent webhook events
  - PR review history

  Use `WorkbenchPayload` as the source when available. Tap issue rows into `IssueDetailView`; tap PR review/session rows into `TerminalView` or a read-only PR review summary until native PR-review detail exists.

- [ ] **Step 2: Implement iOS board**

  Keep it compact and operational: segmented filters for `Open`, `Running`, `Automation`, `Completed`; repo filter chip; refresh; cached/offline banner.

- [ ] **Step 3: Implement Mac parity**

  Add the same summarized board sections to `MacTodayView` or a Mac workbench tab fed by `MacSidebarStore`.

- [ ] **Step 4: Verify in simulator**

  ```bash
  xcodebuildmcp test_sim --extraArgs -project apple/IssueCTL.xcodeproj -scheme IssueCTLPreview-UISmoke -only-testing:IssueCTLPreviewUITests/WorkbenchBoardTests
  ```

---

## Task 7: Close PR Review and Webhook Label Gaps

**Files:**
- Modify: `apple/IssueCTLShared/Models/PullRequest.swift`
- Modify: `apple/IssueCTL/Views/PullRequests/PRDetailView.swift`
- Modify: `apple/IssueCTLShared/Services/APIClient+DetailActions.swift`
- Optional create: `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.ts`
- Optional create: `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.test.ts`

- [ ] **Step 1: Decide whether native PR labels need a REST route**

  If issue label route works for PR issue numbers, document and use that path. If not, add the PR labels route and tests.

- [ ] **Step 2: Surface auto-review label state**

  In `PRDetailView`, show and allow toggling `issuectl:auto-review` once the REST path is confirmed. Do not expose an action that silently fails for PRs.

- [ ] **Step 3: Add PR review-session status**

  Show active PR review deployment, last review status, reviewed SHA range, and terminal action from workbench or PR detail data.

- [ ] **Step 4: Verify**

  ```bash
  pnpm --dir packages/web test -- --run app/api/v1/pulls
  xcodebuildmcp test_sim --extraArgs -project apple/IssueCTL.xcodeproj -scheme IssueCTLPreview-UISmoke -only-testing:IssueCTLPreviewUITests/PRBrowseTests
  ```

---

## Task 8: GoalBuddy Execution Shape for This Work

Use a fresh GoalBuddy goal, not another sprawling "find parity gaps" board.

**Recommended owner outcome:**

From current `origin/main`, close the highest-value native iOS/webhook parity tranche, merge it, and prove it on clean `origin/main` with simulator evidence and diagnostics-first evidence for session/webhook behavior.

**Goal oracle:**

- PR(s) merged, not merely opened.
- Clean checkout from updated `origin/main` decodes target-aware issue and PR deployments.
- Simulator shows PR review sessions without navigating to issue detail.
- Native Settings exposes repo automation/webhook health for a tracked repo.
- A launch/session failure can open native diagnostics filtered by deployment or correlation id.
- Focused tests pass: `IssueCTLTests`, relevant `IssueCTLPreviewUITests`, `packages/web` diagnostics route tests.

**Recommended board shape:**

- Scout: one short current-main audit that ranks gaps and fixture availability. Stop after evidence receipt.
- Judge: select the largest safe vertical slice. Prefer "target-aware sessions + launch response + diagnostics route" as tranche 1 if the dirty Apple work is still available.
- Worker 1: shared Swift contracts and tests.
- Worker 2: native session UI for PR-target sessions.
- Worker 3: diagnostics REST route and Swift diagnostics client.
- Worker 4: repo automation settings UI.
- PM merge gate: open/update PRs, request review, merge, update `origin/main`.
- Judge final oracle: clean-main simulator walkthrough and diagnostics proof.

**Anti-churn rules:**

- `state.yaml` is the only task truth.
- Long design notes are allowed only when they answer a gate.
- Workers should be larger than "one file" when the change is a coherent vertical slice.
- Every Worker receipt must include exact files changed, exact verification commands, and one residual-risk statement.
- Completion is blocked until merged-main proof exists.

---

## Overall Verification

Run after the relevant slices land:

```bash
pnpm --dir packages/web test -- --run app/api/v1/diagnostics/route.test.ts
pnpm --dir packages/web typecheck
pnpm --dir packages/core test
pnpm --dir packages/core typecheck
xcodebuildmcp test_sim --extraArgs -project apple/IssueCTL.xcodeproj -scheme IssueCTL
xcodebuildmcp test_sim --extraArgs -project apple/IssueCTL.xcodeproj -scheme IssueCTLPreview-UISmoke -only-testing:IssueCTLPreviewUITests/SessionManagementTests -only-testing:IssueCTLPreviewUITests/SettingsTests
```

For manual proof, run `issuectl web`, connect the preview app to the local server, then exercise:

1. A PR-target deployment appears as `PR #<number>` in native Sessions.
2. Ending that session sends `targetType: pr` and `targetNumber`.
3. Repo automation settings show auto-launch, auto-review, webhook id, payload mode, and label health.
4. A diagnostics timeline is reachable from a failed or unavailable terminal state.
5. Workbench board summary counts match `/workbench` for tracked repos, active sessions, recent completions, and webhook events.
