# iOS Workbench And Automation Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the iOS app up to date with the web workbench, cross-repo issue board, webhook label automation, PR review sessions, and diagnostics surfaces that now exist in the web app.

**Architecture:** Treat the web REST API and `/api/v1/workbench` payload as the source of truth. First add shared Swift projections that make the aggregate payload useful, then split UI work into independent worktrees: board, repo automation, PR review/session routing, and diagnostics. Keep GoalBuddy as the PM/proof layer, but use parallel subagents only after shared model/API dependencies are stable.

**Tech Stack:** SwiftUI, Swift 6, XCTest, XcodeBuildMCP, Next.js App Router REST routes, pnpm/Turborepo, GoalBuddy.

---

## Current Baseline

The web app has two active dashboard surfaces:

- `/` is still the older all-issues/PR list surface with tabs, sections, repo chips, mine filter, sort, search, keyboard nav, filters sheet, and quick create.
- `/workbench` is the newer command-center surface. It exposes modes for `Issues`, `Board`, `PRs`, `Workbench`, `Quick Create`, and `Settings`, and consumes `GET /api/v1/workbench`.

The workbench payload includes:

- repos and repo automation settings
- active deployments
- session previews
- issue summaries and priorities
- recent completions
- webhook events
- PR review records
- settings, health, user, and generated timestamp

iOS already has:

- Today, Issues, PRs, and Active/Sessions tabs
- cross-repo issue list sections, search, repo/mine filters, priority sort, launch/re-enter terminal, quick create, and parse flow
- PR list/detail/review/merge/comment flows
- label management for issues
- active sessions list, terminal re-entry, preview polling, and end-session flow
- decoded `WorkbenchPayload`
- `WorkbenchBootstrap`, currently focused on issue summaries, priorities, and active issue deployments

The biggest current gap is not basic API reachability. It is that iOS has not made the workbench/webhook automation model first-class: PR-target sessions, webhook events, PR review history, repo automation health, diagnostics, and the cross-repo work board are still underexposed.

## Source Of Truth Files

Web contracts and UX:

- `packages/web/app/api/v1/workbench/route.ts`
- `packages/web/lib/workbench-data.ts`
- `packages/web/components/workbench/workbench-types.ts`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/components/workbench/GlobalIssuesFocus.tsx`
- `packages/web/components/workbench/BoardFocus.tsx`
- `packages/web/components/workbench/InstancePane.tsx`
- `packages/web/components/workbench/IssueFocus.tsx`
- `packages/web/components/workbench/PullRequestsFocus.tsx`
- `packages/web/components/repos/RepoSettingsPanel.tsx`
- `packages/web/lib/webhook-health.ts`
- `packages/web/lib/github-webhook-handler.ts`
- `packages/web/lib/webhook-intent-worker.ts`
- `packages/web/lib/webhook-pr-intent.ts`

iOS and shared Swift:

- `apple/IssueCTL/App/ContentView.swift`
- `apple/IssueCTL/Views/Today/TodayView.swift`
- `apple/IssueCTL/Views/Issues/IssueListView.swift`
- `apple/IssueCTL/Views/Issues/IssueDetailView.swift`
- `apple/IssueCTL/Views/PullRequests/PRListView.swift`
- `apple/IssueCTL/Views/PullRequests/PRDetailView.swift`
- `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- `apple/IssueCTL/Views/Sessions/SessionRowView.swift`
- `apple/IssueCTL/Views/Terminal/TerminalView.swift`
- `apple/IssueCTL/Views/Settings/AddRepoSheet.swift`
- `apple/IssueCTL/Views/Settings/EditRepoSheet.swift`
- `apple/IssueCTLShared/Models/WorkbenchPayload.swift`
- `apple/IssueCTLShared/Models/WorkbenchBootstrap.swift`
- `apple/IssueCTLShared/Models/Deployment.swift`
- `apple/IssueCTLShared/Services/APIClient+Workbench.swift`
- `apple/IssueCTLShared/Services/APIClient+Settings.swift`
- `apple/IssueCTLShared/Services/APIClient+AdvancedSettings.swift`
- `apple/IssueCTLTests/WorkbenchPayloadDecodingTests.swift`
- `apple/IssueCTLTests/WorkbenchBootstrapMapperTests.swift`
- `apple/IssueCTLTests/ModelDecodingTests.swift`
- `apple/IssueCTLTests/APIClientTests.swift`

## Execution Setup

- [ ] **Step 1: Preserve the dirty current work**

Run:

```bash
git status --short --branch
git diff --stat
```

Expected: the current checkout is dirty. Do not create implementation worktrees from `origin/main` until these current web and Apple parity changes are committed, stashed, or intentionally rebased into the baseline branch.

- [ ] **Step 2: Choose the execution baseline**

If the current branch is the source of truth for recent web UX and automation work, first create a branch or commit that contains it:

```bash
git branch --show-current
git status --short
```

Expected: a named baseline branch exists. If not, create one with the `codex/` prefix before implementation.

- [ ] **Step 3: Create one shared-model worktree**

After baseline is clean enough to branch from, run:

```bash
git worktree add .worktrees/ios-workbench-shared-projections -b codex/ios-workbench-shared-projections <baseline-branch>
```

Expected: clean worktree.

- [ ] **Step 4: Create parallel UI worktrees only after Task 1 passes**

Run after Task 1 lands or is mergeable:

```bash
git worktree add .worktrees/ios-cross-repo-board -b codex/ios-cross-repo-board codex/ios-workbench-shared-projections
git worktree add .worktrees/ios-pr-automation-sessions -b codex/ios-pr-automation-sessions codex/ios-workbench-shared-projections
git worktree add .worktrees/ios-repo-automation-health -b codex/ios-repo-automation-health codex/ios-workbench-shared-projections
git worktree add .worktrees/ios-diagnostics-surface -b codex/ios-diagnostics-surface codex/ios-workbench-shared-projections
```

Expected: four clean worktrees with disjoint UI responsibilities.

## Task 1: Shared Workbench Projections

**Files:**
- Modify: `apple/IssueCTLShared/Models/WorkbenchBootstrap.swift`
- Modify: `apple/IssueCTLShared/Models/WorkbenchPayload.swift`
- Modify: `apple/IssueCTLTests/WorkbenchBootstrapMapperTests.swift`
- Modify: `apple/IssueCTLTests/WorkbenchPayloadDecodingTests.swift`

- [ ] **Step 1: Add failing projection tests**

Add tests proving `WorkbenchBootstrap` can answer:

- all repos with automation enabled/disabled
- all active issue deployments
- all active PR deployments
- recent completions by repo
- webhook events by repo and target
- PR review runs by repo and PR number

Run:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests/WorkbenchBootstrapMapperTests
```

Expected: fail before implementation.

- [ ] **Step 2: Implement pure projections**

Extend `WorkbenchBootstrap` with computed indexes, keeping it model-only and UI-free:

```swift
let activePrDeploymentsByKey: [WorkbenchIssueKey: WorkbenchDeployment]
let webhookEventsByRepo: [String: [WorkbenchWebhookEvent]]
let prReviewsByRepo: [String: [WorkbenchPrReview]]
let recentCompletionsByRepo: [String: [WorkbenchDeployment]]
```

Expected: no view code changes in this task.

- [ ] **Step 3: Verify model tests**

Run:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests/WorkbenchPayloadDecodingTests -only-testing:IssueCTLTests/WorkbenchBootstrapMapperTests
```

Expected: pass.

## Task 2: Cross-Repo Mobile Work Board

**Files:**
- Create: `apple/IssueCTL/Views/Workbench/WorkbenchBoardView.swift`
- Create: `apple/IssueCTL/Views/Workbench/WorkbenchBoardRow.swift`
- Modify: `apple/IssueCTL/App/ContentView.swift`
- Modify: `apple/IssueCTL/Views/Issues/IssueListView.swift`
- Modify: `apple/IssueCTLTests/ViewLogicTests.swift`
- Modify: `apple/IssueCTLUITests/IssueCTLUITests.swift`

- [ ] **Step 1: Add a first-class Board tab or Issues board mode**

Use the web distinction:

- `Issues`: global issue rows across repos
- `Board`: cross-repo board with running-only and priority/payload sort

For iOS, prefer a compact Board mode inside Issues first unless the maintainer wants a fifth tab.

- [ ] **Step 2: Drive the board from `api.workbench()`**

The board should use workbench issue summaries and projections, not refetch every repo through older issue endpoints for the initial board.

Required UI states:

- loading
- server error
- repo issue error
- no tracked repos
- no matching issues
- stale/cache timestamp

- [ ] **Step 3: Match web board behavior**

Implement:

- grouped by repo
- all open issues
- running-only toggle
- payload order and priority sort
- status chip: open, running, closed
- priority chip
- tap to open issue detail

- [ ] **Step 4: Verify**

Run:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests/ViewLogicTests
pnpm ios:ui-smoke:fast
```

Expected: unit tests and smoke flow pass.

## Task 3: PR Automation And PR-Target Sessions

**Files:**
- Modify: `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- Modify: `apple/IssueCTL/Views/Sessions/SessionRowView.swift`
- Modify: `apple/IssueCTL/Views/PullRequests/PRListView.swift`
- Modify: `apple/IssueCTL/Views/PullRequests/PRDetailView.swift`
- Modify: `apple/IssueCTLTests/ModelDecodingTests.swift`
- Modify: `apple/IssueCTLUITests/SessionManagementTests.swift`
- Modify: `apple/IssueCTLUITests/PRBrowseTests.swift`

- [ ] **Step 1: Finish PR-target session routing**

Current dirty work already moves `ActiveDeployment` toward `targetType` and `targetNumber`. Complete the UX:

- issue sessions navigate to issue detail
- PR sessions navigate to PR detail
- terminal title uses repo plus target label
- end-session request includes `targetType` and `targetNumber`

- [ ] **Step 2: Add PR automation status**

Surface per-PR signals from workbench projections:

- latest review run status
- review trigger source: webhook or comment command
- linked deployment if in progress
- range label or reviewed SHA pair
- completed summary if present

- [ ] **Step 3: Add safe auto-review label affordance**

On PR detail, expose `issuectl:auto-review` as a deliberate action through the existing labels API only if repo automation is enabled or explain why it will not launch.

- [ ] **Step 4: Verify**

Run:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests/ModelDecodingTests -only-testing:IssueCTLTests/APIClientTests
pnpm ios:ui-smoke:fast
```

Expected: pass, including PR-target deployment decoding and session navigation tests.

## Task 4: Repo Automation Setup And Health

**Files:**
- Modify: `apple/IssueCTLShared/Models/Repo.swift`
- Modify: `apple/IssueCTLShared/Services/APIClient+Settings.swift`
- Modify: `apple/IssueCTL/Views/Settings/AddRepoSheet.swift`
- Modify: `apple/IssueCTL/Views/Settings/EditRepoSheet.swift`
- Create: `apple/IssueCTL/Views/Repos/RepoAutomationHealthView.swift`
- Modify: `apple/IssueCTLTests/APIClientExtensionTests.swift`
- Modify: `apple/IssueCTLUITests/SettingsTests.swift`

- [ ] **Step 1: Expand repo models and requests**

`POST /api/v1/repos` already accepts:

- `autoLaunchIssues`
- `autoReviewPrs`
- `issueAgent`
- `reviewAgent`
- `reviewPreamble`
- `webhookPayloadMode`
- `installWebhook`
- `firstPingTimeoutMs`

`PATCH /api/v1/repos/:owner/:repo` already accepts:

- `localPath`
- `branchPattern`
- `autoLaunchIssues`
- `autoReviewPrs`
- `issueAgent`
- `reviewAgent`
- `reviewPreamble`
- `webhookPayloadMode`

Update Swift request/response types to preserve these fields.

- [ ] **Step 2: Add repo automation setup to Add Repo**

Mirror the web wizard in a compact iOS form:

- issue sessions toggle
- PR reviews toggle
- issue agent picker
- review agent picker
- webhook payload picker
- optional review preamble
- install webhook toggle
- install result summary: secret, webhook, labels, first ping

- [ ] **Step 3: Add repo automation editing**

In `EditRepoSheet`, add:

- automation toggles
- agent pickers
- payload mode
- review preamble
- explicit warning that disabling automation may end active webhook-launched sessions

- [ ] **Step 4: Add webhook/label repair actions**

Expose:

- create webhook
- rotate webhook
- recreate automation labels

Use existing REST routes:

```text
POST /api/v1/repos/:owner/:repo/webhook { "action": "create" | "rotate" }
POST /api/v1/repos/:owner/:repo/labels { "action": "recreate" }
```

- [ ] **Step 5: Verify**

Run:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests/APIClientExtensionTests
pnpm ios:ui-smoke:fast
```

Expected: request body tests prove iOS sends automation fields and UI smoke can view/edit repo automation.

## Task 5: Diagnostics-First iOS Failure Surface

**Files:**
- Create: `apple/IssueCTLShared/Models/Diagnostics.swift`
- Create: `apple/IssueCTLShared/Services/APIClient+Diagnostics.swift`
- Create: `apple/IssueCTL/Views/Diagnostics/DeploymentDiagnosticsView.swift`
- Modify: `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- Modify: `apple/IssueCTL/Views/Terminal/TerminalView.swift`
- Modify: `apple/IssueCTL/Views/Launch/LaunchView.swift`
- Modify: `apple/IssueCTLTests/ModelDecodingTests.swift`
- Modify: `apple/IssueCTLTests/APIClientTests.swift`

- [ ] **Step 1: Confirm diagnostics routes in baseline**

Run:

```bash
git ls-tree -r --name-only HEAD | rg 'packages/web/app/api/v1/diagnostics'
```

Expected: diagnostics routes exist before iOS client work. If not, land the live-contract route branch first.

- [ ] **Step 2: Add diagnostics models and API**

Support:

```text
GET /api/v1/diagnostics?deploymentId=<id>&limit=<n>
GET /api/v1/diagnostics/deployments/<id>?limit=<n>
```

- [ ] **Step 3: Add UI entry points**

Add diagnostics from:

- session controls
- terminal errors
- launch failure card
- stale or missing terminal state

The UI should show chronological events, severity, event name, message, target, and deployment ID.

- [ ] **Step 4: Verify**

Run:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests/ModelDecodingTests -only-testing:IssueCTLTests/APIClientTests
```

Expected: diagnostics decoding and endpoint path tests pass.

## Task 6: GoalBuddy Board Shape For Execution

**Files:**
- Create: `docs/goals/ios-workbench-automation-parity/goal.md`
- Create: `docs/goals/ios-workbench-automation-parity/state.yaml`

- [ ] **Step 1: Use one fresh GoalBuddy board**

Do not continue completed parity boards. Create a new tranche board with this oracle:

```text
iOS can answer, from the app alone, what work exists across tracked repos,
which issues/PRs have active or completed automation sessions, whether webhook
automation is healthy, how to apply/remove trigger labels safely, and how to
diagnose failed launch/terminal/session states.
```

- [ ] **Step 2: Seed one Scout, one Judge, then Workers**

Recommended board sequence:

1. Scout: produce a gap matrix against current baseline and this plan.
2. Judge: accept/reject the matrix, select dependency order, and authorize Task 1.
3. Worker: implement Task 1 shared projections.
4. Judge: verify Task 1 allows parallel UI workers.
5. Workers: run Tasks 2-5 in separate worktrees with disjoint file ownership.
6. Judge: merge or reject each package with evidence.
7. PM: run final audit and proof loop.

- [ ] **Step 3: Record proof per package**

Each Worker receipt must include:

- changed files
- exact test commands
- pass/fail output summary
- strongest realistic failure mode tested
- screenshots or UI test evidence when UI changed

## Task 7: Final Verification Matrix

**Files:**
- No production file ownership. This is a proof task.

- [ ] **Step 1: Run Apple focused checks**

Run:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests
pnpm ios:ui-smoke:fast
```

Expected: pass.

- [ ] **Step 2: Run touched web/core checks if routes changed**

Run as applicable:

```bash
pnpm --dir packages/web test
pnpm --dir packages/web typecheck
pnpm --dir packages/web lint
pnpm --dir packages/core test
pnpm --dir packages/core typecheck
pnpm --dir packages/core lint
```

Expected: pass or explicitly document pre-existing failures.

- [ ] **Step 3: Burden of proof check**

Try to disprove the change:

- verify a PR-target session appears in iOS Sessions and routes to PR detail
- verify an issue auto-launch label can be applied from iOS and the app shows the automation state
- verify a repo with missing webhook URL does not look healthy
- verify a launch/terminal failure points to diagnostics
- verify the board does not double count active sessions when both `/deployments` and `/workbench` return the same deployment

Expected: each failure mode has command, test, screenshot, or direct inspection evidence.

## Recommended Parallel Ownership

Do not run all five packages at once from scratch. Use this order:

1. `codex/ios-workbench-shared-projections`: Task 1 only.
2. `codex/ios-cross-repo-board`: Task 2 after Task 1.
3. `codex/ios-pr-automation-sessions`: Task 3 after Task 1.
4. `codex/ios-repo-automation-health`: Task 4 after Task 1.
5. `codex/ios-diagnostics-surface`: Task 5 after diagnostics route confirmation.

Merge sequence:

1. Shared projections.
2. PR-target sessions.
3. Repo automation health.
4. Diagnostics.
5. Board UI, because it should benefit from the other projections.

## GoalBuddy Usage Improvements

Use GoalBuddy as the owner-outcome controller, not as the implementation bottleneck.

What to keep:

- explicit oracle
- Scout evidence receipts
- Judge gates at phase boundaries
- one active PM task
- final proof audit

What to change:

- stop rerunning broad iOS parity prompts as new discovery work
- do not continue completed boards unless their oracle still matches
- make the first Scout produce a gap matrix, not another plan
- let the first Judge authorize the largest safe vertical slice
- use separate worktrees and subagents for independent UI packages after shared contracts land
- make each Worker receipt include the strongest attempted disproof

The better next command is not another broad prompt. It is:

```text
/goal Follow docs/goals/ios-workbench-automation-parity/goal.md.
```

after creating that board from this plan.

## Self-Review

- Spec coverage: web workbench, all-issues board, webhook automation labels, repo automation settings, PR review sessions, terminal/session state, diagnostics, and GoalBuddy process improvements are covered.
- Placeholder scan: no task relies on undefined web routes except diagnostics, which is explicitly gated by Task 5 Step 1 because prior plans indicate those routes may live on a newer branch.
- Type consistency: `WorkbenchPayload`, `WorkbenchRepo`, `WorkbenchDeployment`, `WorkbenchBootstrap`, `DeploymentTargetType`, `LaunchAgent`, and `WebhookPayloadMode` match current Swift/web names.
