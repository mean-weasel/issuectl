# iOS Web Parity Last-Mile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the iOS app from "mostly contract-complete" to operator-complete parity with the current web workbench, webhook automation, PR review, diagnostics, and session surfaces on `origin/main`.

**Architecture:** Use the existing mobile REST contracts as the source of truth: `/api/v1/workbench`, `/api/v1/sessions/overview`, `/api/v1/webhooks/events`, `/api/v1/pr-reviews`, `/api/v1/diagnostics/**`, and repo webhook/label routes. Avoid new web APIs unless a native workflow cannot be expressed with current endpoints. Keep changes vertical: shared projection plus one user-visible iOS workflow plus focused tests per slice.

**Tech Stack:** Swift 6, SwiftUI, URLSession async/await, XcodeGen project, Next.js App Router REST contracts, pnpm/Turborepo verification, GoalBuddy parent conveyor with depth-1 child boards.

---

## Analysis Summary

The older parity notes are no longer an accurate baseline by themselves. On `origin/main` at `4afb3ec`, the web app already exposes the key mobile-friendly routes and the iOS shared layer already decodes most of them.

Current web state:
- Workbench modes are `Issues`, `Board`, `PRs`, `Workbench`, `Quick Create`, and `Settings` in `packages/web/components/workbench/WorkbenchShell.tsx`.
- `GET /api/v1/workbench` returns repos, active deployments, previews, settings, health, user, drafts, issues, priorities, webhook events, PR reviews, and recent completions through `packages/web/lib/workbench-data.ts`.
- Repo settings and webhook automation are REST-backed: repo PATCH can update automation and end disabled webhook sessions; webhook create/rotate/reinstall/ping and health are exposed under `/api/v1/repos/:owner/:repo/webhook`.
- Webhook automation is asynchronous: GitHub webhook delivery records events, merges debounce intents, then a worker launches issue/PR sessions after label, repo setting, and safety gates.

Current iOS state:
- The iOS app already has Today, Board, Issues, PRs, Active, Settings, repo automation, automation feed, session diagnostics, PR review run detail, launch, terminal, issue actions, PR actions, drafts, parse, worktrees, and notifications.
- Swift models already include `WorkbenchPayload`, `WorkbenchRepo`, `WorkbenchIssueSummary`, `WebhookAutomationHealth`, `WebhookEvent`, `ReviewRun`, `SessionsOverviewResponse`, and diagnostics.
- Remaining gaps are last-mile workflow gaps, not foundational contract gaps: focused deep links, clearer async automation state, PTY bridge terminal expectations, review action flagging, stale comments/docs, and stronger live UI proof.

## GoalBuddy Operating Plan

Use a new parent conveyor board, not another broad parity board:

- Parent: `docs/goals/ios-web-parity-last-mile/`
- Child boards:
  - `focused-deep-links`
  - `automation-waiting-evidence`
  - `review-and-pty-hardening`
  - `final-live-qa`

Board rules:
- First task must be `prior_board_audit`, summarizing `ios-web-parity`, `ios-workbench-automation-parity`, `ios-web-parity-conveyor`, `workbench`, and `mac-ios-parity`, with `satisfied_on_main` and remaining gaps.
- Second task must be `dirty_baseline_checkpoint`, confirming this fresh worktree is on `origin/main` and recording `git status --short --branch`.
- Do not parallelize Apple workers until a Judge proves disjoint `allowed_files`. Most remaining work touches `ContentView`, shared models/API, UI tests, or mock server, so it is likely serial.
- After at most two Scout/Judge/helper tasks, require a vertical Worker slice with user-visible UI and focused verification.
- Final audit must include `explicit_deferrals`, `live_or_ui_evidence`, `known_red_tests`, and `merge_or_followup_status`.

## Task 1: Focused iOS Route Context

**Files:**
- Modify: `apple/IssueCTL/App/ContentView.swift`
- Modify: `apple/IssueCTL/Views/Workbench/BoardView.swift`
- Modify: `apple/IssueCTL/ViewModels/WorkbenchStore.swift`
- Modify: `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- Test: `apple/IssueCTLTests/WorkbenchStoreTests.swift`
- Test: `apple/IssueCTLUITests/IssueCTLUITests.swift`
- Test: `apple/IssueCTLUITests/SessionManagementTests.swift`

- [x] **Step 1: Write route-context tests**

Add tests proving that an incoming route context can select:
- Board tab plus a repo/issue focus.
- Active tab plus a deployment focus.
- Active review tab plus a PR review focus.

Run:
```bash
xcodebuildmcp simulator test --only-testing IssueCTLTests/WorkbenchStoreTests
```

Expected: new tests fail because `ContentView` currently preserves context but does not push Board/Sessions focus all the way through.

- [x] **Step 2: Implement route context consumption**

Thread route context from `ContentView` into `BoardView` and `SessionListView` using existing navigation paths and selection state. Keep this native and small: do not add a new router framework.

Acceptance criteria:
- `issuectl://board?repo=owner/name&issue=123` lands on Board with the repo/issue selected or opened.
- `issuectl://sessions?deploymentId=701` lands on Active with deployment controls or diagnostics reachable.
- `issuectl://review?id=9001` lands on Active reviews and opens/targets the review row.

- [x] **Step 3: Verify focused routing**

Run:
```bash
xcodebuildmcp simulator test --only-testing IssueCTLTests/WorkbenchStoreTests
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/IssueCTLUITests/testBoardTabShowsCrossRepoIssueQueueAndRunningFilter
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/SessionManagementTests
```

Expected: all focused route-context tests pass.

- [ ] **Step 4: Commit**

```bash
git add apple/IssueCTL/App/ContentView.swift apple/IssueCTL/Views/Workbench/BoardView.swift apple/IssueCTL/ViewModels/WorkbenchStore.swift apple/IssueCTL/Views/Sessions/SessionListView.swift apple/IssueCTLTests/WorkbenchStoreTests.swift apple/IssueCTLUITests/IssueCTLUITests.swift apple/IssueCTLUITests/SessionManagementTests.swift
git commit -m "feat(ios): focus board and session deep links"
```

## Task 2: Automation Waiting Evidence

**Files:**
- Modify: `apple/IssueCTL/Views/Issues/IssueDetailView.swift`
- Modify: `apple/IssueCTL/Views/PullRequests/PRDetailView.swift`
- Modify: `apple/IssueCTL/Views/Settings/AutomationActivityRows.swift`
- Modify: `apple/IssueCTLShared/Models/Repo.swift`
- Test: `apple/IssueCTLTests/ModelDecodingTests.swift`
- Test: `apple/IssueCTLUITests/IssueDetailActionTests.swift`
- Test: `apple/IssueCTLUITests/PRBrowseTests.swift`
- Test: `apple/IssueCTLUITests/Helpers/MockServer.swift`

- [x] **Step 1: Write failing UI assertions**

Add UI tests for the operator story:
- Tapping `issuectl:auto-launch` on an issue shows a "waiting for webhook" or "automation queued" state.
- Tapping `issuectl:auto-review` on a PR shows the same for PR review automation.
- A consumed automation label is explained as intentional cleanup, not as automation being disabled.

Run:
```bash
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/IssueDetailActionTests
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/PRBrowseTests
```

Expected: tests fail because current copy/actions do not fully explain debounce/intent/worker state.

- [x] **Step 2: Surface webhook intent evidence**

Use existing `webhookEvents` and `reviewRuns` APIs already available through `APIClient` to show recent target-scoped automation events near issue and PR automation controls.

Acceptance criteria:
- Issue detail can show latest target event for `issuectl:auto-launch`.
- PR detail can show latest target event/review run for `issuectl:auto-review`.
- Messages distinguish `label applied`, `intent queued`, `session launched`, `label consumed`, `skipped unsafe PR`, and `launch failed` where the current payload supports it.

- [x] **Step 3: Verify automation evidence**

Run:
```bash
xcodebuildmcp simulator test --only-testing IssueCTLTests/ModelDecodingTests
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/IssueDetailActionTests
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/PRBrowseTests
```

Expected: model decoding and UI automation evidence tests pass.

- [ ] **Step 4: Commit**

```bash
git add apple/IssueCTL/Views/Issues/IssueDetailView.swift apple/IssueCTL/Views/PullRequests/PRDetailView.swift apple/IssueCTL/Views/Settings/AutomationActivityRows.swift apple/IssueCTLShared/Models/Repo.swift apple/IssueCTLTests/ModelDecodingTests.swift apple/IssueCTLUITests/IssueDetailActionTests.swift apple/IssueCTLUITests/PRBrowseTests.swift apple/IssueCTLUITests/Helpers/MockServer.swift
git commit -m "feat(ios): explain automation webhook progress"
```

## Task 3: Review Run Actions And PR Session Clarity

**Files:**
- Modify: `apple/IssueCTL/Views/Shared/ReviewRunDetailSheet.swift`
- Modify: `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- Modify: `apple/IssueCTLShared/Models/Repo.swift`
- Test: `apple/IssueCTLTests/ModelDecodingTests.swift`
- Test: `apple/IssueCTLUITests/SessionManagementTests.swift`
- Test: `apple/IssueCTLUITests/Helpers/MockServer.swift`

- [x] **Step 1: Write flag-state tests**

Add tests covering both `mobileWriteActionsEnabled = true` and `false` in review detail payloads.

Expected UI:
- Enabled: retry/full rerun actions are active and submit to `/api/v1/pr-reviews/:id/actions`.
- Disabled: the sheet states that write actions are disabled by the server and links/copies the web review page path.

- [x] **Step 2: Harden PR review row explanations**

Make session/review rows explain review statuses that are not simple active/completed: `reserved`, `launching`, `in_progress`, `failed`, `superseded`, `skipped`, and failed diagnostics.

Acceptance criteria:
- A skipped unsafe PR can be understood from iOS without opening the web app.
- A superseded review due to label removal or automation disablement is visible.
- Diagnostics entry points remain reachable from review runs with deployment IDs.

- [x] **Step 3: Verify**

Run:
```bash
xcodebuildmcp simulator test --only-testing IssueCTLTests/ModelDecodingTests
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/SessionManagementTests
```

- [ ] **Step 4: Commit**

```bash
git add apple/IssueCTL/Views/Shared/ReviewRunDetailSheet.swift apple/IssueCTL/Views/Sessions/SessionListView.swift apple/IssueCTLShared/Models/Repo.swift apple/IssueCTLTests/ModelDecodingTests.swift apple/IssueCTLUITests/SessionManagementTests.swift apple/IssueCTLUITests/Helpers/MockServer.swift
git commit -m "feat(ios): clarify review run actions and states"
```

## Task 4: PTY Bridge Terminal Handoff

**Files:**
- Modify: `apple/IssueCTLShared/Models/Deployment.swift`
- Modify: `apple/IssueCTL/Views/Sessions/SessionRowView.swift`
- Modify: `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- Modify: `apple/IssueCTL/Views/Terminal/TerminalView.swift`
- Test: `apple/IssueCTLTests/ModelDecodingTests.swift`
- Test: `apple/IssueCTLUITests/SessionManagementTests.swift`

- [x] **Step 1: Write terminal capability tests**

Add tests for:
- `ttyd` deployment with port opens native terminal.
- `pty_bridge` deployment without `ttydPort` does not pretend native terminal is available.
- `pty_bridge` row offers clear web workbench handoff/copy path.

- [x] **Step 2: Implement operator-safe fallback**

Do not implement native PTY WebSocket in this slice. Instead:
- Keep native terminal for `ttyd`.
- For `pty_bridge`, show a clear reason and an action to open/copy `/workbench?deployment=<id>` or the equivalent web path.
- Keep diagnostics available for both terminal backends.

- [x] **Step 3: Verify**

Run:
```bash
xcodebuildmcp simulator test --only-testing IssueCTLTests/ModelDecodingTests
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/SessionManagementTests
```

- [ ] **Step 4: Commit**

```bash
git add apple/IssueCTLShared/Models/Deployment.swift apple/IssueCTL/Views/Sessions/SessionRowView.swift apple/IssueCTL/Views/Sessions/SessionListView.swift apple/IssueCTL/Views/Terminal/TerminalView.swift apple/IssueCTLTests/ModelDecodingTests.swift apple/IssueCTLUITests/SessionManagementTests.swift
git commit -m "feat(ios): clarify pty bridge terminal handoff"
```

## Task 5: Automation Log Access Outside Settings

**Files:**
- Modify: `apple/IssueCTL/Views/Settings/AutomationFeedView.swift`
- Modify: `apple/IssueCTL/Views/Settings/RepoAutomationActivityView.swift`
- Modify: `apple/IssueCTL/Views/Today/TodayView.swift`
- Modify: `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- Test: `apple/IssueCTLUITests/IssueCTLUITests.swift`
- Test: `apple/IssueCTLUITests/SessionManagementTests.swift`
- Test: `apple/IssueCTLUITests/Helpers/MockServer.swift`

- [x] **Step 1: Write navigation tests**

Add UI tests proving a user can reach webhook event/review-run history from Today and Active, not only by opening Settings.

- [x] **Step 2: Add native entry points**

Add lightweight navigation affordances:
- Today: automation health/activity card opens global automation feed.
- Active: review/session empty or summary state links to event/review history.
- Keep Settings as the full management surface.

- [x] **Step 3: Verify**

Run:
```bash
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/IssueCTLUITests
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/SessionManagementTests
```

- [ ] **Step 4: Commit**

```bash
git add apple/IssueCTL/Views/Settings/AutomationFeedView.swift apple/IssueCTL/Views/Settings/RepoAutomationActivityView.swift apple/IssueCTL/Views/Today/TodayView.swift apple/IssueCTL/Views/Sessions/SessionListView.swift apple/IssueCTLUITests/IssueCTLUITests.swift apple/IssueCTLUITests/SessionManagementTests.swift apple/IssueCTLUITests/Helpers/MockServer.swift
git commit -m "feat(ios): expose automation activity from main flows"
```

## Task 6: Stale Contract Cleanup

**Files:**
- Modify: `apple/IssueCTLShared/Services/APIClient.swift`
- Modify: `apple/IssueCTLShared/Services/APIClient+Settings.swift`
- Modify: `apple/IssueCTLTests/APIClientTests.swift`
- Modify: `apple/IssueCTLTests/APIClientExtensionTests.swift`

- [x] **Step 1: Remove stale comments**

Update the comment around automation list endpoints that still says routes are fixture-driven until the web exposes native list routes. The web now exposes those routes.

- [x] **Step 2: Add endpoint inventory assertions**

Ensure tests cover:
- `/api/v1/webhooks/events`
- `/api/v1/repos/:owner/:repo/webhook/events`
- `/api/v1/pr-reviews`
- `/api/v1/repos/:owner/:repo/review-runs`
- `/api/v1/repos/:owner/:repo/webhook/health`
- `/api/v1/repos/:owner/:repo/webhook`

- [x] **Step 3: Verify**

Run:
```bash
xcodebuildmcp simulator test --only-testing IssueCTLTests/APIClientTests
xcodebuildmcp simulator test --only-testing IssueCTLTests/APIClientExtensionTests
```

- [ ] **Step 4: Commit**

```bash
git add apple/IssueCTLShared/Services/APIClient.swift apple/IssueCTLShared/Services/APIClient+Settings.swift apple/IssueCTLTests/APIClientTests.swift apple/IssueCTLTests/APIClientExtensionTests.swift
git commit -m "test(ios): refresh automation API contract coverage"
```

## Task 7: Final Proof And Merge Conveyor

**Files:**
- Modify: `docs/goals/ios-web-parity-last-mile/notes/*`
- Modify: `docs/goals/ios-web-parity-last-mile/state.yaml`

- [x] **Step 1: Run focused Apple verification**

Run:
```bash
xcodebuildmcp session_show_defaults
xcodebuildmcp simulator test --only-testing IssueCTLTests
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/IssueCTLUITests
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/SessionManagementTests
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/PRBrowseTests
xcodebuildmcp simulator test --only-testing IssueCTLPreviewUITests/IssueDetailActionTests
```

- [x] **Step 2: Run touched web/API checks if any route behavior changed**

Run only if web/API files were changed:
```bash
pnpm --dir packages/web test -- app/api/v1/workbench/route.test.ts app/api/v1/webhooks/events/route.test.ts app/api/v1/pr-reviews/route.test.ts
pnpm --dir packages/web typecheck
pnpm --dir packages/web lint
```

- [x] **Step 3: Collect live or UI evidence**

Record evidence for these workflows:
- Cross-repo Board can be opened and focused by route context.
- Issue auto-launch label shows queued/waiting/consumed evidence.
- PR auto-review label shows queued/review/run evidence.
- Review run detail explains write action availability.
- PTY bridge sessions show correct handoff while `ttyd` sessions still open native terminal.
- Automation activity is reachable from non-settings flows.

- [ ] **Step 4: Open PR and monitor**

Use the GitHub workflow, not another broad prep:
```bash
git status --short
git push -u origin codex/ios-web-parity-last-mile
```

Then create a PR, wait for checks, address review, merge, and mark child boards `satisfied_on_main` after confirming `origin/main` contains the merged work.

## Deferrals

Do not include these in the first last-mile PR unless a Judge explicitly approves the expansion:
- Native PTY bridge WebSocket terminal implementation.
- Mobile fire/drop/replay controls for webhook intents.
- A full web-style route system in iOS.
- New REST contracts for data already covered by current endpoints.
