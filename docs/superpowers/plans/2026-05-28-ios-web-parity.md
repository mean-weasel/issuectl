# iOS Web Workbench and Automation Parity Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the iOS app up to date with the current web app's workbench, cross-repo issue board, PR review sessions, webhook automation, automation-label UX, and repo automation settings.

**Architecture:** Treat the web workbench aggregate contract as the new mobile summary source of truth. Add Swift models and API client support for `/api/v1/workbench`, extend existing repo/deployment models for the newer automation and target-type fields, add an iOS board surface built for small screens, then layer automation settings, webhook health, and automation-label affordances on top. Keep full issue and PR detail screens backed by their detail endpoints.

**Tech Stack:** Swift 6, SwiftUI, Observation, Foundation networking, existing IssueCTL shared models/API client, Next.js App Router, TypeScript, Vitest, Xcode/XcodeGen, iOS 18+.

**Fresh main-based worktree:** `/Users/neonwatty/Desktop/issuectl/.worktrees/ios-web-parity-main`

**Important baseline note:** This plan was written from a clean planning worktree plus a read-only analysis of the dirty active checkout at `/Users/neonwatty/Desktop/issuectl`, then moved to a fresh checkout based on GitHub `main` at `c309bef6f127d1326810f5d428fd3f28b988c48c`. The active checkout contains uncommitted web/core/apple changes for workbench polish, webhook health, and partial Apple PR-session support. Do not assume this main-based worktree already contains those dirty changes. Reconcile first.

---

## Current Web State Analysis

### Cross-Repo Web Dashboard

The legacy web dashboard at `packages/web/app/page.tsx` still exists and uses server-side data loading through `getUnifiedList`. It supports issue/PR tabs, repo filters, "mine" filtering, open/running/unassigned/closed sections, and sort modes. It is useful context, but it is no longer the most complete UX surface.

The newer workbench route at `packages/web/app/workbench/page.tsx` is the source of truth for the richer dashboard direction. It calls `getWorkbenchPayload()` and renders `WorkbenchShell`.

The workbench aggregate API is:

```text
GET /api/v1/workbench
```

The server implementation lives in:

```text
packages/web/app/api/v1/workbench/route.ts
packages/web/lib/workbench-data.ts
```

`WorkbenchPayload` currently includes:

```ts
type WorkbenchPayload = {
  repos: WorkbenchRepo[];
  deployments: ActiveDeploymentWithRepo[];
  previews: Record<string, SessionPreview>;
  settings: Record<string, string>;
  health: HealthSnapshot;
  user: CurrentUser | null;
  generatedAt: string;
};
```

Each `WorkbenchRepo` includes repo identity, local path, branch pattern, automation settings, launch defaults, current issue summaries, active deployments, recent completions, webhook events, PR review records, priorities, and session previews.

The web workbench modes are:

- `Issues`: global cross-repo issue list.
- `Board`: repo-column board of issues across all tracked repos.
- `PRs`: repo-scoped PR review and merge surface.
- `Workbench`: repo-scoped issue/session/terminal work surface.
- `Quick Create`: parse/create issue flow.
- `Settings`: global and repo setup surface.

For iOS, this means the app should stop rebuilding every high-level dashboard by faning out old per-repo endpoints. It should add a workbench payload layer and use the old endpoints only for detail and mutation flows.

### Web Board Interface

The web board is implemented in:

```text
packages/web/app/workbench/BoardFocus.tsx
packages/web/app/workbench/GlobalIssuesFocus.tsx
packages/web/app/workbench/IssueQueuePane.tsx
packages/web/app/workbench/InstancePane.tsx
packages/web/app/workbench/WorkbenchShell.tsx
packages/web/app/workbench/workbench-selectors.ts
packages/web/app/workbench/workbench-state.ts
```

The board is not a Kanban board by workflow state. It is a cross-repo work board with one column per repo. It can show all open issues or only running issues. Sorting can prioritize explicit issue priority before updated time.

Mobile should adapt this as a native iOS board:

- A horizontally scrollable repo-column board for iPad and landscape.
- A grouped vertical board for compact iPhone widths.
- Shared filters for all/open/running and priority/updated sort.
- Cards that show repo, issue number, title, labels, priority, open/running status, and jump-to-session behavior.

### Active Sessions and PR Sessions

The web app now treats deployments as target-aware sessions. A deployment can target an issue or a pull request:

```ts
targetType: "issue" | "pr";
targetNumber: number;
```

PR review automation launches sessions with `targetType: "pr"` through `packages/web/lib/webhook-pr-launch.ts`. Session panes and end-session routes are target-aware. The dirty Apple checkout already contains partial iOS changes that add `DeploymentTargetType` and prevent PR review sessions from being mistaken for issue sessions. Those changes should be re-read, preserved, and completed during implementation.

The iOS `Active` tab currently reads:

```text
GET /api/v1/deployments
GET /api/v1/sessions/previews
```

It should gain the fields needed to match web session rows:

- target type and target number
- issue or PR label
- agent
- trigger source: manual, webhook, comment command
- terminal backend
- terminal reason
- idle state from preview/idle timestamp
- parent deployment/depth when relevant

### Webhook Automation

The webhook receiver path is:

```text
POST /api/webhook/github/<repo_id>
```

The raw-body receiver lives in:

```text
packages/web/lib/github-webhook-handler.ts
packages/web/server.ts
```

The worker and launch logic lives in:

```text
packages/web/lib/webhook-intent-worker.ts
packages/web/lib/webhook-pr-intent.ts
packages/web/lib/webhook-pr-launch.ts
```

Important behavior:

- Issues auto-launch through the `issuectl:auto-launch` label when repo `autoLaunchIssues` is enabled.
- PRs auto-review through the `issuectl:auto-review` label when repo `autoReviewPrs` is enabled.
- Label removal is meaningful and can stop or opt out automation.
- The receiver records events and intents, debounces repeated events, and guards against duplicate or runaway launches.
- PR auto-review has stricter safety gates: open PR, not draft, same repo, non-default head branch, unprotected branch, expected head SHA.
- Successful launches consume the automation label after starting the session.
- Comment commands can also create launch intents and should surface as `triggeredBy: "comment_command"`.

The iOS app currently lacks the automation settings and label-health affordances needed to make this understandable.

### Webhook Health and Label UX

Repo settings in the web app exposes webhook setup and health through:

```text
packages/web/app/repos/[owner]/[repo]/RepoSettingsPanel.tsx
packages/web/lib/webhook-health.ts
```

The dirty checkout includes `packages/web/lib/webhook-health.ts` and tests. Health state includes:

```ts
state: "ok" | "warning" | "error" | "unknown";
summary: string;
detail?: string;
recovery?: string;
expectedUrl?: string;
hookId?: number;
githubUrl?: string;
latestDelivery?: ...;
```

The web issue and PR label managers also started passing webhook health into label selection so automation labels can explain problems before the user expects a launch or review to happen.

iOS should mirror this at two levels:

- Repo automation settings: webhook status, install/reinstall/rotate/ping, label health/recreate.
- Issue/PR label sheets: when `issuectl:auto-launch` or `issuectl:auto-review` is present/available and health is not ok, show a concise native warning and recovery action.

### Current iOS State

Relevant files:

```text
apple/IssueCTL/ContentView.swift
apple/IssueCTL/Views/TodayView.swift
apple/IssueCTL/Views/Issues/IssueListView.swift
apple/IssueCTL/Views/Issues/IssueDetailView.swift
apple/IssueCTL/Views/Pulls/PRListView.swift
apple/IssueCTL/Views/Pulls/PRDetailView.swift
apple/IssueCTL/Views/Sessions/SessionListView.swift
apple/IssueCTL/Views/Sessions/SessionRowView.swift
apple/IssueCTL/Views/Settings/SettingsView.swift
apple/IssueCTL/Views/Settings/EditRepoSheet.swift
apple/IssueCTLShared/API/APIClient.swift
apple/IssueCTLShared/API/APIClient+Settings.swift
apple/IssueCTLShared/API/APIClient+DetailActions.swift
apple/IssueCTLShared/Models/Repo.swift
apple/IssueCTLShared/Models/Deployment.swift
```

The app already has Today, Issues, PRs, and Active tabs. The Issues screen is already cross-repo, but it reconstructs state by fetching repos, issues, priorities, drafts, deployments, and current user separately. Today does the same kind of per-repo fanout. Active reads deployments and previews separately. Settings can add/edit repos but does not expose automation/webhook controls.

The main iOS gaps are:

- No native equivalent of web `Board`.
- No `/api/v1/workbench` model/API layer.
- `Repo` model is missing automation fields.
- `Deployment` and `ActiveDeployment` are missing several target-aware/session metadata fields.
- Partial PR-session handling exists in the dirty checkout but is incomplete.
- No repo automation settings UI.
- No webhook health UI.
- No automation-label health warning in issue or PR label flows.
- No PR label management flow for `issuectl:auto-review`.
- No native view of recent webhook events or PR review records.

---

## Product Decisions

- Add a new iOS `Board` tab instead of replacing `Today`. Today remains the personal queue and quick summary. Board becomes the cross-repo operational surface that mirrors the web work board.
- Use `/api/v1/workbench` as the main summary read path for Board, Today counts, global issue summaries, active session summaries, webhook activity, and PR review summaries.
- Keep detail screens backed by their existing detail endpoints. Workbench summaries are not a replacement for issue body, comments, PR files, or mutation routes.
- Do not add a direct "manual PR review launch" button unless the backend already supports it. PR auto-review remains label-driven for this parity pass.
- Fetch expensive webhook health on demand for the selected repo instead of adding GitHub hook health checks to every board refresh.
- Prefer native iOS layouts over copying the desktop web shell. The iOS goal is parity of capability and status visibility, not pixel parity.

---

## Target iOS Experience

After implementation:

- The tab bar contains Today, Board, Issues, PRs, and Active.
- Board shows all tracked repos and all open/running issues in one place.
- Issue and PR cards show when automation has created an active session.
- Active sessions clearly distinguish issue work sessions from PR review sessions.
- Session controls can end either issue or PR sessions safely.
- Repo settings expose auto-launch and auto-review settings, agent choices, review preamble, payload mode, webhook install/rotate/ping, and health.
- Issue labels surface `issuectl:auto-launch` as an automation action with webhook health context.
- PR labels surface `issuectl:auto-review` as an automation action with webhook health context.
- Recent webhook events and PR review state are visible enough to answer "why did or did not automation run?" without opening web.

---

## Implementation Tasks

### Task 0: Reconcile the Fresh Worktree With Current Work

**Files:**
- Inspect only first: active checkout at `/Users/neonwatty/Desktop/issuectl`
- Implement in: `/Users/neonwatty/Desktop/issuectl/.worktrees/ios-web-parity-main`

- [ ] **Step 1: Confirm clean fresh branch**

Run:

```bash
git status --short
git branch --show-current
```

Expected branch: `codex/ios-web-parity-main`.

- [ ] **Step 2: Re-read active dirty changes before coding**

From the active checkout, inspect:

```bash
git diff -- packages/web packages/core apple docs/workflows
git status --short
```

Identify which changes are committed, which are uncommitted, and which should be ported into the fresh worktree.

- [ ] **Step 3: Preserve in-flight Apple target-aware work**

The active checkout already has partial edits in:

```text
apple/IssueCTLShared/Models/Deployment.swift
apple/IssueCTLShared/API/APIClient.swift
apple/IssueCTL/Views/Sessions/SessionListView.swift
apple/IssueCTL/Views/Sessions/SessionRowView.swift
apple/IssueCTL/Views/Issues/IssueDetailView.swift
```

Port or reimplement the useful parts, but do not overwrite newer local user work.

- [ ] **Step 4: Decide whether missing web support must be implemented here**

If the fresh worktree does not contain required backend endpoints for webhook health, PR labels, or label recreation, add them in this branch with focused web tests. Do not block iOS on web-only server actions that have no REST endpoint.

### Task 1: Add Shared Workbench and Automation Models

**Files:**
- Modify: `apple/IssueCTLShared/Models/Repo.swift`
- Modify: `apple/IssueCTLShared/Models/Deployment.swift`
- Add: `apple/IssueCTLShared/Models/Workbench.swift`
- Add or modify tests: `apple/IssueCTLSharedTests/ModelDecodingTests.swift`

- [ ] **Step 1: Extend `Repo` for automation fields**

Add optional/defaulted fields so old fixtures still decode:

```swift
public enum WebhookPayloadMode: String, Codable, Sendable, CaseIterable {
    case metadata
    case raw
}

public struct Repo: Codable, Identifiable, Hashable, Sendable {
    public let id: Int64
    public let owner: String
    public let name: String
    public let localPath: String?
    public let branchPattern: String?
    public let autoLaunchIssues: Bool
    public let autoReviewPrs: Bool
    public let issueAgent: AgentKind?
    public let reviewAgent: AgentKind?
    public let webhookId: Int64?
    public let webhookPayloadMode: WebhookPayloadMode
    public let reviewPreamble: String?
    public let createdAt: Date
}
```

If `AgentKind` is not currently a shared model, add a small shared enum matching the web values used by repo settings and launch agents.

- [ ] **Step 2: Complete deployment target metadata**

Make `Deployment` and `ActiveDeployment` tolerate both old and new server payloads:

```swift
public enum DeploymentTargetType: String, Codable, Sendable, CaseIterable {
    case issue
    case pr
}

public enum DeploymentTrigger: String, Codable, Sendable, CaseIterable {
    case manual
    case webhook
    case commentCommand = "comment_command"
}

public enum TerminalBackend: String, Codable, Sendable, CaseIterable {
    case ttyd
    case unknown
}
```

`ActiveDeployment` should include:

```swift
public let targetType: DeploymentTargetType
public let targetNumber: Int
public let issueNumber: Int?
public let agent: AgentKind?
public let terminalBackend: TerminalBackend?
public let triggeredBy: DeploymentTrigger?
public let terminalReason: String?
public let parentDeploymentId: Int64?
public let webhookDepth: Int?
public let idleSince: Date?
```

Decoding rule:

- If `target_type` is missing, default to `.issue`.
- If `target_number` is missing, fall back to `issue_number`.
- If `issue_number` is missing for PR sessions, keep it nil.
- Do not model an ended deployment by expecting `state == "ended"` from core. Use `endedAt != nil` when the endpoint includes ended records.

- [ ] **Step 3: Add `Workbench.swift`**

Mirror only the fields iOS will use:

```swift
public struct WorkbenchPayload: Codable, Sendable {
    public let repos: [WorkbenchRepo]
    public let deployments: [ActiveDeployment]
    public let previews: [String: SessionPreview]
    public let settings: [String: String]
    public let health: HealthSnapshot?
    public let user: CurrentUser?
    public let generatedAt: Date
}

public struct WorkbenchRepo: Codable, Identifiable, Hashable, Sendable {
    public let id: Int64
    public let owner: String
    public let name: String
    public let localPath: String?
    public let branchPattern: String?
    public let autoLaunchIssues: Bool
    public let autoReviewPrs: Bool
    public let issueAgent: AgentKind?
    public let reviewAgent: AgentKind?
    public let webhookId: Int64?
    public let webhookPayloadMode: WebhookPayloadMode
    public let badgeCount: Int
    public let deployedCount: Int
    public let issueError: String?
    public let issuesFromCache: Bool
    public let issuesCachedAt: Date?
    public let priorities: [IssuePriority]
    public let deployments: [ActiveDeployment]
    public let recentCompletions: [DeploymentCompletionSummary]
    public let webhookEvents: [WebhookEventSummary]
    public let prReviews: [PrReviewSummary]
    public let previews: [String: SessionPreview]
    public let issues: [WorkbenchIssueSummary]
}
```

Keep this model permissive. Most fields should decode from snake_case and tolerate nulls.

- [ ] **Step 4: Add summary models**

Add:

```swift
public struct WorkbenchIssueSummary: Codable, Identifiable, Hashable, Sendable {
    public var id: String { "\(repoFullName)#\(number)" }
    public let repoId: Int64
    public let repoFullName: String
    public let owner: String
    public let repo: String
    public let number: Int
    public let title: String
    public let state: IssueState
    public let labels: [String]
    public let updatedAt: Date
    public let priority: IssuePriority?
    public let hasActiveDeployment: Bool
    public let htmlUrl: URL?
    public let authorLogin: String?
}

public struct WebhookEventSummary: Codable, Identifiable, Hashable, Sendable { ... }
public struct PrReviewSummary: Codable, Identifiable, Hashable, Sendable { ... }
public struct DeploymentCompletionSummary: Codable, Identifiable, Hashable, Sendable { ... }
```

Use exact server names after inspecting `packages/web/lib/workbench-data.ts`.

- [ ] **Step 5: Test decoding fixtures first**

Add JSON fixtures directly in tests or as fixture files covering:

- repo with all automation fields
- repo with old minimal fields
- issue deployment
- PR deployment
- workbench payload with two repos, one issue session, one PR review session
- webhook event summary
- PR review summary

Run:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLShared -destination 'platform=iOS Simulator,name=iPhone 16'
```

If using `xcodebuildmcp`, run the equivalent shared test target through the MCP tool.

### Task 2: Add Workbench API Client Support

**Files:**
- Modify: `apple/IssueCTLShared/API/APIClient.swift`
- Modify: `apple/IssueCTLShared/API/APIClient+Settings.swift`
- Modify tests: `apple/IssueCTLSharedTests/APIClientTests.swift`
- Modify tests: `apple/IssueCTLUITests/MockIssueCTLServer.swift`

- [ ] **Step 1: Add workbench fetch**

Add:

```swift
public func workbench(refresh: Bool = false, maxAge: TimeInterval? = nil) async throws -> WorkbenchPayload
```

Endpoint:

```text
GET /api/v1/workbench
```

Cache key:

```text
workbench
```

Cache behavior:

- Use existing APIClient cache conventions.
- Return cached payload when offline if available.
- Allow forced refresh from pull-to-refresh.

- [ ] **Step 2: Extend repo create/update payloads**

Add fields to `AddRepoRequest` and `UpdateRepoRequest`:

```swift
autoLaunchIssues: Bool?
autoReviewPrs: Bool?
issueAgent: AgentKind?
reviewAgent: AgentKind?
reviewPreamble: String?
webhookPayloadMode: WebhookPayloadMode?
installWebhook: Bool?
```

Preserve existing simple local path and branch pattern edit behavior.

- [ ] **Step 3: Add webhook configuration methods**

Match existing web API behavior:

```swift
public enum WebhookAction: String, Codable, Sendable {
    case create
    case rotate
    case ping
}

public func configureWebhook(owner: String, repo: String, action: WebhookAction) async throws -> WebhookConfigurationResult
public func webhookHealth(owner: String, repo: String) async throws -> WebhookAutomationHealth
```

If `GET /api/v1/repos/[owner]/[repo]/webhook/health` does not exist, implement it in Task 5 before wiring iOS.

- [ ] **Step 4: Add label automation support**

Keep issue label support and add PR label support:

```swift
public func togglePullLabel(owner: String, repo: String, number: Int, label: String, present: Bool) async throws -> PullRequestDetail
```

If the web app has no REST route for PR label toggles, add one in Task 5.

- [ ] **Step 5: Extend the mock server**

`MockIssueCTLServer` should serve:

```text
GET /api/v1/workbench
PATCH /api/v1/repos/:owner/:repo
POST /api/v1/repos/:owner/:repo/webhook
GET /api/v1/repos/:owner/:repo/webhook/health
POST /api/v1/pulls/:owner/:repo/:number/labels
```

Use mock data with:

- two repos
- one issue auto-launch-enabled repo
- one PR auto-review-enabled repo
- one running issue session
- one running PR review session
- one warning webhook health state

- [ ] **Step 6: Run focused API tests**

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLShared -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:IssueCTLSharedTests/APIClientTests
```

### Task 3: Add a Workbench Store for iOS

**Files:**
- Add: `apple/IssueCTL/ViewModels/WorkbenchStore.swift`
- Add: `apple/IssueCTL/Views/Workbench/WorkbenchFilters.swift`
- Add tests if the project has view-model tests, otherwise add pure helper tests under shared tests.

- [ ] **Step 1: Create `@Observable` store**

The store owns:

```swift
@Observable
final class WorkbenchStore {
    var payload: WorkbenchPayload?
    var isLoading = false
    var error: ErrorBanner?
    var selectedRepoId: Int64?
    var boardFilter: BoardFilter = .open
    var boardSort: BoardSort = .priority

    func load(refresh: Bool = false) async
    func repo(id: Int64) -> WorkbenchRepo?
    func issues(for repo: WorkbenchRepo) -> [WorkbenchIssueSummary]
    func activeDeployment(for issue: WorkbenchIssueSummary) -> ActiveDeployment?
}
```

Inject `APIClient` through initializer or environment, following existing app conventions.

- [ ] **Step 2: Add pure sort/filter helpers**

Helpers should cover:

- all open issues
- running only
- priority first
- updated first
- closed excluded by default
- repo issue error states

- [ ] **Step 3: Test helper behavior**

Use two repos and mixed issue state fixture. Acceptance:

- priority sort puts high priority before normal
- running filter preserves empty repos for board visibility
- issues with active deployments resolve to the matching issue deployment only, not PR deployment

### Task 4: Add Native Board Tab

**Files:**
- Modify: `apple/IssueCTL/ContentView.swift`
- Add: `apple/IssueCTL/Views/Workbench/WorkBoardView.swift`
- Add: `apple/IssueCTL/Views/Workbench/BoardRepoColumnView.swift`
- Add: `apple/IssueCTL/Views/Workbench/BoardIssueCardView.swift`
- Add: `apple/IssueCTL/Views/Workbench/BoardFilterBar.swift`
- Update project generation if needed: `apple/project.yml`

- [ ] **Step 1: Add Board tab**

Add a tab with label `Board` and SF Symbol `rectangle.grid.2x2`.

Keep Today, Board, Issues, PRs, Active. If five tabs are too cramped during UI test, place Settings in the existing sheet and keep these five as the primary app surfaces.

- [ ] **Step 2: Build compact and regular layouts**

Use size class:

- Compact width: vertical grouped sections by repo.
- Regular width: horizontal scroll of repo columns.

Do not put cards inside cards. Repo columns can be grouped sections with concise headers.

- [ ] **Step 3: Add board controls**

Controls:

- segmented filter: Open, Running, All
- sort menu: Priority, Updated
- refresh button

Cards:

- repo shorthand
- issue number
- title
- priority chip when set
- running/session indicator
- labels, capped to avoid wrapping chaos
- button or tap action to open detail
- if running, primary action opens session/terminal instead of launching

- [ ] **Step 4: Wire navigation**

From a board issue:

- Open issue detail using existing `IssueDetailView` flow.
- If active deployment exists, allow jump to the active session.
- If no active deployment exists, allow launch through existing issue launch behavior.

- [ ] **Step 5: Add empty/error states**

States:

- no repos
- repo has no matching issues
- repo issue fetch error from workbench payload
- stale cached issue data
- workbench fetch failed but cached payload exists

- [ ] **Step 6: UI test**

Add UI test that boots against the mock server and verifies:

- Board tab exists.
- Two repo sections render.
- Running filter keeps repo sections visible.
- Running issue card shows jump-to-session affordance.
- PR review session does not appear as an issue board card.

### Task 5: Fill Missing REST Backend Gaps for Mobile Automation

**Files, depending on gap inspection:**
- Add/modify: `packages/web/app/api/v1/repos/[owner]/[repo]/webhook/health/route.ts`
- Modify: `packages/web/app/api/v1/repos/[owner]/[repo]/webhook/route.ts`
- Add/modify: `packages/web/app/api/v1/repos/[owner]/[repo]/labels/route.ts`
- Add/modify: `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.ts`
- Tests: matching `*.test.ts` files under `packages/web`

- [ ] **Step 1: Confirm existing routes**

Search:

```bash
rg "webhook/health|togglePullLabel|recreateRepoLabels|pull.*labels" packages/web/app packages/web/lib
```

- [ ] **Step 2: Add webhook health route if missing**

Route:

```text
GET /api/v1/repos/:owner/:repo/webhook/health
```

Implementation:

- require API auth
- resolve repo from DB
- call `getWebhookAutomationHealth(db, repo)`
- return serializable health object

Test:

- repo without webhook returns warning or unknown according to helper behavior
- configured repo with mocked GitHub hook returns ok
- GitHub API failure returns non-500 health state when helper supports it

- [ ] **Step 3: Add PR label REST route if missing**

Route:

```text
POST /api/v1/pulls/:owner/:repo/:number/labels
```

Body:

```ts
{ label: string; present: boolean }
```

Use the same core/action helper as web `LabelManager`.

Test:

- add `issuectl:auto-review`
- remove `issuectl:auto-review`
- rejects unknown repo
- returns refreshed PR detail or clear mutation result

- [ ] **Step 4: Add label health/recreate REST route if needed**

Mobile needs either:

```text
POST /api/v1/repos/:owner/:repo/labels/recreate
```

or an action body on an existing repo labels route:

```ts
{ action: "recreate" }
```

Follow existing web conventions instead of inventing a second shape if a route already exists.

- [ ] **Step 5: Run web checks**

```bash
pnpm --dir packages/web test -- webhook
pnpm --dir packages/web test -- labels
pnpm --dir packages/web typecheck
```

### Task 6: Add Repo Automation Settings on iOS

**Files:**
- Modify: `apple/IssueCTL/Views/Settings/SettingsView.swift`
- Modify: `apple/IssueCTL/Views/Settings/EditRepoSheet.swift`
- Add: `apple/IssueCTL/Views/Settings/RepoAutomationSettingsView.swift`
- Add: `apple/IssueCTL/Views/Settings/WebhookHealthView.swift`
- Add: `apple/IssueCTL/Views/Settings/AgentPicker.swift`

- [ ] **Step 1: Extend repo settings UI**

For each repo, expose:

- local path
- branch pattern
- auto-launch issues toggle
- issue agent picker
- auto-review PRs toggle
- review agent picker
- review preamble editor
- webhook payload mode picker

Save through `PATCH /api/v1/repos/:owner/:repo`.

- [ ] **Step 2: Add webhook controls**

Show:

- installed/missing webhook state
- expected URL when available
- latest delivery summary when available
- health state and recovery message

Actions:

- install webhook
- rotate/reinstall webhook
- ping webhook if supported by backend
- recreate automation labels if supported by backend

- [ ] **Step 3: Add safety copy for disabling automation**

When disabling issue or PR automation, match the web behavior conceptually: existing webhook sessions may be ended or skipped. The UI should warn before turning off a toggle if active webhook sessions exist for that repo.

- [ ] **Step 4: UI test**

Mock:

- repo starts with automation disabled and webhook warning
- user enables auto-launch and selects Codex
- user enables auto-review and selects review agent
- user taps install webhook

Assert the mock server receives expected PATCH and POST bodies.

### Task 7: Add Automation Label UX for Issues and PRs

**Files:**
- Modify: `apple/IssueCTL/Views/Issues/LabelManagementSheet.swift`
- Modify: `apple/IssueCTL/Views/Issues/IssueDetailView.swift`
- Modify: `apple/IssueCTL/Views/Pulls/PRDetailView.swift`
- Add if needed: `apple/IssueCTL/Views/Shared/AutomationLabelNotice.swift`
- Add if needed: `apple/IssueCTL/Views/Pulls/PRLabelManagementSheet.swift`

- [ ] **Step 1: Highlight issue auto-launch label**

In issue label management, detect:

```text
issuectl:auto-launch
```

Show a compact notice when:

- repo automation is disabled
- webhook is missing/unhealthy
- label is present and launch is pending/running
- label was just added and the app is waiting for webhook processing

- [ ] **Step 2: Add issue detail automation CTA**

When issue is open and no active deployment exists:

- If automation is enabled and health is ok, offer "Auto-launch" by adding `issuectl:auto-launch`.
- Keep manual launch available.
- After adding the label, refresh workbench payload and issue detail.

- [ ] **Step 3: Add PR auto-review label flow**

In PR detail, support:

```text
issuectl:auto-review
```

Behavior:

- Show automation status for the repo.
- Add/remove label through PR label REST API.
- Show PR review state if `PrReviewSummary` exists in workbench payload.
- Refresh PR detail and workbench payload after mutation.

- [ ] **Step 4: UI tests**

Tests:

- issue label sheet shows warning when webhook health is warning
- adding `issuectl:auto-launch` calls issue label route
- PR detail can add `issuectl:auto-review`
- removing automation label updates UI state

### Task 8: Complete Active Session Parity

**Files:**
- Modify: `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- Modify: `apple/IssueCTL/Views/Sessions/SessionRowView.swift`
- Modify: `apple/IssueCTL/Views/Sessions/SessionControlsSheet.swift` if separate
- Modify: `apple/IssueCTLShared/API/APIClient.swift`

- [ ] **Step 1: Render target-aware session rows**

Rows should display:

- Issue #123 or PR #456
- repo full name
- branch
- agent
- trigger source
- terminal backend/reason when present
- preview status
- duration

- [ ] **Step 2: Fix session actions by target type**

For issue sessions:

- open terminal
- view issue
- end session with `{ targetType: "issue", targetNumber }`

For PR sessions:

- open terminal
- view PR
- end session with `{ targetType: "pr", targetNumber }`

Do not route PR sessions to `IssueDetailView`.

- [ ] **Step 3: Use workbench payload when available**

Prefer session summaries from `WorkbenchPayload.deployments` and previews from `WorkbenchPayload.previews`. Keep the old deployments/previews endpoints as fallback if Board has not loaded yet or if user refreshes Active independently.

- [ ] **Step 4: Tests**

Model/UI tests should verify:

- PR session row says PR, not Issue.
- Issue session can open issue detail.
- PR session can open PR detail.
- End body includes correct target type and number.

### Task 9: Bring Today and Issues Onto the New Summary Layer

**Files:**
- Modify: `apple/IssueCTL/Views/TodayView.swift`
- Modify: `apple/IssueCTL/Views/Issues/IssueListView.swift`
- Modify or add shared helpers under `apple/IssueCTL/ViewModels`

- [ ] **Step 1: Today uses workbench for summary counts**

Use `WorkbenchPayload` for:

- active sessions count
- PRs needing review where available
- assigned issue summary where current user exists
- repo context strip

Keep detail fetches lazy.

- [ ] **Step 2: Issue list uses workbench summaries first**

Replace per-repo fanout for initial list with `WorkbenchPayload.repos[].issues`. Preserve existing detail navigation and mutation refresh.

Fallback:

- If workbench fetch fails and no cache exists, use the old per-repo path for resilience.

- [ ] **Step 3: Preserve existing filters**

Existing iOS filters should keep working:

- repo filter
- mine
- search
- open/running/unassigned/closed sections
- priority sort
- drafts

- [ ] **Step 4: Tests**

Add tests for:

- active issue matching ignores PR sessions
- mine filter works from `authorLogin` and current user
- cached workbench can populate list offline
- old fanout fallback still works

### Task 10: Surface Webhook Activity and PR Review Records

**Files:**
- Add: `apple/IssueCTL/Views/Automation/AutomationActivityView.swift`
- Add: `apple/IssueCTL/Views/Automation/WebhookEventRowView.swift`
- Add: `apple/IssueCTL/Views/Automation/PrReviewRowView.swift`
- Integrate into Board repo detail or Settings repo detail.

- [ ] **Step 1: Add repo automation activity section**

For a selected repo, show:

- recent webhook events
- recent intents/results if available in `webhookEvents`
- PR review records and statuses

- [ ] **Step 2: Keep language operational**

Useful status examples:

- "Auto-launch label received"
- "Skipped because automation is disabled"
- "Review session already running"
- "PR branch is protected"
- "Waiting for debounce"

Use server-provided result/status fields where possible.

- [ ] **Step 3: Link to relevant issue/PR/session**

Rows should navigate to:

- issue detail for issue events
- PR detail for PR events/reviews
- active session when deployment id is active

### Task 11: Documentation and Release Notes

**Files:**
- Add: `docs/specs/2026-05-28-ios-web-workbench-parity.md` or update the existing iOS docs if there is a better home.
- Update: relevant README or Apple docs if one exists.

- [ ] **Step 1: Document mobile/web parity contract**

Include:

- why iOS uses `/api/v1/workbench`
- what remains detail-endpoint backed
- automation-label behavior
- webhook health route
- PR review session behavior

- [ ] **Step 2: Add QA recipe**

Manual QA should cover:

- Board with multiple repos
- issue auto-launch label from iOS
- PR auto-review label from iOS
- webhook health warning
- active PR review session
- ending issue and PR sessions

### Task 12: Verification

- [ ] **Step 1: Generate Xcode project if Swift files were added**

From repo root:

```bash
cd apple
xcodegen generate
```

If generated project files change only due to new Swift files, keep them. If build scripts update `apple/IssueCTL/Generated/AppVersion.swift`, restore that generated version file unless the user asked for a version bump.

- [ ] **Step 2: Run focused web checks for any backend changes**

```bash
pnpm --dir packages/web test -- workbench
pnpm --dir packages/web test -- webhook
pnpm --dir packages/web test -- labels
pnpm --dir packages/web typecheck
pnpm --dir packages/web lint
```

- [ ] **Step 3: Run focused core checks if shared types/DB helpers changed**

```bash
pnpm --dir packages/core test
pnpm --dir packages/core typecheck
pnpm --dir packages/core lint
```

- [ ] **Step 4: Run iOS shared tests**

Prefer `xcodebuildmcp` if available. Shell fallback:

```bash
xcodebuild test \
  -project apple/IssueCTL.xcodeproj \
  -scheme IssueCTLShared \
  -destination 'platform=iOS Simulator,name=iPhone 16'
```

- [ ] **Step 5: Run iOS app/UI tests**

Prefer `xcodebuildmcp` for simulator selection, launch, screenshots, and UI inspection. Shell fallback:

```bash
xcodebuild test \
  -project apple/IssueCTL.xcodeproj \
  -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 16'
```

- [ ] **Step 6: Manual simulator QA**

Launch the app against the local web server and verify:

- Board tab loads all repos.
- Running filter works.
- Issue auto-launch label can be added.
- PR auto-review label can be added.
- Webhook health warning is visible for unhealthy repo.
- Active tab shows PR review session as PR.
- Ending PR session sends correct target fields.

---

## Suggested Implementation Batches

### Batch A: Contracts and API

Tasks 0-3. This creates the foundation and should be reviewed before UI work. It can land without major visual changes if tests prove decoding and API paths.

### Batch B: Board and Session Parity

Tasks 4, 8, and 9. This gives the user-visible iOS parity for the new web work board and target-aware sessions.

### Batch C: Automation Settings and Labels

Tasks 5-7 and 10. This brings webhook automation, health, repo settings, and auto-launch/auto-review label UX to mobile.

### Batch D: Docs and Full QA

Tasks 11-12. This records the new contract and proves the workflow end to end.

---

## Acceptance Criteria

- iOS decodes the current web workbench payload, including repo automation fields and PR deployments.
- iOS has a Board tab that displays cross-repo issue state from `/api/v1/workbench`.
- Active sessions distinguish issue sessions from PR review sessions.
- Ending a session sends the correct `targetType` and `targetNumber`.
- Repo settings expose issue auto-launch, PR auto-review, agent choices, review preamble, payload mode, and webhook controls.
- Issue detail/labels support `issuectl:auto-launch` with webhook health context.
- PR detail/labels support `issuectl:auto-review` with webhook health context.
- Workbench summaries are cached/offline-tolerant using existing APIClient conventions.
- Existing Today, Issues, PRs, and Active flows continue to work.
- Focused web, core, shared Swift, and iOS app tests pass for changed packages.

---

## Known Risks

- The fresh worktree may not contain the latest dirty web changes. Task 0 must be done carefully before coding.
- `/api/v1/workbench` may not include every field iOS wants; prefer adding small optional fields over creating a second aggregate contract.
- Webhook health can be slow because it may call GitHub. Fetch it on demand for selected repos.
- PR label mutation may currently exist only as a server action. iOS needs a REST endpoint.
- XcodeGen/project file churn can be noisy. Regenerate only when adding/removing files and verify generated version files are not accidentally committed.
- Some iOS screens currently own their own fetching. Migrating to a shared workbench store should be incremental to avoid regressions.

---

## Out of Scope for This Plan

- A full terminal emulator redesign on iOS.
- Named plain shell sessions independent of issues or PRs.
- Direct manual PR-review launch if the backend remains label-only.
- Replacing the web workbench.
- Changing GitHub webhook security or HMAC behavior beyond adding mobile-facing status endpoints.
