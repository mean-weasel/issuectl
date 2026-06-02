# T001 Baseline And Gap Map

## Baseline

- Root: `/Users/neonwatty/Desktop/issuectl`
- HEAD: `184ed943a2715c6d5ea8ffbe90075238c0aa67e1`
- Branch: `codex/webhook-tunnel-qa-hardening`
- Upstream: `origin/codex/webhook-tunnel-qa-hardening [gone]`
- Current checkout is dirty: `git diff --stat` reports 43 modified tracked files with 1122 insertions and 684 deletions, plus many untracked goal/docs/webhook files.

Relevant dirty WIP in the root checkout:

- Apple PR-target/session support:
  - `apple/IssueCTLShared/Models/Deployment.swift` adds `DeploymentTargetType`, `ActiveDeployment.targetType`, `targetNumber`, `targetLabel`, `targetTitle`, PR-target decoding, and target-aware `EndSessionRequestBody`.
  - `apple/IssueCTL/Views/Sessions/SessionListView.swift` and `apple/IssueCTL/Views/Terminal/TerminalView.swift` already pass `targetType` and `targetNumber` into `api.endSession`.
  - `apple/IssueCTL/Views/Sessions/SessionRowView.swift` shows `deployment.targetLabel`.
- Web webhook health UI:
  - `packages/web/lib/webhook-health.ts` and `packages/web/lib/webhook-health.test.ts` are untracked in the root.
  - `packages/web/components/issue/LabelManager.tsx`, `packages/web/components/repos/RepoSettingsPanel.tsx`, and their CSS modules are modified to surface webhook health.
- Repo/diagnostics instructions:
  - `AGENTS.md` and `CLAUDE.md` were modified to emphasize diagnostics-first debugging and burden-of-proof verification.

Baseline preservation recommendation:

- Do not create implementation worktrees from `origin/main` or any clean remote branch yet. The local branch exists, but the upstream is gone and the important parity work is not fully committed.
- Earliest safe action for Judge/PM: either checkpoint the current WIP on a new local baseline branch with the `codex/` prefix or explicitly choose to continue implementation in the current dirty root. A separate fresh worktree is unsafe until the current root WIP is committed, stashed, or intentionally ported.

## Existing Worktrees

`git worktree list --porcelain` shows many older iOS parity branches. The most relevant ones are also on gone upstream branches, but they contain useful contract implementations:

- `.worktrees/ios-review-actions-api`
  - Contains `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.ts` and `.test.ts`.
  - Contains `packages/web/app/api/v1/diagnostics/route.ts`, `diagnostics/deployments/[id]/route.ts`, route tests, and `packages/web/lib/diagnostics-api.ts`.
- `.worktrees/ios-diagnostics-api-contract`
  - Contains diagnostics routes, `sessions/overview`, `webhooks/events`, `pr-reviews`, repo webhook health route, PR labels route, and `mobile-api-contracts.ts`.
  - Also contains a much broader older Apple model shape that does not match the current root exactly, so porting should be selective.
- `.worktrees/ios-automation-contracts`, `.worktrees/ios-dashboard-parity`
  - Contain PR label route/test work.

These worktrees should be treated as source-backed references for the foundation Worker, not as clean execution baselines.

## Contract Gap Matrix

| Area | Current root evidence | Status | Next action |
| --- | --- | --- | --- |
| Workbench aggregate | `packages/web/app/api/v1/workbench/route.ts` returns `getWorkbenchPayload()`. `packages/web/lib/workbench-data.ts` includes repos, deployments, previews, settings, health, user, repo issues, priorities, recent completions, webhook events, and PR reviews. | Present | Use as iOS source of truth. |
| Workbench Swift decoding | `apple/IssueCTLShared/Models/WorkbenchPayload.swift` decodes repo automation fields, webhook events, PR reviews, recent completions, target-aware deployments. `WorkbenchPayloadDecodingTests.swift` covers PR webhook/review/completion decoding. | Partially present | Extend projections, not core payload decoding. |
| Workbench Swift projections | `WorkbenchBootstrap.swift` indexes issue summaries, active issue deployments, priorities, and issue-target `ActiveDeployment` values only. | Missing PR/review/webhook/completion projections | Add active PR deployments, automation repo groups, recent completions, webhook events, PR reviews, and usable sorted board projections. |
| PR label REST | Current root has `/api/v1/issues/.../labels`, but route listing shows no `/api/v1/pulls/.../labels`; web PR detail uses `togglePullLabel` Server Action. | Missing | Port or reimplement PR label REST route and tests before iOS auto-review label controls. |
| Diagnostics REST | Current root route listing has no `/api/v1/diagnostics/**`. Core and CLI diagnostics exist in `packages/core/src/db/diagnostics.ts` and `packages/cli/src/commands/diag.ts`. | Missing | Port or reimplement diagnostics REST route and tests before iOS diagnostics UI. |
| Sessions overview | Current root route listing has only `/api/v1/sessions/previews`; old plan referenced `sessions/overview`, and the diagnostics worktree has an implementation. | Missing | Defer or port selectively after deciding whether workbench is enough for ended sessions/review history. |
| Repo automation settings | Current root `POST /api/v1/repos` and `PATCH /api/v1/repos/:owner/:repo` accept `autoLaunchIssues`, `autoReviewPrs`, agents, `reviewPreamble`, `webhookPayloadMode`, and webhook install fields. | Present server-side | Update Swift `Repo`, add/update request bodies, Add/Edit repo UI later. |
| Repo webhook install/rotate | Current root has `/api/v1/repos/:owner/:repo/webhook`. | Present server-side | Add Swift API and UI later. |
| Repo label repair | Current root has `/api/v1/repos/:owner/:repo/labels` GET and POST `action: recreate`. | Present server-side | Existing Swift lists labels; add recreate API/UI later. |
| Repo webhook health | Current root has untracked `packages/web/lib/webhook-health.ts` and web UI usage, but no REST route. Diagnostics worktree has `/api/v1/repos/:owner/:repo/webhook/health`. | Missing as stable API | Add route or fold health into workbench repo payload before iOS health UI. |

## UI Gap Matrix

| Surface | Current iOS evidence | Gap |
| --- | --- | --- |
| Today | `TodayView.swift` already loads endpoint data and merges some `WorkbenchBootstrap.activeDeployments`; `ViewLogicTests` cover fallback/merge behavior. | Not a first-class web workbench command center; PR/webhook/review/diagnostic state not surfaced. |
| Issues | `IssueListView.swift` supports sections, filters, search, active issue sessions, quick create, parse, and some workbench fallback. | No dedicated cross-repo Board mode matching web running-only/payload/priority board behavior. |
| PRs | `PRListView.swift`/`PRDetailView.swift` support list/detail/review/merge/comment. | No stable REST-backed PR label toggle for `issuectl:auto-review`; automation/review session state not first-class. |
| Sessions/Terminal | Dirty root already makes sessions/terminal target-aware for PR labels and end-session bodies. | Needs verification plus PR-detail navigation and diagnostics affordances. |
| Settings/Repos | `Repo.swift`, `AddRepoSheet.swift`, and `EditRepoSheet.swift` only expose owner/name/localPath/branchPattern. | Missing auto-launch, auto-review, agents, review preamble, payload mode, webhook install/rotate/health, label repair. |
| Diagnostics | No Apple diagnostics models, API client, or views found in current root. | Needs API contract first, then UI surface. |

## Recommended First Worker Package

The first Worker should be a foundation package, not broad UI:

1. Add/port stable PR label REST route and tests from `.worktrees/ios-review-actions-api`.
2. Add/port diagnostics REST route and tests from `.worktrees/ios-review-actions-api` or the richer `.worktrees/ios-diagnostics-api-contract`, keeping the current root's style.
3. Extend `WorkbenchBootstrap` with pure projections for:
   - active PR deployments by repo/PR key
   - automation-enabled repos
   - recent completions by repo
   - webhook events by repo and target
   - PR reviews by repo and PR number
4. Update Swift tests to prove those projections and route paths before any broad SwiftUI work.

Candidate `allowed_files`:

- `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.ts`
- `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.test.ts`
- `packages/web/app/api/v1/diagnostics/**`
- `packages/web/lib/diagnostics-api.ts`
- `packages/web/lib/mobile-api-contracts.ts` if shared payload formatting is chosen
- `apple/IssueCTLShared/Models/WorkbenchBootstrap.swift`
- `apple/IssueCTLTests/WorkbenchBootstrapMapperTests.swift`
- `apple/IssueCTLTests/APIClientExtensionTests.swift` if adding client path coverage
- `docs/goals/ios-workbench-automation-parity/notes/**`

Candidate verification:

- `git diff --check`
- `pnpm --dir packages/web test -- app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.test.ts`
- `pnpm --dir packages/web test -- app/api/v1/diagnostics/route.test.ts app/api/v1/diagnostics/deployments/[id]/route.test.ts`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:IssueCTLTests/WorkbenchBootstrapMapperTests`

Candidate stop conditions:

- Need to revert unrelated dirty work.
- Need live GitHub credentials for route-level behavior that can be mocked.
- Diagnostics payload shape conflicts with CLI/core diagnostics in a way that requires product input.
- Need to touch broad SwiftUI surfaces before contracts/projections are verified.

## Strongest T001 Disproof Attempt

I tried to disprove the plan's claim that diagnostics and PR label REST are missing in the current root by listing `packages/web/app/api/v1`. The route listing showed no `diagnostics` route and no `pulls/[owner]/[repo]/[number]/labels` route. I then checked existing worktrees and found those contracts in older branches, proving the work is not imaginary but also not present in the current authoritative root.
