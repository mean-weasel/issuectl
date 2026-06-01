# T001 Scout: Current Flow Map

result: done

summary: Current iOS Today, Issues, PRs, drafts, priorities, offline queue, repo filters, navigation, API client, tests, and web workbench payload/state were mapped from the root worktree. iOS has no WorkbenchStore or Views/Workbench in this root; Today/Issues/PRs are endpoint-specific with shared helper seams. A direct workbench-payload replacement is unsafe without a bounded bridge.

evidence:

## Baseline

- Worktree: `/Users/neonwatty/Desktop/issuectl`
- Branch: `codex/webhook-tunnel-qa-hardening`
- HEAD: `e04ac9c`
- Dirty-state risk: the root worktree was already dirty across Apple, web, CLI, docs, and GoalBuddy artifacts before this tranche. This Scout was read-only except for this receipt and the board state update. Do not normalize unrelated files.
- Contradiction found: the board inputs mention `apple/IssueCTL/Views/Workbench/` and `apple/IssueCTL/ViewModels/WorkbenchStore.swift`, but neither path exists in the current root worktree. The only concrete Workbench store/state found is the web TypeScript workbench under `packages/web/components/workbench/`.

## Web Workbench Contract

Classification: `already_workbench_backed` on web only.

- `/api/v1/workbench` is the aggregate first-read endpoint. It requires auth and returns `getWorkbenchPayload()` from `packages/web/lib/workbench-data.ts` through `packages/web/app/api/v1/workbench/route.ts:9-14`.
- The payload fanout reads tracked repos, active deployments, session previews, settings, current user, per-repo issues, priorities, recent completions, webhook events, and PR reviews. Source: `packages/web/lib/workbench-data.ts:55-78`, `packages/web/lib/workbench-data.ts:118-176`.
- Per-repo issue summaries include `priority`, `hasActiveDeployment`, `issuesFromCache`, and `issuesCachedAt`, but are summaries rather than full `GitHubIssue` detail payloads. Source: `packages/web/components/workbench/workbench-types.ts:38-48`, `packages/web/components/workbench/workbench-types.ts:59-85`.
- Web route modes are `/workbench`, `/workbench/issues`, `/workbench/board`, `/workbench/prs`, `/workbench/quick-create`, and `/workbench/settings`. Source: `packages/web/app/workbench/[mode]/page.tsx:14-20`, `packages/web/components/workbench/WorkbenchShell.tsx:51-58`.
- Global issues and board views already show issues across repos from the aggregate payload. Source: `packages/web/components/workbench/GlobalIssuesFocus.tsx:9-21`, `packages/web/components/workbench/BoardFocus.tsx:19-37`.
- Web workbench state keeps repo, issue, deployment, mode, column widths, and collapse state together, and reconciles stale issue/deployment selections on payload refresh. Source: `packages/web/components/workbench/workbench-state.ts:11-18`, `packages/web/components/workbench/workbench-state.ts:91-122`.
- Web tests prove the aggregate endpoint excludes pending deployments, includes priorities, webhook events, PR reviews, session previews, settings, health, user, and partial repo failure handling. Source: `packages/web/app/api/v1/workbench/route.test.ts:222-294`.

## Webhook And Automation Surface

Classification: `already_workbench_backed` on web, `shared_candidate` for future iOS read-only health surfaces, `unsafe_to_replace_without_design` for launch/session semantics.

- Repo settings now expose auto-launch issues, auto-review PRs, issue/review agent selection, webhook payload mode, webhook install/rotate/ping, label checks/recreate, and activity counts. Source: `packages/web/components/repos/RepoSettingsPanel.tsx:16-30`, `packages/web/components/repos/RepoSettingsPanel.tsx:51-58`, `packages/web/components/repos/RepoSettingsPanel.tsx:254-314`, `packages/web/components/repos/RepoSettingsPanel.tsx:316-365`.
- Webhook health checks public base URL, stored hook id, GitHub hook URL, latest delivery status, stale URL, disabled hook, and permission errors. Source: `packages/web/lib/webhook-health.ts:47-156`.
- PR auto-review worker gates launches by label opt-in, safety checks, active review locks, runaway controls, session termination, diagnostics, and broadcast updates. Source: `packages/web/lib/webhook-pr-intent.ts:63-147`.
- Webhook event streaming supports live dashboard updates with API-token auth and snapshots of recent webhook log entries. Source: `packages/web/lib/webhook-events-stream.ts:8-31`, `packages/web/lib/webhook-events-stream.ts:76-94`.
- iOS currently has no equivalent webhook automation settings or live webhook event stream client in the inspected files. Porting this should be a separate read-only settings/health slice, not part of first-read Today/Issues replacement.

## iOS Flow Map

### Today

Classification: `endpoint_specific` with `shared_candidate` helper seams.

- `TodayView` keeps local state for repos, per-repo issues, per-repo pulls, repo lookups, active deployments, cache state, current user, create/search sheets, action errors, and navigation. Source: `apple/IssueCTL/Views/Today/TodayView.swift:13-30`.
- It fetches deployments and current user concurrently, then fetches repos, per-repo issues, and per-repo pulls through endpoint-specific APIClient calls. Source: `apple/IssueCTL/Views/Today/TodayView.swift:397-449`, `apple/IssueCTL/Views/Today/TodayView.swift:455-512`.
- Attention rows navigate directly to `IssueDetailView` or `PRDetailView` by owner/repo/number. Source: `apple/IssueCTL/Views/Today/TodayView.swift:155-161`, `apple/IssueCTL/Views/Today/TodayView.swift:307-341`.
- Risk: a workbench summary payload does not include full PR lists, issue body parity guarantees, or the same cache/failure state shape that Today currently derives from per-endpoint calls.

### Issues

Classification: `endpoint_specific`.

- `IssueListView` owns repos, `issuesByRepo`, issue repo lookup, drafts, active deployments, section, repo filters, mine filter, search, navigation, launch/terminal targets, action errors, priorities, cache state, and refresh cooldown. Source: `apple/IssueCTL/Views/Issues/IssueListView.swift:9-57`.
- It filters sections locally into drafts, open, running, unassigned, and closed. Running depends on active deployment matching. Source: `apple/IssueCTL/Views/Issues/IssueListView.swift:74-108`, `apple/IssueCTL/Helpers/RepoFilterHelpers.swift:115-141`.
- It loads repos, drafts, deployments, current user, per-repo issues, then priorities in the background. Source: `apple/IssueCTL/Views/Issues/IssueListView.swift:807-900`, `apple/IssueCTL/Views/Issues/IssueListView.swift:906-949`.
- Issue rows navigate with an `initialIssue`, launch sessions, open terminals, close/reopen, and queue offline state changes on queueable network failures. Source: `apple/IssueCTL/Views/Issues/IssueListView.swift:283-290`, `apple/IssueCTL/Views/Issues/IssueListView.swift:514-570`, `apple/IssueCTL/Views/Issues/IssueListView.swift:727-789`.
- Risk: replacing this with workbench summaries could regress drafts, priority loading semantics, offline state queueing, launch preparation, terminal open behavior, and initial detail navigation.

### Drafts

Classification: `unsafe_to_replace_without_design`.

- Drafts are not represented in the web workbench payload.
- Issue list shows drafts as a first-class section, including priority text and delete swipe. Source: `apple/IssueCTL/Views/Issues/IssueListView.swift:581-630`.
- `DraftDetailView` edits title/body/priority, loads repos and labels, assigns with labels, saves, and autosaves on disappear. Source: `apple/IssueCTL/Views/Issues/DraftDetailView.swift:89-99`, `apple/IssueCTL/Views/Issues/DraftDetailView.swift:215-230`, `apple/IssueCTL/Views/Issues/DraftDetailView.swift:284-357`.

### Priorities

Classification: `shared_candidate` for read mapping, `unsafe_to_replace_without_design` for mutation behavior.

- iOS priority sorting reads separate per-repo priority endpoints keyed by `owner/repo#number`. Source: `apple/IssueCTL/Views/Issues/IssueListView.swift:102-116`, `apple/IssueCTL/Views/Issues/IssueListView.swift:915-949`, `apple/IssueCTLShared/Services/APIClient+Priority.swift:57-75`.
- Web workbench already includes priority on each issue summary and a per-repo priorities list. Source: `packages/web/components/workbench/workbench-types.ts:38-45`, `packages/web/components/workbench/workbench-types.ts:78`.
- Candidate seam: use a workbench payload to bootstrap issue priority maps, while keeping existing priority mutation endpoints and detail refresh behavior.

### Pull Requests

Classification: `endpoint_specific`.

- `PRListView` owns repos, per-repo pulls, repo lookup, section, filters, current user, cache state, search, navigation, create sheet, and merge confirmation. Source: `apple/IssueCTL/Views/PullRequests/PRListView.swift:7-38`.
- It fetches repos, current user, and per-repo pulls directly. Source: `apple/IssueCTL/Views/PullRequests/PRListView.swift:502-568`.
- Rows navigate to `PRDetailView` and support merge actions via the pull merge endpoint. Source: `apple/IssueCTL/Views/PullRequests/PRListView.swift:211-213`, `apple/IssueCTL/Views/PullRequests/PRListView.swift:376-400`, `apple/IssueCTL/Views/PullRequests/PRListView.swift:485-497`.
- Risk: web workbench payload has PR reviews and completions, but not a full PR list equivalent for iOS PR browsing.

### Offline State And Cache

Classification: `unsafe_to_replace_without_design`.

- APIClient caches repos, issues, issue detail, pulls, pull detail, active deployments, and drafts independently. Source: `apple/IssueCTLShared/Services/APIClient.swift:166-199`, `apple/IssueCTLShared/Services/APIClient.swift:214-271`, `apple/IssueCTLShared/Services/APIClient.swift:300-337`, `apple/IssueCTLShared/Services/APIClient.swift:405-417`.
- Offline action queue only supports issue comments and issue state updates, replayed by `OfflineSyncService`. Source: `apple/IssueCTL/Services/OfflineSyncService.swift:86-124`, `apple/IssueCTL/Services/OfflineSyncService.swift:190-215`.
- Risk: workbench first-read must not imply offline queue coverage for drafts, priorities, PR merges, or webhook actions.

### Repo Filters

Classification: `shared_candidate`.

- Issues and PRs already share `filterItemsByRepo`, plus Today helper functions in `RepoFilterHelpers.swift`. Source: `apple/IssueCTL/Helpers/RepoFilterHelpers.swift:4-25`, `apple/IssueCTL/Helpers/RepoFilterHelpers.swift:56-82`.
- `RepoFilterChips.swift` provides reusable chip UI for repo selection and context strips. Source: `apple/IssueCTL/Views/Shared/RepoFilterChips.swift:3-84`.
- Candidate seam: preserve this helper layer while introducing a read-only workbench bootstrap mapper behind the current dictionaries.

## Risk Matrix

| Surface | Classification | Strongest failure mode | Minimum proof |
| --- | --- | --- | --- |
| Today first read | `endpoint_specific` | Aggregate payload shows different attention counts or loses PR review attention | Unit tests for mapper plus Today helper tests |
| Issues first read | `endpoint_specific` | Open/running/closed/draft counts drift or initial detail navigation loses `initialIssue` | Unit tests for mapper and existing view logic |
| Drafts | `unsafe_to_replace_without_design` | Drafts disappear or autosave/assign behavior changes | Keep current endpoints untouched; draft tests still pass |
| Priorities | `shared_candidate` | Priority sort differs between first-read and post-refresh data | Test workbench summary -> priority map |
| Offline queue | `unsafe_to_replace_without_design` | Close/reopen stops queueing offline | OfflineSyncService tests plus no edits to queue paths |
| Repo filters | `shared_candidate` | Repo selection/mine filter applies to different data shape incorrectly | Existing filter tests plus mapper lookup tests |
| Issue navigation | `unsafe_to_replace_without_design` | Cross-repo duplicate issue numbers open wrong repo | Test owner/repo/number lookup and keep htmlUrl-based ids |
| PR navigation | `endpoint_specific` | PR list loses merge/detail flow | Do not route PR list through workbench in first slice |
| Webhook automation | `already_workbench_backed` web-only | iOS shows stale/unverified automation as healthy | Defer or add read-only health endpoint/model with tests |

## Candidate Seams

1. Add a Swift model and APIClient method for `/api/v1/workbench`, with decoding tests only. This is bounded and gives iOS a first-read contract without changing UI behavior.
2. Add pure mapping helpers from `WorkbenchPayload` to current iOS repo/issue/deployment/priority dictionaries, with tests. This preserves endpoint-specific screens while creating the architecture bridge.
3. Optionally let `IssueListView` use the mapper only as a bootstrap when workbench payload is present, then keep endpoint-specific refreshes, drafts, priorities, offline queue, and navigation intact.

## Recommended Judge Questions

- Is the next Worker slice only the contract/model/mapper foundation, or should it also wire Issues to consume the aggregate first read?
- Should Today and Issues share one bootstrap model, or should Today remain deferred until PR list parity is available?
- Should webhook automation health be included in the iOS architecture tranche, or tracked as a separate settings parity goal?

## Minimum Verification Gates

- `pnpm --dir packages/web test -- app/api/v1/workbench/route.test.ts components/workbench/workbench.test.ts`
- Focused Apple tests for model decoding and mapper/view logic. Exact command depends on the chosen slice.
- If any SwiftUI screen is wired, also run an iOS simulator build/test for the touched target.
