# iOS Web Parity Next Tranche Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the iOS app from current mainline parity to the next useful level: route-focused board/session/review navigation, shared workbench-backed issue data where it reduces drift, and cleaner automation activity behavior.

**Architecture:** Treat `origin/main` at `86248bc` or newer as the source of truth before doing any iOS work. The web app already exposes the cross-repo workbench, repo automation settings, webhook/review routes, diagnostics, PR review sessions, and mobile APIs; this tranche closes the smaller iOS gaps that remain after those merged slices.

**Tech Stack:** SwiftUI, IssueCTLShared models/services, Xcode iOS Simulator tests, pnpm/Turborepo web/core checks, GoalBuddy for autonomous tranche execution.

---

## Current-State Audit

This audit was done in a fresh worktree:

```bash
cd /Users/neonwatty/Desktop/issuectl/.worktrees/ios-web-parity-plan-20260601
git rev-parse --short HEAD
# 86248bc
git log -1 --oneline
# 86248bc Merge pull request #582 from mean-weasel/codex/ios-workbench-api-parity-20260531
```

The original checkout was behind `origin/main`, so several apparent iOS gaps from older sessions are already solved on main. Do not start from the dirty checkout without first rebasing or creating a clean worktree from `origin/main`.

Already present on current main:

- Web workbench route and payload builder: `packages/web/app/api/v1/workbench/route.ts`, `packages/web/lib/workbench-data.ts`, and `packages/web/components/workbench/*`.
- Web dashboard navigation for Issues, Board, PRs, Workbench, Quick Create, and Settings in `packages/web/components/workbench/WorkbenchShell.tsx`.
- Web repo automation controls and webhook activity in `packages/web/components/repos/RepoSettingsPanel.tsx` and workbench setup panels.
- Webhook automation for issue auto-launch and PR auto-review via label-driven intents in `packages/web/lib/github-webhook-handler.ts`, `packages/web/lib/webhook-intent-worker.ts`, and `packages/web/lib/webhook-pr-intent.ts`.
- Mobile API routes for workbench, session overview, diagnostics, repo webhook health/events, global webhook events, PR review runs, and review-run actions.
- iOS shared models for `WorkbenchPayload`, `WorkbenchRepo`, automation settings, webhook events, review runs, session overview, and diagnostics in `apple/IssueCTLShared/Models/Repo.swift`.
- iOS API client calls for `workbench`, `sessionsOverview`, global/repo webhook events, review runs, review actions, diagnostics, repo automation settings, webhook configuration, webhook health, label recreation, and cache invalidation in `apple/IssueCTLShared/Services/APIClient.swift` and `APIClient+Settings.swift`.
- Native iOS Board tab backed by `/api/v1/workbench` in `apple/IssueCTL/Views/Workbench/BoardView.swift` and `apple/IssueCTL/ViewModels/WorkbenchStore.swift`.
- iOS repo automation settings, webhook controls, and repo-scoped activity in `apple/IssueCTL/Views/Settings/EditRepoSheet.swift` and `RepoAutomationActivityView.swift`.
- iOS global automation feed in `apple/IssueCTL/Views/Settings/AutomationFeedView.swift`.
- iOS Active tab with session/review grouping, diagnostics, terminals, review detail, and filters in `apple/IssueCTL/Views/Sessions/SessionListView.swift`.
- GoalBuddy closeout notes say the large parity conveyor is complete: `docs/goals/ios-web-parity/notes/T009-final-parity-audit.md`, `docs/goals/ios-web-parity/notes/T010-final-qa-closeout.md`, and `docs/goals/ios-web-parity-conveyor/state.yaml`.

Remaining high-value gaps:

- `apple/IssueCTL/App/ContentView.swift` deliberately drops route context for `.board`, `.sessions`, and `.review`. The comment says Board/Sessions focus can consume preserved route context later.
- `apple/IssueCTL/Views/Workbench/BoardView.swift` can open issue cards manually, but it does not consume a workbench route like `/workbench?repo=owner%2Frepo&deployment=123` to preselect the repo and focus the running issue.
- `apple/IssueCTL/Views/Sessions/SessionListView.swift` can browse sessions and reviews, but it does not consume `/sessions?repo=...` or `/reviews/<id>` deep links to apply filters and open the matching review detail.
- Today and Issues still have their own first-read paths while Board uses `/api/v1/workbench`. That was an explicit prior deferral; it is not a correctness blocker, but it is where future drift can creep in.
- iOS settings can read and write settings through `APIClient.updateSettings`, but `AdvancedSettingsView` does not expose `public_webhook_base_url`, while web repo settings and webhook install flows depend on it.
- iOS webhook status views treat every non-`ok` webhook health state the same. Web can return `unknown` when GitHub hook inspection lacks access; that should be visually distinct from stale or failed automation.
- iOS launch models and API calls support `terminalBackend`, but the launch UI does not expose the web-only terminal backend override. This is a low-priority test-repo parity gap, not a broad user-facing requirement.
- `apple/IssueCTLShared/Services/APIClient.swift` still contains a stale comment saying automation list endpoints depend on issue `#546` and are fixture-driven. Current main has the endpoints.
- Streaming updates in Session and Automation views refresh eagerly on every websocket message. That is acceptable for correctness, but a burst of webhook/review events can cause repeated full reloads.

## File Map

Primary iOS files:

- `apple/IssueCTL/App/ContentView.swift`: tab routing and `pendingRoute` ownership.
- `apple/IssueCTL/Services/SetupLink.swift`: `AppRoute` parsing; add route data only if existing cases cannot express the target.
- `apple/IssueCTL/Views/Workbench/BoardView.swift`: consume board route context and navigate to a matching issue/deployment.
- `apple/IssueCTL/ViewModels/WorkbenchStore.swift`: add deterministic helpers to find repo, issue, and deployment matches for route focus.
- `apple/IssueCTL/Views/Sessions/SessionListView.swift`: consume session/review route context, apply filters, and open review/session destinations.
- `apple/IssueCTL/Views/Settings/AdvancedSettingsView.swift`: expose `public_webhook_base_url` editing in the existing settings form.
- `apple/IssueCTL/Views/Settings/EditRepoSheet.swift`: distinguish `unknown` webhook health from warning/error in status copy and tint.
- `apple/IssueCTLShared/Services/APIClient+AdvancedSettings.swift`: verify settings update already sends arbitrary allowed settings keys.
- `apple/IssueCTLShared/Services/APIClient.swift`: remove stale comments and keep route-related cache invalidation intact.
- `apple/IssueCTLTests/ViewLogicTests.swift`: route parsing and pure helper coverage.
- `apple/IssueCTLTests/WorkbenchStoreTests.swift`: route-to-board-item matching.
- `apple/IssueCTLTests/APIClientExtensionTests.swift`: add `public_webhook_base_url` settings round-trip expectations.
- `apple/IssueCTLUITests/Helpers/MockServer.swift`: add or reuse fixture data for focused Board/Sessions deep-link tests.
- `apple/IssueCTLUITests/IssueCTLUITests.swift` or `SessionManagementTests.swift`: smoke test the deep-link focus behavior if the app test harness supports launch URLs.

Web verification files:

- `packages/web/app/api/v1/workbench/route.ts`
- `packages/web/app/api/v1/sessions/overview/route.ts`
- `packages/web/app/api/v1/webhooks/events/route.ts`
- `packages/web/app/api/v1/repos/[owner]/[repo]/review-runs/route.ts`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/components/repos/RepoSettingsPanel.tsx`

GoalBuddy files:

- Create a fresh goal under `docs/goals/ios-parity-next-tranche/`.
- Do not continue `docs/goals/mac-ios-parity/`, `docs/goals/workbench/`, `docs/goals/completed-issue-session-ux/`, `docs/goals/ios-parity-hardening/`, `docs/goals/ios-parity-followup-hardening/`, or the completed `ios-web-parity-conveyor` board.

---

### Task 1: Baseline Gate and Gap Matrix

**Files:**
- Create: `docs/goals/ios-parity-next-tranche/notes/T001-current-main-gap-matrix.md`
- Inspect: `docs/goals/ios-web-parity/notes/T009-final-parity-audit.md`
- Inspect: `docs/goals/ios-web-parity/notes/T010-final-qa-closeout.md`
- Inspect: `docs/goals/ios-web-parity-conveyor/state.yaml`

- [ ] **Step 1: Verify the branch is current**

Run:

```bash
cd /Users/neonwatty/Desktop/issuectl/.worktrees/ios-web-parity-plan-20260601
git fetch origin
git status --short --branch
git rev-parse --short HEAD
git merge-base --is-ancestor HEAD origin/main && echo "HEAD is on or behind origin/main"
```

Expected: the branch is clean except plan/goal files, and `HEAD` is `86248bc` or newer.

- [ ] **Step 2: Re-run source-backed gap search**

Run:

```bash
rg -n "Board/Sessions focus|Depends on issue #546|deferred|follow-up" \
  apple/IssueCTL apple/IssueCTLShared docs/goals/ios-web-parity docs/goals/ios-web-parity-conveyor
```

Expected: the route-focus comment and stale API comment appear; any new hits must be classified as `real_gap`, `historical_note`, or `not_this_tranche`.

- [ ] **Step 3: Write the gap matrix**

Create `docs/goals/ios-parity-next-tranche/notes/T001-current-main-gap-matrix.md` with this structure:

```markdown
# T001 Current Main Gap Matrix

Baseline: `origin/main` at the short SHA printed by Step 1.

## Already Satisfied

- Workbench API parity:
  - Evidence: `apple/IssueCTLShared/Services/APIClient.swift` has `workbench(refresh:maxAge:)`.
  - Evidence: `apple/IssueCTL/Views/Workbench/BoardView.swift` renders the native Board tab.
- Repo automation settings:
  - Evidence: `apple/IssueCTL/Views/Settings/EditRepoSheet.swift`.
- Automation activity:
  - Evidence: `apple/IssueCTL/Views/Settings/AutomationFeedView.swift`.
- Session/review overview:
  - Evidence: `apple/IssueCTL/Views/Sessions/SessionListView.swift`.

## Real Remaining Gaps

1. Board deep-link focus drops route context.
2. Sessions/reviews deep-link focus drops route context.
3. Today/Issues do not share workbench first-read data.
4. `public_webhook_base_url` is not editable on iOS.
5. Webhook health `unknown` is not visually distinct on iOS.
6. Streaming reloads are uncoalesced.
7. Stale comment in `APIClient.swift`.

## Not This Tranche

- Replacing the web Workbench shell.
- Rewriting the Board visual design.
- Adding new webhook server behavior.
```

- [ ] **Step 4: Commit the audit only if the goal run will preserve notes**

```bash
git add docs/goals/ios-parity-next-tranche/notes/T001-current-main-gap-matrix.md
git commit -m "docs: record current iOS parity gap matrix"
```

If this is being executed inside a GoalBuddy run that does not commit notes separately, keep the file unstaged until the slice commit.

---

### Task 2: Preserve Route Context for Board, Sessions, and Reviews

**Files:**
- Modify: `apple/IssueCTL/App/ContentView.swift`
- Test: `apple/IssueCTLTests/ViewLogicTests.swift`

- [ ] **Step 1: Write the failing route-handling test**

Add a tiny pure helper in the app target instead of testing SwiftUI state directly:

```swift
enum AppRouteDestination: Equatable {
    case tab(AppTab, pendingRoute: AppRoute?)
}

func destination(for route: AppRoute) -> AppRouteDestination {
    switch route {
    case .issue:
        return .tab(.issues, pendingRoute: route)
    case .pullRequest:
        return .tab(.pullRequests, pendingRoute: route)
    case .board:
        return .tab(.board, pendingRoute: route)
    case .sessions, .review:
        return .tab(.active, pendingRoute: route)
    }
}
```

Then add tests:

```swift
func testRouteDestinationPreservesBoardContext() throws {
    let route = AppRoute.board(repoFullName: "mean-weasel/issuectl", deploymentId: 113)
    XCTAssertEqual(destination(for: route), .tab(.board, pendingRoute: route))
}

func testRouteDestinationPreservesReviewContext() throws {
    let route = AppRoute.review(id: "review-123")
    XCTAssertEqual(destination(for: route), .tab(.active, pendingRoute: route))
}
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/ViewLogicTests \
  -quiet
```

Expected: fails until the helper and handler preserve the pending route for board/session/review.

- [ ] **Step 3: Implement the route helper and use it from `handle(_:)`**

Keep the behavior local to `ContentView.swift`:

```swift
private func handle(_ route: AppRoute) {
    switch destination(for: route) {
    case .tab(let tab, let route):
        selectedTab = tab
        pendingRoute = route
    }
}
```

If `AppTab` is private and tests cannot see it, move `destination(for:)` into a testable internal helper that returns a small internal enum in `ContentView.swift`; do not make tab-routing public API.

- [ ] **Step 4: Wire the route binding into tabs**

Update tab construction:

```swift
BoardView(
    onShowSettings: { showSettings = true },
    route: $pendingRoute
)

SessionListView(
    onShowSettings: { showSettings = true },
    onShowIssues: { selectedTab = .issues },
    route: $pendingRoute
)
```

- [ ] **Step 5: Re-run route tests**

Run the same `xcodebuild test` command from Step 2.

Expected: route helper tests pass.

---

### Task 3: Board Deep-Link Focus

**Files:**
- Modify: `apple/IssueCTL/Views/Workbench/BoardView.swift`
- Modify: `apple/IssueCTL/ViewModels/WorkbenchStore.swift`
- Test: `apple/IssueCTLTests/WorkbenchStoreTests.swift`

- [ ] **Step 1: Write matching-helper tests**

Add tests for a deployment-based workbench route:

```swift
func testFindsBoardIssueForDeploymentRoute() {
    let store = WorkbenchStore()
    store.payload = WorkbenchStoreTests.payload(
        issues: [
            WorkbenchStoreTests.issue(number: 10, title: "Plain issue", state: "open", hasActiveDeployment: false),
            WorkbenchStoreTests.issue(number: 11, title: "Running issue", state: "open", hasActiveDeployment: true),
        ]
    )

    let match = store.boardRouteTarget(repoFullName: "mean-weasel/issuectl", deploymentId: 42)

    XCTAssertEqual(match?.owner, "mean-weasel")
    XCTAssertEqual(match?.repoName, "issuectl")
    XCTAssertEqual(match?.issue.number, 11)
}
```

Add a repo-only route test:

```swift
func testBoardRouteSelectsRepoWithoutDeployment() {
    let store = WorkbenchStore()
    store.payload = WorkbenchStoreTests.payload(issues: [])

    let repoIds = store.repoIds(matchingFullName: "mean-weasel/issuectl")

    XCTAssertEqual(repoIds, Set([1]))
}
```

- [ ] **Step 2: Run the failing tests**

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/WorkbenchStoreTests \
  -quiet
```

- [ ] **Step 3: Implement store helpers**

Add focused helpers to `WorkbenchStore`:

```swift
func repoIds(matchingFullName fullName: String?) -> Set<Int> {
    guard let fullName, !fullName.isEmpty else { return [] }
    return Set(repos.filter { $0.fullName == fullName }.map(\.id))
}

func boardRouteTarget(repoFullName: String?, deploymentId: Int?) -> WorkbenchBoardIssue? {
    if let repoFullName {
        selectedRepoIds = repoIds(matchingFullName: repoFullName)
    }

    guard let deploymentId else { return nil }
    return boardIssues(filteringByRepoOnly: true).first { item in
        item.deployment?.id == deploymentId
    }
}
```

If `boardIssues(filteringByRepoOnly:)` must stay private, keep the helper inside `WorkbenchStore` and expose only the route target.

- [ ] **Step 4: Consume `AppRoute.board` in `BoardView`**

Add a binding:

```swift
@Binding var route: AppRoute?
```

After the workbench payload loads, consume the route exactly once:

```swift
.task(id: route) {
    await consumeRouteIfNeeded()
}

@MainActor
private func consumeRouteIfNeeded() async {
    guard case let .board(repoFullName, deploymentId) = route else { return }
    if store.payload == nil {
        await store.load(api: api)
    }

    if let target = store.boardRouteTarget(repoFullName: repoFullName, deploymentId: deploymentId) {
        store.filter = target.isRunning ? .running : .open
        navigationPath.append(BoardDestination.issue(
            owner: target.owner,
            repo: target.repoName,
            number: target.issue.number
        ))
    } else if let repoFullName {
        store.selectedRepoIds = store.repoIds(matchingFullName: repoFullName)
    }

    route = nil
}
```

- [ ] **Step 5: Re-run Board tests**

Run the command from Step 2.

Expected: store helper tests pass.

---

### Task 4: Sessions and Review Deep-Link Focus

**Files:**
- Modify: `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- Test: `apple/IssueCTLTests/ViewLogicTests.swift`
- Optional UI Test: `apple/IssueCTLUITests/SessionManagementTests.swift`

- [ ] **Step 1: Add route binding to SessionListView**

Change the view signature:

```swift
@Binding var route: AppRoute?
```

- [ ] **Step 2: Add route consumption**

After `load()` finishes, consume routes:

```swift
@MainActor
private func consumeRouteIfNeeded() async {
    guard let route else { return }
    switch route {
    case .sessions(let repoFullName):
        selectedTab = .sessions
        if let repoFullName, let repo = repos.first(where: { $0.fullName == repoFullName }) {
            selectedRepoIds = [repo.id]
        }
        self.route = nil
    case .review(let id):
        selectedTab = .reviews
        selectedReviewStatus = .all
        if overviewResponse == nil {
            await load()
        }
        reviewDetailTarget = ReviewRunDetailTarget(id: id)
        self.route = nil
    default:
        return
    }
}
```

Call it with:

```swift
.task(id: route) {
    await consumeRouteIfNeeded()
}
```

- [ ] **Step 3: Guard against reload loops**

When a route changes filters, `overviewQuerySignature` will trigger `load()`. Keep route clearing after the first filter application, and avoid setting `selectedRepoIds` repeatedly for the same route.

- [ ] **Step 4: Run focused tests**

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/ViewLogicTests \
  -quiet
```

- [ ] **Step 5: Manual/smoke verification**

Launch URL examples against the simulator:

```bash
xcrun simctl openurl booted "issuectl://sessions?repo=mean-weasel%2Fissuectl"
xcrun simctl openurl booted "issuectl://reviews/review-123"
```

Expected: the Active tab opens; sessions route applies the repo filter, and review route opens the review detail sheet.

---

### Task 5: Workbench First-Read Consistency for Today and Issues

**Files:**
- Inspect: `apple/IssueCTL/Views/Today/TodayView.swift`
- Inspect: `apple/IssueCTL/Views/Issues/IssueListView.swift`
- Modify only if the existing data flow can use `WorkbenchStore` without broad rewrites.
- Test: existing Today/Issue list tests or a new focused view-model test.

- [ ] **Step 1: Identify the existing first-read paths**

Run:

```bash
rg -n "api\\.issues|api\\.activeDeployments|workbench\\(|IssueListView|TodayView" apple/IssueCTL apple/IssueCTLShared apple/IssueCTLTests
```

Expected: list which views still fetch issue/session summary data separately from `/api/v1/workbench`.

- [ ] **Step 2: Decide whether this tranche should modify code**

Use this decision rule:

- If Today/Issues can read already-decoded `WorkbenchPayload` through `APIClient.workbench(refresh:false)` without changing public navigation behavior, proceed.
- If the change would require a new shared app-level store, stop and create a follow-up architecture note. Do not invent a global state container in this tranche.

- [ ] **Step 3: Add one targeted test before implementation**

For a simple helper, test that a workbench issue summary maps to the existing issue-list row model. The test should assert issue number, title, repo full name, state, labels, and active deployment status.

- [ ] **Step 4: Implement the smallest useful shared read**

Prefer a helper in the existing view model layer rather than direct view mapping:

```swift
struct WorkbenchIssueListItem: Identifiable, Equatable {
    let id: String
    let owner: String
    let repo: String
    let number: Int
    let title: String
    let state: String
    let isRunning: Bool
}
```

Only keep this helper if it replaces duplicated mapping in Today or Issues. Delete it if the local code reads worse.

- [ ] **Step 5: Verify no behavior regression**

Run the focused Apple tests that cover issue rows and Today summaries:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/WorkbenchStoreTests \
  -only-testing:IssueCTLTests/APIClientTests/testWorkbenchEndpointURL \
  -quiet
```

---

### Task 6: Public Webhook Base URL and Health State Clarity

**Files:**
- Modify: `apple/IssueCTL/Views/Settings/AdvancedSettingsView.swift`
- Modify: `apple/IssueCTL/Views/Settings/EditRepoSheet.swift`
- Test: `apple/IssueCTLTests/APIClientExtensionTests.swift`
- Test: `apple/IssueCTLTests/ViewLogicTests.swift`

- [ ] **Step 1: Write settings round-trip coverage**

Update `testGetSettingsUsesSettingsEndpointAndDecodesDictionary` to include the webhook base URL:

```swift
return (self.makeResponse(url: request.url!), """
{"settings":{"launch_agent":"codex","cache_ttl":"300","worktree_dir":"/tmp/issuectl","public_webhook_base_url":"https://hooks.example.test"}}
""".data(using: .utf8)!)
```

Add the assertion:

```swift
XCTAssertEqual(settings["public_webhook_base_url"], "https://hooks.example.test")
```

Update `testUpdateSettingsSendsPatchBodyAndDecodesSuccess` to assert the PATCH body can include the webhook base URL:

```swift
XCTAssertEqual(json["public_webhook_base_url"] as? String, "https://hooks.example.test")
```

and pass:

```swift
let response = try await client.updateSettings([
    "launch_agent": "claude",
    "cache_ttl": "600",
    "public_webhook_base_url": "https://hooks.example.test",
])
```

- [ ] **Step 2: Run the focused API extension tests**

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/APIClientExtensionTests/testGetSettingsUsesSettingsEndpointAndDecodesDictionary \
  -only-testing:IssueCTLTests/APIClientExtensionTests/testUpdateSettingsSendsPatchBodyAndDecodesSuccess \
  -quiet
```

Expected: API tests already pass before UI work because the client sends arbitrary allowed keys.

- [ ] **Step 3: Add the editable webhook base URL field**

In `AdvancedSettingsView`, add state:

```swift
@State private var publicWebhookBaseURL = ""
```

Add it to `editableFields`:

```swift
("public_webhook_base_url", publicWebhookBaseURL),
```

Load it:

```swift
publicWebhookBaseURL = settings["public_webhook_base_url"] ?? ""
```

Add a form section near repo/webhook defaults:

```swift
Section {
    TextField("Public webhook base URL", text: $publicWebhookBaseURL)
        .keyboardType(.URL)
        .textContentType(.URL)
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
} header: {
    Text("Webhooks")
} footer: {
    Text("Base URL used when installing GitHub webhooks, such as https://hooks.example.com.")
}
```

- [ ] **Step 4: Extract webhook health presentation mapping**

Add a tiny mapping that makes `unknown` distinct:

```swift
private enum WebhookHealthPresentation {
    case ok
    case unknown
    case warning
    case error
    case uninstalled

    init(repoHasWebhook: Bool, health: WebhookAutomationHealth?) {
        guard let health else {
            self = repoHasWebhook ? .ok : .uninstalled
            return
        }
        switch health.state {
        case "ok": self = .ok
        case "unknown": self = .unknown
        case "error": self = .error
        default: self = .warning
        }
    }

    var icon: String {
        switch self {
        case .ok: return "checkmark.circle.fill"
        case .unknown: return "questionmark.circle.fill"
        case .warning, .error: return "exclamationmark.triangle.fill"
        case .uninstalled: return "dot.radiowaves.left.and.right"
        }
    }

    var tint: Color {
        switch self {
        case .ok: return .green
        case .unknown: return .secondary
        case .warning: return .orange
        case .error: return .red
        case .uninstalled: return .secondary
        }
    }
}
```

Use this mapping from `WebhookStatusSummary` for `icon` and `tint`:

```swift
private var presentation: WebhookHealthPresentation {
    WebhookHealthPresentation(repoHasWebhook: repo.webhookId != nil, health: health)
}
```

- [ ] **Step 5: Add a presentation test if the mapping is internal**

If `WebhookHealthPresentation` can be made testable without exposing SwiftUI internals, add:

```swift
func testWebhookUnknownHealthPresentationIsDistinct() {
    let health = WebhookAutomationHealth(
        state: "unknown",
        summary: "GitHub hook inspection unavailable",
        detail: nil,
        recovery: nil,
        expectedUrl: nil,
        hookId: nil,
        githubUrl: nil,
        latestDelivery: nil
    )

    XCTAssertEqual(WebhookHealthPresentation(repoHasWebhook: true, health: health).icon, "questionmark.circle.fill")
}
```

If this requires making view-only types public, skip the test and verify through UI inspection; do not widen access solely for cosmetics.

- [ ] **Step 6: Run focused verification**

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/APIClientExtensionTests \
  -quiet
```

---

### Task 7: Coalesce Automation Stream Refreshes

**Files:**
- Modify: `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- Modify: `apple/IssueCTL/Views/Settings/AutomationFeedView.swift`
- Modify: `apple/IssueCTL/Views/Settings/RepoAutomationActivityView.swift`
- Test: add a small pure helper test if a throttler object is introduced.

- [ ] **Step 1: Inspect current stream loops**

Run:

```bash
rg -n "stream.*Updates|webhookEventsStream|Task\\.sleep|load\\(includeRepos: false\\)|loadFeed" \
  apple/IssueCTL/Views/Sessions apple/IssueCTL/Views/Settings
```

- [ ] **Step 2: Add a simple refresh coalescer**

Keep it local and dependency-free:

```swift
@MainActor
private final class RefreshCoalescer {
    private var pendingTask: Task<Void, Never>?

    func schedule(after delay: Duration = .milliseconds(350), action: @escaping @MainActor () async -> Void) {
        pendingTask?.cancel()
        pendingTask = Task {
            do { try await Task.sleep(for: delay) } catch { return }
            await action()
        }
    }

    func cancel() {
        pendingTask?.cancel()
        pendingTask = nil
    }
}
```

- [ ] **Step 3: Use it in stream handlers**

Replace immediate reloads like this:

```swift
guard terminalPresentation == nil else { continue }
coalescer.schedule {
    await load(includeRepos: false)
}
```

For settings feeds:

```swift
coalescer.schedule {
    await loadFeed(refresh: true)
}
```

- [ ] **Step 4: Clean up on disappearance**

If the views have `.onDisappear`, call:

```swift
coalescer.cancel()
```

If there is no existing disappearance hook, add one only to views that own long-lived stream tasks.

- [ ] **Step 5: Verify focused UI tests still pass**

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/RepoAutomationActivityViewTests \
  -quiet
```

---

### Task 8: Documentation and Stale Comment Cleanup

**Files:**
- Modify: `apple/IssueCTLShared/Services/APIClient.swift`
- Modify: `docs/goals/ios-parity-next-tranche/notes/T001-current-main-gap-matrix.md`

- [ ] **Step 1: Remove stale endpoint comment**

Delete this obsolete comment in `APIClient.swift`:

```swift
// Depends on issue #546: these automation list endpoints are fixture-driven
// until the web API exposes persisted automation activity.
```

Do not change endpoint behavior in this cleanup step.

- [ ] **Step 2: Update the gap matrix receipt**

Append:

```markdown
## Cleanup Receipt

- Removed stale `#546` fixture-driven endpoint comment from `APIClient.swift`.
- Verified current main exposes persisted automation activity routes.
```

- [ ] **Step 3: Run diff check**

```bash
git diff --check
```

Expected: no whitespace errors.

---

### Task 9: Full Tranche Verification

**Files:**
- No new files unless a verification note is desired.

- [ ] **Step 1: Apple model/API/view-model tests**

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/ViewLogicTests \
  -only-testing:IssueCTLTests/WorkbenchStoreTests \
  -only-testing:IssueCTLTests/APIClientTests/testWorkbenchEndpointURL \
  -only-testing:IssueCTLTests/APIClientExtensionTests \
  -only-testing:IssueCTLTests/ModelDecodingTests/testSessionsOverviewResponseDecodingFromLiveContract \
  -only-testing:IssueCTLTests/RepoAutomationActivityViewTests \
  -quiet
```

- [ ] **Step 2: Full iOS test pass before PR**

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -quiet
```

- [ ] **Step 3: Web/core regression checks for touched contracts**

```bash
pnpm --dir packages/web test -- workbench webhook labels
pnpm --dir packages/web typecheck
pnpm --dir packages/core test
pnpm --dir packages/core typecheck
```

- [ ] **Step 4: Burden-of-proof attempt**

Try to disprove the change:

```bash
xcrun simctl openurl booted "issuectl://workbench?repo=mean-weasel%2Fissuectl&deployment=113"
xcrun simctl openurl booted "issuectl://sessions?repo=mean-weasel%2Fissuectl"
xcrun simctl openurl booted "issuectl://reviews/review-123"
xcrun simctl openurl booted "issuectl://setup?serverURL=http%3A%2F%2F127.0.0.1%3A3000&token=test-token"
```

Evidence to record:

- Screenshot or UI test log showing Board opens the matching issue for a deployment route.
- Screenshot or UI test log showing Active opens with repo-filtered sessions.
- Screenshot or UI test log showing review detail opens for `/reviews/<id>`.
- Screenshot or UI test log showing Advanced Settings can edit the public webhook base URL.
- Command output for Apple focused tests, full Apple tests, and web/core checks.

---

## Recommended GoalBuddy Operating Model

Use a fresh board named `ios-parity-next-tranche`. Do not reopen the completed boards listed in the file map.

Suggested `/goal-prep` shape:

```text
Prepare a fresh GoalBuddy board for the iOS parity next tranche in /Users/neonwatty/Desktop/issuectl from origin/main. The goal is to close only the remaining current-main iOS gaps from docs/superpowers/plans/2026-06-01-ios-web-parity-next-tranche.md: board/session/review route focus, conditional workbench first-read consistency for Today/Issues if small, public webhook base URL editing, webhook health unknown-state clarity, stream refresh coalescing, and stale docs/comment cleanup. First task must be a read-only Scout confirming the current SHA and gap matrix. Second task must be a Judge selecting the largest safe vertical slice with allowed_files, verify commands, and stop_if conditions. Workers must not reimplement already-merged workbench, repo automation, diagnostics, or PR review APIs.
```

Starter execution command after prep:

```text
/goal Follow docs/goals/ios-parity-next-tranche/goal.md.
```

Use independent agents this way:

- Scout agents: read-only source audits from the fresh main worktree; they must report exact file paths and SHA.
- Judge agents: contradiction checks, stale-board detection, and slice selection.
- Worker agents: only after a Judge assigns `allowed_files`, `verify`, and `stop_if`.
- Do not ask workers to inspect previous sessions unless a Scout first maps those sessions to current-main evidence; this avoids repeatedly planning from superseded branches.

Recommended proof oracle:

- Fresh `origin/main` SHA recorded at start and before PR.
- Source-backed gap matrix.
- Focused iOS route/deep-link tests.
- Full iOS simulator test pass.
- Web/core contract checks for workbench/webhook/session routes.
- Manual or automated simulator proof for the three route URLs.
- Post-merge verification that `origin/main` contains the final branch.

## Self-Review

- Spec coverage: the plan covers the web workbench, webhook automation, dashboard interface, current iOS state, remaining gaps, GoalBuddy usage, and independent-agent usage.
- Placeholder scan: no unresolved placeholder patterns remain.
- Type consistency: route types match current `AppRoute` cases in `apple/IssueCTL/Services/SetupLink.swift`; iOS API and view names match current mainline files.
