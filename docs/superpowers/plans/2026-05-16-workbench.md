# Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new desktop-first `/workbench` web dashboard as the main repo-scoped issue/session manager, using the interactive mockup at `docs/mockups/workbench.html` as the visual and behavioral reference.

**Architecture:** Add `/workbench` as a new Next.js App Router surface that composes existing issue, PR, repo, settings, launch, terminal, deployment, preview, worktree, parse, and health APIs. Start with a read-only vertical slice backed by an aggregate workbench data loader, then add mutations and terminal/session controls. Named plain shells are the only material backend gap and are isolated into a later slice with their own schema/API acceptance criteria.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS Modules, existing `@issuectl/core` APIs, Vitest, Playwright.

**Primary Mockup:** `docs/mockups/workbench.html`

**Known API Baseline:** Current APIs support repos, repo setup, settings, issues, priorities, issue detail/actions, launch, active deployments, terminal previews, ttyd reconnect/end, worktrees, parse/create, drafts, PRs, health, and user. Current APIs do not support named plain shells independent of GitHub issues.

---

## GoalBuddy Intake Notes

**Original request:** Implement the new `/workbench` desktop UX, extensively referencing the mockup, with rigorous acceptance criteria suitable for GoalBuddy prep.

**Interpreted outcome:** `/workbench` becomes a production web dashboard where a user can select an admitted repo, see active terminal instances on the left, repo issues on the right, open terminal or issue detail in the center, use global board/issues/settings surfaces with sidebars collapsed, and manage launch/worktree/settings actions through existing APIs.

**Completion proof:** A Playwright workflow can exercise all mockup-backed routes and interactions against the real app, with API-backed data fixtures, and `pnpm --filter @issuectl/web typecheck`, `pnpm --filter @issuectl/web lint`, `pnpm --filter @issuectl/web test`, and the targeted Playwright suite passing.

**Likely misfire:** Building another issue list page with cosmetic changes while missing the repo-scoped instance manager behavior.

**Hard constraints:**
- Preserve existing dashboard routes and behavior.
- Do not replace current issue detail, launch, terminal, settings, parse, or PR APIs unless the task explicitly calls for an adapter.
- Do not make the mock-only state controls part of production.
- Board, Settings, and global Issues modes must collapse both side panes.
- Running sessions must sort before idle sessions by default.
- Named plain shells must not be faked as issue deployments without an explicit schema/API decision.

**Recommended GoalBuddy first active task:** Scout the existing web data and route boundaries, then implement Task 1 as the first Worker slice.

---

## Mockup Reference Map

Use these mockup functions and visible states as the source of truth:

- `renderRepoRail`: left rail of admitted repos.
- `renderInstances`: left repo session pane with `Issue sessions`, `Named shells`, status sorting, preview states, reconnect/end actions.
- `renderIssues`: right repo issue queue with `open/running/closed` chips, launch/details actions.
- `renderFocus`: central focus area that changes by selected terminal, issue, repo, repo setup, quick create, settings, board, PRs, or shell flow.
- `renderRepoFocus`: center empty/overview state after clicking a repo.
- `renderRepoSetup`: repo setup card with local path, branch pattern, repo health, accessible GitHub repo picker.
- `renderQuickCreate`: quick create/parse state.
- `renderSettings`: global settings state.
- `renderGlobalIssues`: global issues state; both side panes hidden.
- `renderIssueBoard`: cross-repo board; both side panes hidden.
- `renderPullRequests`: PR state.
- `renderShellFlow`: future named plain shell state.

Production should not include the removed mock-state navbar. The top nav should only expose durable app destinations: `Issues`, `Board`, `PRs`, `Workbench`, `Quick Create`, `Settings`.

---

## Existing API Map

Use these current routes before adding new backend surface:

- Repos: `GET/POST /api/v1/repos`, `PATCH/DELETE /api/v1/repos/[owner]/[repo]`, `GET /api/v1/repos/github`.
- Settings: `GET/PATCH /api/v1/settings`.
- User/health: `GET /api/v1/user`, `GET /api/v1/health`.
- Issues: `GET /api/v1/issues/[owner]/[repo]`, `GET/PATCH /api/v1/issues/[owner]/[repo]/[number]`.
- Issue actions: comments, state, labels, assignees, reassign, priority, priorities.
- Launch: `POST /api/v1/launch/[owner]/[repo]/[number]`.
- Deployments: `GET /api/v1/deployments`, `POST /api/v1/deployments/[id]/ensure-ttyd`, `POST /api/v1/deployments/[id]/end`.
- Terminal proxy: `/api/terminal/[port]`.
- Session previews: `GET /api/v1/sessions/previews`.
- Worktrees: `GET /api/v1/worktrees`, `GET /api/v1/worktrees/status`, reset, cleanup.
- Quick create/parse: `POST /api/v1/parse`, `POST /api/v1/parse/create`, `GET/POST /api/v1/drafts`, `GET/PATCH/DELETE /api/v1/drafts/[id]`, `POST /api/v1/drafts/[id]/assign`.
- Images: `POST /api/v1/images/upload`.
- PRs: `GET /api/v1/pulls/[owner]/[repo]`, detail, comments, review, merge.

---

## Workbench Test Fixture Contract

Unless a task states otherwise, all route/component/Playwright tests should share this fixture shape so acceptance criteria stay measurable:

- Repo A: `mean-weasel/issuectl`, initials `IC`, `id: 1`, `localPath: /Users/example/issuectl`, `branchPattern: issue-{number}-{slug}`.
- Repo B: `mean-weasel/bugdrop`, initials `BD`, `id: 2`, `localPath: /Users/example/bugdrop`, `branchPattern: null`.
- Repo C: `mean-weasel/api`, initials `API`, `id: 3`, `localPath: null`, `branchPattern: null`.
- Repo D: `mean-weasel/web`, initials `WEB`, `id: 4`, `localPath: /Users/example/web`, `branchPattern: null`.
- Active deployments:
  - `id: 101`, repo A issue `447`, agent `codex`, branch `issue-447-mac-sidebar`, `ttydPort: 7701`, preview status `active`.
  - `id: 102`, repo A issue `498`, agent `claude`, branch `issue-498-terminal-resize`, `ttydPort: 7702`, preview status `idle`, `idleSince` present.
  - `id: 103`, repo A issue `486`, agent `codex`, branch `issue-486-mobile-filters`, `ttydPort: 7703`, preview status `error`, preview text contains `preview error: ttyd process exited`.
  - `id: 201`, repo B issue `73`, agent `codex`, branch `issue-73-stale-replay`, `ttydPort: 7711`, preview status `active`.
- Repo A issues:
  - `#447 Add display-scoped Mac sidebar state`, open, normal priority, running.
  - `#512 Desktop instance manager workbench`, open, high priority, no deployment.
  - `#498 Terminal resize behavior drops rows after reconnect`, open, normal priority, running.
  - `#486 Polish mobile filters and bottom sheet ergonomics`, open, normal priority, running, preview error state.
- Repo B issues:
  - `#88 Group inbox signals by customer workspace`, open, high priority.
  - `#73 Fix stale replay links in signal detail`, open, normal priority, running.
- Repo C issues:
  - `#21 Add request correlation IDs to worker logs`, open, normal priority.
- Repo D issues: none.

Shared fixture assertions:
- Repo rail badge counts default to live instance count only, matching the mockup's `repo.instances.length`: IC `3`, BD `1`, API no badge, WEB no badge. If production intentionally changes this, a Judge task must approve the deviation and the plan must update this fixture.
- Board mode shows exactly four repo columns with issue counts IC `4`, BD `2`, API `1`, WEB `0`.
- Running-only board filter keeps all four columns visible and leaves WEB/API with `No matching issues` when they have no running issue.
- The preview error row for `#486` must expose an accessible status containing `error` and retain the row after reconnect failure.
- The top nav labels are exactly `Issues`, `Board`, `PRs`, `Workbench`, `Quick Create`, `Settings`; production must not render `Mock state`, `Terminal selected`, `Issue selected`, `Repo selected`, `Repo setup`, or a prototype top-level `New shell` state switcher.

---

## Traceability Matrix

| Mockup anchor | Production surface | Existing API calls | Verification trigger |
| --- | --- | --- | --- |
| `renderRepoRail` | `RepoRail` admitted repo strip | `GET /api/v1/workbench` composed from `GET /api/v1/repos` data | Rail renders IC, BD, API, WEB with fixture badges `3`, `1`, none, none |
| `renderInstances`, `renderInstance` | `InstancePane` issue sessions | `GET /api/v1/workbench`, `GET /api/v1/deployments`, `GET /api/v1/sessions/previews`, `POST /api/v1/deployments/[id]/ensure-ttyd`, `POST /api/v1/deployments/[id]/end` | Sort buttons, select session, reconnect, end |
| `renderIssues`, `renderIssue` | `IssueQueuePane` repo issue queue | `GET /api/v1/workbench`, `GET /api/v1/issues/[owner]/[repo]`, `GET /api/v1/issues/[owner]/[repo]/priorities` | Filter open/running/closed, launch, details, jump to session |
| `renderFocus` terminal branch | `TerminalFocus` | `/api/terminal/[port]`, `POST /api/v1/deployments/[id]/ensure-ttyd`, `POST /api/v1/deployments/[id]/end` | Select active session, assert terminal frame src contains `/api/terminal/7701` |
| `renderFocus` issue branch | `IssueFocus` | `GET/PATCH /api/v1/issues/[owner]/[repo]/[number]`, `POST /comments`, `POST /state`, `POST /labels`, `PUT /assignees`, `PUT /priority`, `POST /reassign`, `POST /api/v1/images/upload` | Open issue detail, edit, comment, close, label, assign, priority, reassign, attach |
| Launch options in issue focus | Existing launch form inside `IssueFocus` | `GET /api/v1/worktrees/status`, `POST /api/v1/worktrees/reset`, `POST /api/v1/worktrees/cleanup`, `POST /api/v1/launch/[owner]/[repo]/[number]` | Open launch options, dirty worktree, reset/resume, launch |
| `renderRepoFocus` | `RepoOverviewFocus` | `GET /api/v1/workbench`, refresh via aggregate reload | Click repo rail item, no selected issue/session |
| `renderRepoSetup` | `RepoSetupFocus` | `PATCH /api/v1/repos/[owner]/[repo]`, `POST /api/v1/repos`, `DELETE /api/v1/repos/[owner]/[repo]`, `GET /api/v1/repos/github?refresh=true` | Edit path/pattern, refresh GitHub repos, add/remove repo |
| `renderSettings` | `SettingsFocus` | `GET/PATCH /api/v1/settings`, `GET /api/v1/health`, `GET /api/v1/user` | Click Settings, side panes hidden, save settings |
| `renderGlobalIssues` | `GlobalIssuesFocus` | `GET /api/v1/workbench` all repo issues | Click Issues, side panes hidden, click global issue |
| `renderIssueBoard` | `BoardFocus` | `GET /api/v1/workbench` all repo issues/deployments/priorities | Click Board, side panes hidden, four columns |
| `renderQuickCreate` | `QuickCreateFocus` | `POST /api/v1/parse`, `POST /api/v1/parse/create`, `GET/POST/PATCH /api/v1/drafts`, `POST /api/v1/drafts/[id]/assign` | Parse text, create accepted issues, draft path |
| `renderPullRequests` | `PullRequestsFocus` | `GET /api/v1/pulls/[owner]/[repo]?checks=true`, `GET /api/v1/pulls/[owner]/[repo]/[number]`, `POST /review`, `POST /merge`, `POST /comments` | Click PRs, open PR, review, merge, comment |
| `renderShellFlow` | Named plain shells | New shell APIs from Task 15 only | Disabled until Task 15 or separate goal completes |

---

## Objective UI Acceptance Standards

Use these standards anywhere a task mentions layout or visual state:

- Repo rail width is `76px` desktop and `68px` under the existing `1100px` breakpoint unless the CSS module documents a different constant.
- Instance pane default width is `284px`; issue queue default width is `348px`.
- Resizable panes clamp instance width to `240px-420px`, issue queue width to `280px-480px`, and focus pane to at least `440px`.
- Collapsed global modes (`Issues`, `Board`, `Settings`) must compute grid columns as rail plus focus only; `.instance-pane`, `.issue-pane`, and resize handles must have `display: none` or be absent from the accessibility tree.
- Selected nav item uses `aria-current="page"` or `data-active="true"`; selected repo uses `aria-pressed="true"` or `data-selected="true"`.
- Text-overlap checks in Playwright should fail if any two tested visible text bounding boxes overlap by more than `2px` in both axes.
- Visual screenshot comparisons, if used, should tolerate at most `0.02` diff ratio for stable mocked states.
- “Truncated preview” means no session preview line exceeds two visible lines and the card height remains unchanged after injecting a `240+` character preview line.
- “Visually distinct status” means the status has both text (`active`, `idle`, `error`, or `unavailable`) and a status-specific class or `data-status` attribute.

---

## Playwright E2E and CLI Coverage

Playwright is part of the acceptance criteria, not an optional final check. Every visible workbench slice must add or update `packages/web/e2e/workbench.spec.ts` and must produce either automated assertions, CLI screenshots, or both.

### Required Automated E2E Command

Run for every PR batch that changes `/workbench` UI:

```bash
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium
```

For final QA, run with trace capture enabled:

```bash
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium --trace=on
```

Acceptance criteria:
- The command exits `0`.
- `test-results/` contains traces/screenshots for any failed first attempt, or the QA report explicitly says no failures occurred.
- Mutation tests assert request method, route, and JSON/form body using Playwright route interception.
- Layout tests use bounding boxes, not screenshots alone, for nav wrapping, pane overlap, and minimum board column width.

### Required Playwright CLI Screenshot Pass

After Task 16 and before final Judge audit, capture deterministic screenshots from the running app using mocked or seeded fixture data:

```bash
mkdir -p docs/qa/workbench-artifacts
pnpm --filter @issuectl/web exec playwright screenshot http://localhost:3847/workbench docs/qa/workbench-artifacts/workbench-terminal-1440.png --viewport-size=1440,1000
pnpm --filter @issuectl/web exec playwright screenshot http://localhost:3847/workbench?mode=issue docs/qa/workbench-artifacts/workbench-issue-1440.png --viewport-size=1440,1000
pnpm --filter @issuectl/web exec playwright screenshot http://localhost:3847/workbench/settings docs/qa/workbench-artifacts/workbench-settings-1440.png --viewport-size=1440,1000
pnpm --filter @issuectl/web exec playwright screenshot http://localhost:3847/workbench/board docs/qa/workbench-artifacts/workbench-board-1440.png --viewport-size=1440,1000
pnpm --filter @issuectl/web exec playwright screenshot http://localhost:3847/workbench docs/qa/workbench-artifacts/workbench-terminal-1100.png --viewport-size=1100,850
```

If the final implementation does not use `?mode=issue`, replace that URL with the real route/query that opens fixture issue `#447`; record the actual URL in `docs/qa/workbench-validation.md`.

Acceptance criteria:
- All screenshot commands exit `0`.
- Each screenshot file exists and is larger than `20 KB`.
- QA report embeds or links each artifact path.
- Screenshots show no prototype state navbar.

### Coverage Matrix

| Mockup state | Automated Playwright coverage | CLI screenshot required |
| --- | --- | --- |
| Initial terminal focus | Select deployment `101`; assert `/api/terminal/7701` iframe | `workbench-terminal-1440.png`, `workbench-terminal-1100.png` |
| Issue detail focus | Open `#447`; assert detail heading, linked PR/deployment, side panes visible | `workbench-issue-1440.png` |
| Repo overview | Click API repo; assert setup callout and no fake terminal | Covered by automated test |
| Instance sorting | Click `running first`, `recent`, `kind`; assert fixture order | Covered by automated test |
| Preview error state | Assert `#486` row has `data-status="error"` and error text | Included in terminal or issue screenshot if visible |
| Issue queue filters | Toggle open/running/closed; assert fixture counts | Covered by automated test |
| Launch options/worktree | Open launch options; assert agent/workspace/worktree endpoints and launch body | Covered by automated test |
| Global Issues | Click Issues; assert instance/issue panes hidden and global list visible | Automated; optional screenshot if QA finds risk |
| Board | Click Board; assert four columns and running-only behavior | `workbench-board-1440.png` |
| PRs | Click PRs; assert list/detail/review/merge routes | Covered by automated test |
| Quick Create | Click Quick Create; assert parse/create/draft endpoints | Covered by automated test |
| Settings | Click Settings; assert panes hidden, health/settings visible | `workbench-settings-1440.png` |
| Resize/collapse | Drag handles, reset widths, collapse sections, assert localStorage and bounds | Covered by automated test |

### Artifact and QA Report Requirements

`docs/qa/workbench-validation.md` must include:
- automated Playwright command(s) run and final exit status;
- CLI screenshot commands run and artifact paths;
- a coverage matrix copied from this section with pass/fail status per row;
- failed-first-attempt trace paths when any e2e test initially fails;
- visual deviations from `docs/mockups/workbench.html`;
- named-shell decision status.

---

## Proposed File Structure

Create a focused `/workbench` module rather than mixing the new desktop surface into the existing root dashboard.

- Create: `packages/web/app/workbench/page.tsx`
- Create: `packages/web/app/workbench/loading.tsx`
- Create: `packages/web/app/workbench/error.tsx`
- Create: `packages/web/app/workbench/WorkbenchPage.module.css`
- Create: `packages/web/components/workbench/WorkbenchShell.tsx`
- Create: `packages/web/components/workbench/WorkbenchShell.module.css`
- Create: `packages/web/components/workbench/RepoRail.tsx`
- Create: `packages/web/components/workbench/InstancePane.tsx`
- Create: `packages/web/components/workbench/IssueQueuePane.tsx`
- Create: `packages/web/components/workbench/FocusPane.tsx`
- Create: `packages/web/components/workbench/TerminalFocus.tsx`
- Create: `packages/web/components/workbench/IssueFocus.tsx`
- Create: `packages/web/components/workbench/RepoOverviewFocus.tsx`
- Create: `packages/web/components/workbench/RepoSetupFocus.tsx`
- Create: `packages/web/components/workbench/BoardFocus.tsx`
- Create: `packages/web/components/workbench/GlobalIssuesFocus.tsx`
- Create: `packages/web/components/workbench/PullRequestsFocus.tsx`
- Create: `packages/web/components/workbench/QuickCreateFocus.tsx`
- Create: `packages/web/components/workbench/SettingsFocus.tsx`
- Create: `packages/web/components/workbench/workbench-data.ts`
- Create: `packages/web/components/workbench/workbench-state.ts`
- Create: `packages/web/components/workbench/workbench-api.ts`
- Create: `packages/web/components/workbench/workbench-types.ts`
- Create: `packages/web/components/workbench/workbench.test.ts`
- Create: `packages/web/app/api/v1/workbench/route.ts`
- Create: `packages/web/app/api/v1/workbench/route.test.ts`
- Create later only for named shell slice: `packages/web/app/api/v1/shells/route.ts`, `packages/web/app/api/v1/shells/[id]/end/route.ts`, core shell schema helpers.
- Create: `packages/web/e2e/workbench.spec.ts`

Existing components to reuse:

- `packages/web/components/terminal/TerminalPanel.tsx`
- `packages/web/components/launch/*`
- `packages/web/components/detail/*`
- `packages/web/components/parse/*`
- `packages/web/components/settings/*`
- `packages/web/components/pr/*`

---

## Task 1: Workbench Aggregate API

**Purpose:** Give `/workbench` one stable read model so the UI does not fan out blindly from the browser.

**Mockup reference:** repo rail counts, instance pane, issue queue, board columns, settings health summary.

**Files:**
- Create: `packages/web/app/api/v1/workbench/route.ts`
- Create: `packages/web/app/api/v1/workbench/route.test.ts`
- Create: `packages/web/components/workbench/workbench-types.ts`

- [ ] **Step 1: Define the response contract**

Add `WorkbenchRepo`, `WorkbenchDeployment`, `WorkbenchIssueSummary`, `WorkbenchPreview`, and `WorkbenchPayload` types in `workbench-types.ts`.

The contract must include:
- tracked repos with `id`, `owner`, `name`, `localPath`, `branchPattern`;
- active deployments grouped by repo and issue number;
- session previews keyed by `ttydPort`;
- issue summaries per repo with `number`, `title`, `state`, `labels`, `updatedAt`, `priority`, `hasActiveDeployment`;
- settings subset needed by the mockup;
- health/user summary with nullable error fields.

**Acceptance criteria:**
- Type names are exported.
- The type maps every non-named-shell fixture field in `Workbench Test Fixture Contract` to an explicit payload path; route tests assert at least `repos[0].badgeCount === 3`, `repos[0].issues.length === 4`, `repos[0].deployments.length === 3`, `repos[0].previews["7703"].status === "error"`, and `repos[3].issues.length === 0`.
- The type does not include fake named shell data.

- [ ] **Step 2: Write route tests**

Test `GET /api/v1/workbench` with mocked core functions.

Assertions:
- Requires API auth using existing `requireAuth`.
- Returns repos, deployments, previews, issues, priorities, settings, health, and user in one payload.
- Continues returning partial data when one repo's issue fetch fails, with that repo marked `issueError`.
- Does not call PR detail APIs.
- Does not expose pending deployments.

Run: `pnpm --filter @issuectl/web test -- app/api/v1/workbench/route.test.ts`

Expected before implementation: failing tests because route does not exist.

- [ ] **Step 3: Implement the route**

Use existing core/data helpers and existing preview logic:
- `listRepos`
- `getActiveDeployments`
- `getIssues`
- `listPrioritiesForRepo`
- `getSettings`
- `getSessionPreviews`
- `withAuthRetry`

Limit repo fanout using existing `DEFAULT_REPO_FANOUT` or the current map-limit helper.

**Acceptance criteria:**
- The route returns `200` with an empty but valid payload when no repos are tracked.
- Repo issue errors are scoped to the failing repo.
- Active deployments include owner/repo names and are grouped without client inference.
- `fromCache` and `cachedAt` are preserved per repo issue list.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @issuectl/web test -- app/api/v1/workbench/route.test.ts
pnpm --filter @issuectl/web typecheck
```

Expected: route tests pass and typecheck passes.

---

## Task 2: Route Shell and Production Navigation

**Purpose:** Create `/workbench` with the same high-level layout as the mockup and no mock-only controls.

**Mockup reference:** header after mock navbar removal; durable nav destinations only.

**Files:**
- Create: `packages/web/app/workbench/page.tsx`
- Create: `packages/web/app/workbench/loading.tsx`
- Create: `packages/web/app/workbench/error.tsx`
- Create: `packages/web/app/workbench/WorkbenchPage.module.css`
- Create: `packages/web/components/workbench/WorkbenchShell.tsx`
- Create: `packages/web/components/workbench/WorkbenchShell.module.css`
- Create: `packages/web/components/workbench/workbench-api.ts`
- Create: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add a Playwright smoke test for the empty shell**

Create a test that intercepts `/api/v1/workbench` and returns two repos, no sessions, no issues.

Assertions:
- `/workbench` renders `issuectl` brand.
- Top nav labels are exactly `Issues`, `Board`, `PRs`, `Workbench`, `Quick Create`, `Settings`.
- There is no `Mock state`, `Terminal selected`, `Issue selected`, `Repo selected`, `Repo setup`, or `New shell` top-level prototype control.
- Repo rail is visible.
- Main center pane has an empty repo overview or setup prompt.

- [ ] **Step 2: Implement page loader**

Fetch `/api/v1/workbench` through a small API helper. The first implementation can be client-side to support live interaction, but the API helper must centralize auth/error parsing.

**Acceptance criteria:**
- Loading and error states keep the repo rail column at the Objective UI standard width; Playwright asserts the rail bounding box width before and after the `/api/v1/workbench` response differs by `0px`.
- Error state renders a button with accessible name `Retry workbench load`; clicking it issues exactly one additional `GET /api/v1/workbench` request and replaces the error with loaded content on a `200` response.
- Empty repos state renders `No tracked repositories` and links/buttons with accessible names `Add repository` and `Open settings`.

- [ ] **Step 3: Implement top nav mode state**

Supported modes:
- `workbench`
- `globalIssues`
- `board`
- `pullRequests`
- `quickCreate`
- `settings`

**Acceptance criteria:**
- Workbench mode shows repo rail, instance pane, focus pane, and issue pane.
- Global Issues, Board, and Settings modes hide instance and issue panes.
- PRs and Quick Create keep repo rail, instance pane, and issue pane visible in the first production slice, matching the current mockup; if visual QA later fails objective overlap/focus-width checks, a Judge task must approve collapsing them.
- Active nav item has `aria-current="page"` and the URL is one of `/workbench`, `/workbench/issues`, `/workbench/board`, `/workbench/prs`, `/workbench/quick-create`, `/workbench/settings`.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium
pnpm --filter @issuectl/web typecheck
pnpm --filter @issuectl/web lint
```

Expected: smoke test passes, no lint/type errors.

---

## Task 3: Repo Rail and Repo Selection

**Purpose:** Implement the admitted repo rail and repo-scoped center overview.

**Mockup reference:** `renderRepoRail`, `renderRepoFocus`.

**Files:**
- Create: `packages/web/components/workbench/RepoRail.tsx`
- Create: `packages/web/components/workbench/RepoOverviewFocus.tsx`
- Modify: `packages/web/components/workbench/WorkbenchShell.tsx`
- Modify: `packages/web/components/workbench/WorkbenchShell.module.css`
- Modify: `packages/web/components/workbench/workbench-state.ts`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add state reducer tests**

Test:
- default repo is first repo in payload;
- clicking repo changes selected repo and clears selected issue/session;
- repo rail counts show live instance counts only, matching the mockup and fixture contract;
- selected repo persists across workbench submodes when returning from Settings/Board.

Run: `pnpm --filter @issuectl/web test -- components/workbench/workbench.test.ts`

- [ ] **Step 2: Implement repo rail**

Use compact repo initials from the mockup, with accessible labels like `mean-weasel/issuectl`.

**Acceptance criteria:**
- Rail width is `76px` at `1440px` viewport and `68px` at `1100px` viewport.
- Active repo exposes `aria-pressed="true"` or `data-selected="true"` and the active button text remains readable at both tested widths.
- Counts match fixture live instance counts: IC `3`, BD `1`, API no badge, WEB no badge.
- Add/settings rail buttons point to reachable production surfaces: `Add repository` opens repo setup and `Settings` opens `/workbench/settings`.

- [ ] **Step 3: Implement repo overview focus**

When a repo is clicked and no issue/session is selected, center pane shows:
- repo full name;
- prompt to select session or issue;
- `New shell` disabled or labeled as unavailable until Task 11;
- `Refresh`;
- repo health summary from payload.

**Acceptance criteria:**
- No fake terminal is shown for repo-only state.
- If repo has no local path, center pane renders `Set up local path` and a button/link with accessible name `Open repo setup`.
- If repo issue fetch failed, center pane renders `Issues failed to load` and the failed repo name while other repos remain selectable.

- [ ] **Step 4: Verify**

Run Playwright:
- Click each repo in the rail.
- Assert focus heading changes to the selected repo.
- Assert selected session and issue states clear.

---

## Task 4: Instance Pane for Issue Sessions

**Purpose:** Show active issue deployments as the repo-scoped instance manager.

**Mockup reference:** `renderInstances`, `renderInstance`.

**Files:**
- Create: `packages/web/components/workbench/InstancePane.tsx`
- Create: `packages/web/components/workbench/TerminalFocus.tsx`
- Modify: `packages/web/components/workbench/workbench-state.ts`
- Modify: `packages/web/components/workbench/workbench-api.ts`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add sorting tests**

Test default sort:
- active/running sessions before idle;
- error/unavailable previews remain visible and do not sort above active unless recently updated;
- recent sort orders by `launchedAt`;
- kind sort places issue sessions before future named shells.

**Acceptance criteria:**
- Sorting is deterministic when timestamps tie.
- The sort names match the mockup: `running first`, `recent`, `kind`.
- With the shared fixture, `running first` order for repo A is deployment `101`, `103`, then `102`; `recent` order follows descending `launchedAt`; `kind` keeps all issue sessions before future named shells.

- [ ] **Step 2: Implement issue session cards**

Each session card shows:
- issue number and title if the issue exists in the current repo payload;
- agent;
- branch/session name;
- runtime/idle indicator;
- preview text;
- preview status `active`, `idle`, `error`, or `unavailable`;
- `Reconnect` and `End` actions.

**Acceptance criteria:**
- Preview error state renders `data-status="error"` and visible text containing `error` on the `#486` row.
- Unavailable state renders `data-status="unavailable"` and a row-scoped `Reconnect` button.
- Long preview lines obey the Objective UI truncation rule and do not change the card height by more than `4px`.
- End action opens a confirmation with text `End session?` and buttons `Cancel` and `End session`.

- [ ] **Step 3: Wire reconnect/end actions**

Use:
- `POST /api/v1/deployments/[id]/ensure-ttyd`
- `POST /api/v1/deployments/[id]/end`

**Acceptance criteria:**
- Reconnect updates terminal port and opens/selects terminal focus on success.
- End removes the session from the pane without a full page reload.
- Failed reconnect shows inline row error and keeps the row visible.
- Reconnect success test intercepts `POST /api/v1/deployments/103/ensure-ttyd`, returns `{ "alive": true, "port": 7799 }`, and asserts terminal frame src contains `/api/terminal/7799`.

- [ ] **Step 4: Verify**

Playwright with mocked APIs:
- Session with `active` preview appears first.
- Clicking session opens terminal focus.
- Reconnect calls the expected endpoint.
- End calls the expected endpoint and removes row.

---

## Task 5: Terminal Focus

**Purpose:** Center focus shows the actual terminal for a selected session.

**Mockup reference:** terminal focus state: selecting an instance shows only terminal content in the focus area.

**Files:**
- Modify: `packages/web/components/workbench/TerminalFocus.tsx`
- Reuse: `packages/web/components/terminal/TerminalPanel.tsx`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Render terminal focus**

Use existing `TerminalPanel` or the closest existing terminal component rather than creating a new iframe/proxy path.

**Acceptance criteria:**
- Focus title shows issue/session identity.
- Terminal iframe src contains `/api/terminal/7701` for fixture deployment `101`.
- No issue detail content is shown in terminal focus.
- If selected deployment has no ttyd port, focus shows reconnect-needed state.

- [ ] **Step 2: Add terminal action controls**

Controls:
- reconnect;
- open in separate tab if existing terminal component supports it;
- end session;
- view issue.

**Acceptance criteria:**
- `View issue` switches center focus to issue detail and highlights issue in right pane.
- `End session` returns focus to repo overview.
- Reconnect failure leaves URL and selected deployment unchanged, renders `Reconnect failed`, and keeps the row's `Reconnect` button enabled.

- [ ] **Step 3: Verify**

Playwright:
- Select session.
- Assert terminal frame visible.
- Assert issue detail text is not present.
- Trigger `View issue`, assert detail focus appears.

---

## Task 6: Repo Issue Queue Pane

**Purpose:** Implement the right repo issue queue with open/running/closed filters and launch/detail actions.

**Mockup reference:** `renderIssues`, `renderIssue`.

**Files:**
- Create: `packages/web/components/workbench/IssueQueuePane.tsx`
- Modify: `packages/web/components/workbench/workbench-state.ts`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add grouping tests**

Test:
- issues with active deployments are `running`;
- open issues without deployments are `open`;
- closed issues are `closed`;
- filter counts match visible groups;
- default filter includes open and running.

- [ ] **Step 2: Implement issue queue**

Rows show:
- title and number;
- status chip;
- priority chip;
- updated age;
- `Launch` for non-running open issues;
- `Jump to session` for running issues;
- `Details`.

**Acceptance criteria:**
- Right pane title and counts match fixture repo A: title contains `open work 4`, open filter shows four issue rows, running filter shows three issue rows, closed filter shows zero rows.
- Running issue row can jump to its active session.
- Details opens issue focus.
- Long titles wrap to at most two lines and do not increase row height by more than `8px` when a 120-character title fixture is injected.

- [ ] **Step 3: Verify**

Playwright:
- Switch filters.
- Click Details.
- Click Jump to session.
- Assert `Details` on `#512` changes center heading to `#512 Desktop instance manager workbench`; assert `Jump to session` on `#447` changes center heading to include `#447` and renders terminal frame `/api/terminal/7701`.

---

## Task 7: Issue Detail Focus and Mutations

**Purpose:** Bring the existing issue detail capabilities into the workbench center pane.

**Mockup reference:** issue focus state, broader issue details, linked PRs, comments, labels, assignees, reassign, image attachment, close/comment actions.

**Mockup anchors:** `renderFocus` issue branch, comment box, `Attach image`, priority chip, linked PR card, labels/assignee/reassign action buttons, close/comment actions.

**API calls:**
| Trigger | Method/route | Required request fields | Expected UI effect |
| --- | --- | --- | --- |
| Load detail | `GET /api/v1/issues/[owner]/[repo]/[number]` | path params | Center pane shows issue title/body/comments/linked PRs/deployments |
| Edit title/body | `PATCH /api/v1/issues/[owner]/[repo]/[number]` | `title?`, `body?` | Detail and queue title update |
| Add comment | `POST /api/v1/issues/[owner]/[repo]/[number]/comments` | `body` | Comment appears without losing selection |
| Close/reopen | `POST /api/v1/issues/[owner]/[repo]/[number]/state` | `state`, optional `comment` | Queue section/count updates |
| Priority | `PUT /api/v1/issues/[owner]/[repo]/[number]/priority` | `priority` | Priority chip updates in detail, queue, board |
| Labels | `POST /api/v1/issues/[owner]/[repo]/[number]/labels` | `label`, `action` | Label chips update |
| Assignees | `PUT /api/v1/issues/[owner]/[repo]/[number]/assignees` | `assignees` | Assignee list updates |
| Reassign | `POST /api/v1/issues/[owner]/[repo]/[number]/reassign` | `targetOwner`, `targetRepo` | Focus moves to returned repo/issue |
| Attach image | `POST /api/v1/images/upload` | multipart `file`, `owner`, `repo` | Returned URL inserted into composer/body |

**Files:**
- Create: `packages/web/components/workbench/IssueFocus.tsx`
- Reuse: `packages/web/components/detail/*`
- Reuse: `packages/web/components/issue/*`
- Modify: `packages/web/components/workbench/workbench-api.ts`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add detail loader tests**

When issue detail is selected, fetch:
- `GET /api/v1/issues/[owner]/[repo]/[number]`
- linked PRs and deployments from the detail payload.

**Acceptance criteria:**
- Detail loading keeps `.instance-pane` and `.issue-pane` visible with their prior rows; only the center pane shows `Loading issue #447`.
- A detail fetch `500` renders `Issue detail failed to load` in the center pane, keeps repo A selected, and leaves the right queue row for `#447` visible.
- Cached detail response with `fromCache: true` or `cachedAt` renders visible text `Cached` plus formatted cache age.

- [ ] **Step 2: Render issue detail**

Reuse existing editable/detail components where practical.

**Acceptance criteria:**
- Markdown fixture `**bold** [link](https://example.com) - item` renders a bold node, a link with href `https://example.com`, and a list item, matching the existing detail route behavior.
- Linked PR fixture `#501 terminal-reconnect-fix` and deployment `101` are both visible in the center pane.
- Priority picker changes `#512` from `high` to `normal` by calling `PUT /api/v1/issues/mean-weasel/issuectl/512/priority` with `{ "priority": "normal" }`.
- Each action in the API calls table has a Playwright request assertion for method, route, and required body fields.

- [ ] **Step 3: Synchronize side panes after mutations**

After close/reopen/priority/edit/reassign:
- update center detail;
- update right queue;
- update board data if board mode opens later;
- preserve selected repo unless reassign moves issue to another repo.

**Acceptance criteria:**
- Closing an issue removes it from open/running queue or moves it to closed filter.
- Reassign moves focus to new repo/issue if API returns new issue number.
- Failed mutation leaves the prior title/priority/count text unchanged and renders a row or center-pane error containing the failed endpoint's action name.

- [ ] **Step 4: Verify**

Playwright mocked workflow:
- Open issue detail.
- Change priority.
- Add comment.
- Close issue.
- Assert queue count updates.

---

## Task 8: Launch Options and Worktree Status

**Purpose:** Expose the real launch options from existing launch APIs inside the workbench.

**Mockup reference:** launch options in issue detail: agent, workspace mode, branch, context, worktree status, reset/resume.

**Mockup anchors:** launch options card in issue focus, `Agent`, `Workspace`, branch input, selected comments/files, preamble/context field, dirty worktree warning, reset/resume actions.

**API calls:**
| Trigger | Method/route | Required request fields | Expected UI effect |
| --- | --- | --- | --- |
| Check worktree | `GET /api/v1/worktrees/status?owner=&repo=&issueNumber=` | query params | Shows clean/dirty/missing status |
| Reset worktree | `POST /api/v1/worktrees/reset` | owner, repo, issueNumber | Dirty warning clears or shows reset error |
| Cleanup stale | `POST /api/v1/worktrees/cleanup` | none | Cleanup result toast or inline message |
| Launch issue | `POST /api/v1/launch/[owner]/[repo]/[number]` | `agent`, `branchName`, `workspaceMode`, `selectedCommentIndices`, `selectedFilePaths`, `preamble?`, `forceResume?`, `idempotencyKey?` | New deployment row appears and terminal focus opens |

**Files:**
- Reuse: `packages/web/components/launch/*`
- Modify: `packages/web/components/workbench/IssueFocus.tsx`
- Modify: `packages/web/components/workbench/workbench-api.ts`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add launch modal integration tests**

Assertions:
- Agent options are `Codex` and `Claude`.
- Workspace mode options are `existing`, `worktree`, `clone`.
- Branch name defaults from settings/repo pattern.
- Worktree status calls `/api/v1/worktrees/status`.
- Dirty worktree warning shows reset/resume choices.
- Reset action calls `POST /api/v1/worktrees/reset` with owner/repo/issue number.

- [ ] **Step 2: Reuse existing launch components**

Do not duplicate the launch form if the current modal/card can be composed.

**Acceptance criteria:**
- Launch request body for fixture `#512` is exactly:

```json
{
  "agent": "codex",
  "branchName": "issue-512-desktop-instance-manager-workbench",
  "workspaceMode": "worktree",
  "selectedCommentIndices": [0],
  "selectedFilePaths": ["packages/web/app/workbench/page.tsx"],
  "preamble": "Investigate workbench implementation",
  "forceResume": false,
  "idempotencyKey": "<valid nonce>"
}
```

- Selected comments/files/preamble are included.
- Duplicate live deployment `409` response with text `already in progress` renders existing-session handling and does not create a second row.
- Success adds session to left pane and selects terminal focus.

- [ ] **Step 3: Verify**

Playwright:
- Open issue.
- Launch with `codex`, `worktree`, custom branch.
- Assert request payload.
- Assert terminal focus selected after success.

---

## Task 9: Global Issues Mode

**Purpose:** Implement the top-nav `Issues` destination as a global issue list with side panes collapsed.

**Mockup reference:** `renderGlobalIssues`; user explicitly requested sidebars collapse when clicking Issues.

**Files:**
- Create: `packages/web/components/workbench/GlobalIssuesFocus.tsx`
- Modify: `packages/web/components/workbench/WorkbenchShell.tsx`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add collapsed-layout test**

Click `Issues`.

Assertions:
- URL or active mode indicates global issues.
- Instance pane hidden.
- Issue queue pane hidden.
- Repo rail remains visible.
- Center pane spans remaining width.

- [ ] **Step 2: Implement global issues list**

Use workbench payload issues from all repos.

**Acceptance criteria:**
- Issues are grouped by repo using fixture headings `mean-weasel/issuectl`, `mean-weasel/bugdrop`, `mean-weasel/api`, and `mean-weasel/web`.
- Running issues render `data-status="running"` and visible text `running`.
- Clicking an issue returns to workbench issue focus with that issue’s repo selected.
- Empty state says no matching issues.

- [ ] **Step 3: Verify**

Playwright:
- Click Issues.
- Assert sidebars collapsed.
- Click a global issue.
- Assert repo rail selection and issue focus.

---

## Task 10: Cross-Repo Board Mode

**Purpose:** Implement the one-column-per-repo board view.

**Mockup reference:** `renderIssueBoard`; user requested side panes closed when board is open.

**Files:**
- Create: `packages/web/components/workbench/BoardFocus.tsx`
- Modify: `packages/web/components/workbench/WorkbenchShell.tsx`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add board layout tests**

Assertions:
- One column per tracked repo.
- Instance pane hidden.
- Issue queue pane hidden.
- Repo rail visible.
- Empty repos show `No matching issues`.
- `Show running only` filters columns without removing empty columns.

- [ ] **Step 2: Implement board**

Board cards show:
- issue number/title;
- status/priority;
- updated age;
- active-session indicator.

**Acceptance criteria:**
- Sort by priority places high-priority `#512` before normal-priority `#447` in repo A.
- Sort by repo/current payload order keeps columns in fixture order IC, BD, API, WEB.
- Running-only filter is reversible: first click reduces visible cards to four running issues, second click restores seven open issue cards.
- Clicking card opens issue focus with selected repo.

- [ ] **Step 3: Verify**

Playwright:
- Click Board.
- Toggle running-only.
- Sort by priority.
- Click issue card.
- Assert side panes restore when returning to issue focus.

---

## Task 11: Repo Setup and Settings Mode

**Purpose:** Implement repo setup and global settings surfaces inside `/workbench`.

**Mockup reference:** `renderRepoSetup`, `renderSettings`; user explicitly requested sidebars collapse for Settings.

**Mockup anchors:** `renderRepoSetup` local path, branch pattern, refresh GitHub repos, add selected repo, remove repo; `renderSettings` launch defaults, cache TTL, worktree dir, agent args, health card, reset/save.

**API calls:**
| Trigger | Method/route | Required request fields | Expected UI effect |
| --- | --- | --- | --- |
| Save repo setup | `PATCH /api/v1/repos/[owner]/[repo]` | `localPath?`, `branchPattern?` | Repo setup card reflects saved values |
| Add repo | `POST /api/v1/repos` | `owner`, `name` | Repo appears in rail |
| Remove repo | `DELETE /api/v1/repos/[owner]/[repo]` | path params | Repo disappears from rail after confirmation |
| Refresh accessible repos | `GET /api/v1/repos/github?refresh=true` | query `refresh=true` | Picker refreshes |
| Load settings | `GET /api/v1/settings` | none | Settings form populated |
| Save settings | `PATCH /api/v1/settings` | editable setting keys | Saved message, form remains open |
| Health/user | `GET /api/v1/health`, `GET /api/v1/user` | none | Health card populated |

**Files:**
- Create: `packages/web/components/workbench/RepoSetupFocus.tsx`
- Create: `packages/web/components/workbench/SettingsFocus.tsx`
- Reuse: `packages/web/components/settings/*`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add settings collapsed-layout test**

Click `Settings`.

Assertions:
- Instance pane hidden.
- Issue queue pane hidden.
- Settings form visible.
- Health summary visible.

- [ ] **Step 2: Implement repo setup focus**

Surface:
- local path;
- branch pattern;
- default launch agent;
- accessible GitHub repo picker;
- add selected repo;
- remove repo.

**Acceptance criteria:**
- `PATCH /api/v1/repos/[owner]/[repo]` receives local path and branch pattern.
- `POST /api/v1/repos` receives `{ "owner": "mean-weasel", "name": "web" }` when adding WEB from the picker.
- `DELETE /api/v1/repos/mean-weasel/web` is called only after confirming `Remove mean-weasel/web?`.
- `GET /api/v1/repos/github?refresh=true` powers refresh.
- Remove repo asks for confirmation.
- Setup errors stay scoped to the setup card.

- [ ] **Step 3: Implement settings focus**

Surface:
- launch defaults;
- cache TTL;
- worktree directory;
- agent extra args;
- idle thresholds;
- health card with server/user/tracked repo count.

**Acceptance criteria:**
- `GET/PATCH /api/v1/settings` used for editable settings.
- `GET /api/v1/health` and `GET /api/v1/user` used for health.
- Invalid extra args show API validation errors.
- Save success keeps URL `/workbench/settings`, renders `Settings saved`, and leaves instance/issue panes hidden.

- [ ] **Step 4: Verify**

Playwright:
- Open repo setup from repo overview.
- Change branch pattern.
- Open Settings.
- Save cache TTL.
- Assert side panes collapsed.

---

## Task 12: Quick Create Mode

**Purpose:** Bring current quick create and parse flows into the workbench nav.

**Mockup reference:** `renderQuickCreate`.

**Mockup anchors:** parse text area, `Parse`, candidate issue cards, accepted/rejected state, `Create accepted issues`, draft fallback.

**API calls:**
| Trigger | Method/route | Required request fields | Expected UI effect |
| --- | --- | --- | --- |
| Parse text | `POST /api/v1/parse` | `input` | Candidate cards render |
| Create accepted | `POST /api/v1/parse/create` | `issues[]` with `title`, `owner`, `repo`, `accepted` | Created issue links or focus target render |
| Save draft | `POST /api/v1/drafts` | `title`, `body?`, `priority?` | Draft saved state |
| Update draft | `PATCH /api/v1/drafts/[id]` | draft fields | Draft row updates |
| Assign draft | `POST /api/v1/drafts/[id]/assign` | repo/labels payload from existing route | Created issue opens or assignment error renders |

**Files:**
- Create: `packages/web/components/workbench/QuickCreateFocus.tsx`
- Reuse: `packages/web/components/parse/*`
- Reuse: `packages/web/app/new/NewIssuePage.tsx` pieces where practical.
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add quick create tests**

Assertions:
- `Quick Create` top nav opens the surface.
- Parse calls `POST /api/v1/parse`.
- Create accepted issues calls `POST /api/v1/parse/create`.
- Draft path calls exact draft endpoints listed in the API calls table.

- [ ] **Step 2: Implement quick create focus**

**Acceptance criteria:**
- Destination repo defaults to current selected repo.
- Parsed candidates can be accepted/rejected.
- Create success can navigate to created issue focus.
- Parse `422` errors remain in center pane, render the response error text, and keep the typed input unchanged.

- [ ] **Step 3: Verify**

Playwright:
- Parse text.
- Accept two issues.
- Create.
- Assert request body contains repo and accepted flags.

---

## Task 13: Pull Requests Mode

**Purpose:** Implement repo-scoped PR review surface from existing PR APIs.

**Mockup reference:** `renderPullRequests`.

**Mockup anchors:** PR row, `Needs review`, `Refresh checks`, `Review`, `Merge squash`, linked issue.

**API calls:**
| Trigger | Method/route | Required request fields | Expected UI effect |
| --- | --- | --- | --- |
| Load PR list | `GET /api/v1/pulls/[owner]/[repo]?checks=true` | path params, checks query | PR rows show checks |
| Load PR detail | `GET /api/v1/pulls/[owner]/[repo]/[number]` | path params | Detail opens in center |
| Submit review | `POST /api/v1/pulls/[owner]/[repo]/[number]/review` | `event`, `body` | Review status updates |
| Merge | `POST /api/v1/pulls/[owner]/[repo]/[number]/merge` | `mergeMethod` | PR row moves/marks merged |
| Comment | `POST /api/v1/pulls/[owner]/[repo]/[number]/comments` | `body` | Comment appears |

**Files:**
- Create: `packages/web/components/workbench/PullRequestsFocus.tsx`
- Reuse: `packages/web/components/pr/*`
- Reuse: `packages/web/components/detail/PrDetail.tsx`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add PR mode tests**

Assertions:
- `PRs` top nav opens PR surface.
- Calls `GET /api/v1/pulls/[owner]/[repo]?checks=true` for selected repo.
- Review action calls `POST /api/v1/pulls/mean-weasel/issuectl/501/review` with `{ "event": "APPROVE", "body": "Looks good" }`.
- Merge action calls `POST /api/v1/pulls/mean-weasel/issuectl/501/merge` with `{ "mergeMethod": "squash" }`.

- [ ] **Step 2: Implement PR list/detail**

**Acceptance criteria:**
- PR rows show checks state and linked issue when present.
- Clicking PR opens detail within center focus.
- Review/merge/comment actions call exact routes and request bodies listed above.
- Empty state is repo-specific.

- [ ] **Step 3: Verify**

Playwright:
- Open PRs.
- Click PR.
- Submit review.
- Assert request body and success state.

---

## Task 14: Width Adjustability and Collapsible Sections

**Purpose:** Implement the mockup’s adjustable columns and collapsible areas without destabilizing layout.

**Mockup reference:** resize handles and disclosure sections in instance pane/detail.

**Files:**
- Modify: `packages/web/components/workbench/WorkbenchShell.tsx`
- Modify: `packages/web/components/workbench/WorkbenchShell.module.css`
- Modify: `packages/web/components/workbench/InstancePane.tsx`
- Modify: `packages/web/components/workbench/IssueFocus.tsx`
- Modify: `packages/web/components/workbench/workbench-state.ts`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add reducer tests for widths/collapse**

Test:
- left width clamps to minimum and maximum;
- right width clamps to minimum and maximum;
- reset restores defaults;
- section collapse state persists during repo changes;
- Board/Issues/Settings ignore side widths while collapsed.

- [ ] **Step 2: Implement drag handles**

**Acceptance criteria:**
- Keyboard accessible reset action has accessible name `Reset column widths`.
- Pointer drag does not select text.
- Widths are stored in local storage key `issuectl.workbench.columnWidths` as `{ "instances": number, "issues": number }`.
- Layout uses Objective UI clamp values and never drops focus pane below `440px` at tested desktop widths.

- [ ] **Step 3: Implement collapsible sections**

Sections:
- Issue sessions.
- Named shells placeholder/future section.
- Issue detail cards: context, comments, linked PRs, launch options.
- Settings groups.

**Acceptance criteria:**
- Collapsed state sets `aria-expanded="false"` and hides the section body from the accessibility tree.
- Counts remain visible in collapsed headers: `Issue sessions 3`, `Named shells 0` before Task 15.
- Collapse controls have accessible labels.

- [ ] **Step 4: Verify**

Playwright:
- Drag left and right handles.
- Reset widths.
- Collapse and expand issue sessions.
- Confirm no text bounding-box overlap beyond Objective UI threshold at `1440x1000` and `1100x850`.

---

## Task 15: Named Plain Shells Backend Extension

**Purpose:** Support the mockup’s `Named shells` and `New named shell` behavior honestly instead of pretending they are issue deployments.

**Mockup reference:** `Named shells` section in `renderInstances`, `renderShellFlow`.

**GoalBuddy scope note:** This task is intentionally larger than the other workbench slices. A Judge must decide whether it stays in this goal. If it stays, split it into the five Worker cards below: 15A schema/core, 15B shell APIs, 15C preview/ttyd integration, 15D UI wiring, 15E e2e/QA. If it is deferred, production `/workbench` must keep `New named shell` disabled with visible text `Named shells are not available yet`.

**Files:**
- Modify: `packages/core/src/db/schema.ts`
- Modify: `packages/core/src/db/migrations.ts`
- Create: `packages/core/src/db/shells.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/web/app/api/v1/shells/route.ts`
- Create: `packages/web/app/api/v1/shells/[id]/end/route.ts`
- Create: `packages/web/app/api/v1/shells/[id]/ensure-ttyd/route.ts`
- Modify: `packages/web/components/workbench/InstancePane.tsx`
- Modify: `packages/web/components/workbench/RepoOverviewFocus.tsx`
- Modify: `packages/web/components/workbench/TerminalFocus.tsx`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Decide schema shape**

Worker card 15A owns this step.

Recommended schema:
- `shells.id`
- `repo_id`
- `name`
- `workspace_path`
- `ttyd_port`
- `ttyd_pid`
- `launched_at`
- `ended_at`
- `idle_since`

**Acceptance criteria:**
- Shells are repo-scoped.
- Shells are not tied to `issue_number`.
- Shell names are unique only among live shells for the same repo.
- Existing deployments table remains unchanged except if shared helpers are extracted.
- Migration test proves removing a repo cascades shell rows and does not modify existing deployment rows.

- [ ] **Step 2: Add core tests**

Worker card 15A owns this step.

Test:
- create shell;
- list active shells by repo;
- end shell;
- reject duplicate live shell names in same repo;
- allow same shell name after previous one ended;
- cascade delete on repo removal.

- [ ] **Step 3: Implement API**

Worker card 15B owns route creation; Worker card 15C owns ttyd/preview integration.

Endpoints:
- `GET /api/v1/shells?owner=&repo=`
- `POST /api/v1/shells`
- `POST /api/v1/shells/[id]/ensure-ttyd`
- `POST /api/v1/shells/[id]/end`

**Acceptance criteria:**
- `POST /api/v1/shells` validates repo, name, workspace path.
- Launches plain tmux shell without agent command.
- Preview API can include shell previews or a new shell preview endpoint is added.
- End kills ttyd/tmux and marks shell ended.
- `POST /api/v1/shells` response includes `id`, `repoId`, `name`, `workspacePath`, `ttydPort`, and `launchedAt`.
- `POST /api/v1/shells/[id]/ensure-ttyd` returns the same response shape as deployment ensure-ttyd: `alive`, optional `port`, optional `respawned`, optional `error`.

- [ ] **Step 4: Wire UI**

Worker card 15D owns this step.

Enable `New named shell` in repo overview and instance pane.

**Acceptance criteria:**
- New shell appears under `Named shells`.
- Selecting shell opens terminal focus.
- Shell terminal focus does not show issue metadata.
- Ending shell removes it from `Named shells`.
- Shell card status and preview obey the same `data-status` contract as issue sessions.

- [ ] **Step 5: Verify**

Worker card 15E owns this step.

Run:

```bash
pnpm --filter @issuectl/core test -- db/shells.test.ts
pnpm --filter @issuectl/web test -- app/api/v1/shells/route.test.ts
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --grep "named shell"
```

---

## Task 16: Responsive Desktop QA and Visual Acceptance

**Purpose:** Prove the production implementation matches the mockup’s intended desktop behavior without inheriting prototype-only artifacts.

**Mockup reference:** full `docs/mockups/workbench.html`, especially screenshots at 1440px and 1100px.

**Files:**
- Modify: `packages/web/e2e/workbench.spec.ts`
- Create: `docs/qa/workbench-validation.md`

- [ ] **Step 1: Add visual workflow test matrix**

Viewports:
- `1440x1000`
- `1280x900`
- `1100x850`

Workflows:
- initial workbench terminal;
- repo selected overview;
- issue selected detail;
- Settings collapsed sidebars;
- Issues collapsed sidebars;
- Board collapsed sidebars;
- Quick Create;
- PRs;
- launch options open;
- preview error state visible.

**Acceptance criteria:**
- No tested text bounding boxes overlap beyond `2px` in both axes.
- Top nav has one row at `1440px`; at `1100px`, all nav buttons remain visible and clickable without horizontal page scroll.
- Focus pane bounding box never intersects instance or issue pane bounding boxes.
- Board columns are at least `240px` wide at `1440px`; at `1100px`, board scrolls horizontally within the focus area rather than shrinking columns below `220px`.
- If screenshot comparisons are added, stable mocked states use max diff ratio `0.02`.
- The automated Playwright coverage matrix from `Playwright E2E and CLI Coverage` is complete with pass/fail status for every row.

- [ ] **Step 2: Create QA report**

Document:
- screenshots produced by Playwright;
- APIs exercised;
- deviations from mockup;
- remaining named-shell status if Task 15 is deferred;
- manual dogfood notes.
- automated Playwright command exit status, CLI screenshot command exit status, trace paths for any failed-first-attempt tests, and artifact paths under `docs/qa/workbench-artifacts/`.

- [ ] **Step 3: Final verification**

Run:

```bash
pnpm --filter @issuectl/web typecheck
pnpm --filter @issuectl/web lint
pnpm --filter @issuectl/web test
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium --trace=on
```

**Completion acceptance criteria:**
- All commands pass.
- QA report exists.
- Required CLI screenshots exist in `docs/qa/workbench-artifacts/` and each file is larger than `20 KB`.
- QA report includes the Playwright coverage matrix with every row marked pass, deferred with Judge approval, or blocked with a linked follow-up task.
- `/workbench` can be used without referencing the static mockup.
- Existing `/`, `/settings`, `/parse`, issue detail, PR detail, and terminal routes still work.

---

## Deferred or Explicitly Out of Scope

- Native Mac app implementation. This plan builds the web dashboard first.
- Replacing current issue list dashboard.
- PR aggregation across all repos beyond the selected repo unless Task 13 expands scope.
- Search for instances; user preferred sorting over search.
- Draft intake expansion beyond current Quick Create/Parse APIs.
- GitHub Projects integration.

---

## GoalBuddy Execution Board

Use this plan as the source artifact for `$goal-prep`. The board should prefer one Worker card per numbered task. Do not compress Tasks 5-8 or Tasks 9-13 into one card; they touch different behavior and should produce separate receipts.

### Standard Worker Envelope

Every Worker card created from this plan should include:

- `role`: `worker`
- `allowed_files`: the task's Files list only, plus test fixtures directly required by that task.
- `stop_if`: unexpected schema/API mismatch, existing tests unrelated to the task fail before edits, required API credentials are missing, or the Worker needs to touch files outside `allowed_files`.
- `verify`: exact command(s) listed in the task, plus `pnpm --filter @issuectl/web typecheck` for frontend tasks and `pnpm --filter @issuectl/core test` for core schema tasks.
- `receipt`: changed files, tests run with pass/fail result, Playwright test names added/updated, screenshots or Playwright artifact paths for visible UI tasks, API request assertions for mutation tasks, and any deviations from the mockup.
- `do_not`: do not remove existing dashboard routes, do not add mock-state controls, do not fake named shells as issue deployments, do not change unrelated styling or app metadata.

### Board Cards

1. **Scout: Current Boundary Receipt**
   - `role`: `scout`
   - Scope: read-only validation of `packages/web/app`, `packages/web/components`, `packages/web/app/api/v1`, `packages/core/src/db`, and `docs/mockups/workbench.html`.
   - Output receipt: current route/component/API boundaries, reusable components, drift from this plan, and any route signatures that changed.
   - `stop_if`: no tracked repo or API route files can be read.

2. **Judge: Aggregate Contract Approval**
   - `role`: `judge`
   - Input: Scout receipt plus Task 1 contract.
   - Decision: approve or revise `WorkbenchPayload`, fixture contract, and repo rail badge semantics before Worker implementation.

3. **Worker: Task 1 Workbench Aggregate API**
   - `allowed_files`: Task 1 files.
   - `verify`: Task 1 commands.
   - Receipt must include route response JSON sample using the shared fixture.

4. **Worker: Task 2 Route Shell and Production Navigation**
   - `allowed_files`: Task 2 files.
   - `verify`: Task 2 commands.
   - Receipt must include Playwright proof that no prototype controls render.

5. **Worker: Task 3 Repo Rail and Repo Selection**
   - `allowed_files`: Task 3 files.
   - `verify`: Task 3 reducer tests and targeted Playwright repo selection tests.
   - Receipt must include fixture badge values IC `3`, BD `1`, API none, WEB none.

6. **Worker: Task 4 Instance Pane for Issue Sessions**
   - `allowed_files`: Task 4 files.
   - `verify`: Task 4 sorting/unit tests and targeted Playwright instance pane tests.
   - Receipt must include preview error state proof for `#486`.

7. **Worker: Task 5 Terminal Focus**
   - `allowed_files`: Task 5 files.
   - `verify`: targeted Playwright terminal focus tests.
   - Receipt must include terminal frame `/api/terminal/7701` assertion.

8. **Worker: Task 6 Repo Issue Queue Pane**
   - `allowed_files`: Task 6 files.
   - `verify`: grouping tests and targeted Playwright issue queue tests.
   - Receipt must include open/running/closed counts for fixture repo A.

9. **Worker: Task 7 Issue Detail Focus and Mutations**
   - `allowed_files`: Task 7 files.
   - `verify`: targeted issue detail and mutation tests.
   - Receipt must list every endpoint from Task 7's API calls table and whether it was asserted.

10. **Worker: Task 8 Launch Options and Worktree Status**
    - `allowed_files`: Task 8 files.
    - `verify`: targeted launch/worktree tests.
    - Receipt must include exact launch request JSON and duplicate-session behavior.

11. **Worker: Task 9 Global Issues Mode**
    - `allowed_files`: Task 9 files.
    - `verify`: targeted collapsed-layout and global issue navigation tests.
    - Receipt must include side pane hidden assertions.

12. **Worker: Task 10 Cross-Repo Board Mode**
    - `allowed_files`: Task 10 files.
    - `verify`: targeted board tests.
    - Receipt must include four-column board proof and running-only reversible filter proof.

13. **Worker: Task 11 Repo Setup and Settings Mode**
    - `allowed_files`: Task 11 files.
    - `verify`: targeted settings/repo setup tests.
    - Receipt must include add, patch, delete, settings save, health, and user endpoint assertions.

14. **Worker: Task 12 Quick Create Mode**
    - `allowed_files`: Task 12 files.
    - `verify`: targeted quick create/parse tests.
    - Receipt must include parse/create and draft endpoint assertions.

15. **Worker: Task 13 Pull Requests Mode**
    - `allowed_files`: Task 13 files.
    - `verify`: targeted PR tests.
    - Receipt must include list/detail/review/merge/comment endpoint assertions.

16. **Worker: Task 14 Width Adjustability and Collapsible Sections**
    - `allowed_files`: Task 14 files.
    - `verify`: reducer tests and Playwright layout tests at `1440x1000` and `1100x850`.
    - Receipt must include localStorage key and width clamp proof.

17. **Judge: Named Shell Scope Decision**
    - `role`: `judge`
    - Decision: include Task 15 in this goal, defer it to a separate goal, or ship v1 with disabled `New named shell`.
    - Required output: one explicit product decision and any updated acceptance criteria.

18. **Worker 15A: Named Shell Schema/Core** if approved
    - `allowed_files`: core schema, migrations, shell db helpers, core exports, core tests.
    - `verify`: core shell/migration tests.

19. **Worker 15B: Named Shell APIs** if approved
    - `allowed_files`: shell API routes and route tests.
    - `verify`: shell route tests.

20. **Worker 15C: Named Shell ttyd/Preview Integration** if approved
    - `allowed_files`: shell ensure-ttyd route, preview integration, tests.
    - `verify`: preview and ensure-ttyd tests.

21. **Worker 15D: Named Shell UI Wiring** if approved
    - `allowed_files`: workbench instance/repo overview/terminal focus files and e2e tests.
    - `verify`: named shell Playwright tests.

22. **Worker 15E: Named Shell E2E/QA** if approved
    - `allowed_files`: Playwright tests and QA docs.
    - `verify`: named shell e2e plus full Task 15 verification commands.

23. **Worker: Task 16 Responsive Desktop QA and Visual Acceptance**
    - `allowed_files`: Task 16 files.
    - `verify`: Task 16 final verification commands plus the Playwright CLI screenshot pass.
    - Receipt must include screenshot paths, trace paths when applicable, completed Playwright coverage matrix, and `docs/qa/workbench-validation.md`.

24. **Judge: Final Mockup/Acceptance Audit**
    - `role`: `judge`
    - Scope: compare final `/workbench` to `docs/mockups/workbench.html`, the Traceability Matrix, and Objective UI Acceptance Standards.
    - Output: pass/fail decision, residual risks, and whether a follow-up goal is required.

### PR, CI, and Merge Workflow

For this goal, use PR-sized batches rather than one enormous branch. Recommended PR boundaries:

1. `workbench-aggregate-and-shell`: Tasks 1-3.
2. `workbench-sessions-issues-launch`: Tasks 4-8.
3. `workbench-global-modes`: Tasks 9-13.
4. `workbench-layout-qa`: Tasks 14 and 16.
5. `workbench-named-shells`: Task 15 only if approved; otherwise create a follow-up goal.

For each PR batch:

- Create a branch named `workbench/<batch-slug>`.
- After the batch's Worker tasks pass local verification, use `superpowers:requesting-code-review` before opening or updating the PR.
- Open a PR with:
  - link to this plan;
  - tasks completed;
  - tests run;
  - screenshots/QA artifacts for visible UI work;
  - Playwright coverage matrix rows covered by the PR;
  - known deviations from the mockup.
- Monitor CI until all required checks finish.
- If CI is red, create a bounded Worker card for the failing check. The Worker may touch only files implicated by the failure and must return a receipt with the failed check name, root cause, fix, and rerun result.
- Request another review after CI fixes if production code changed.
- Merge only when:
  - local verification listed for the batch passes;
  - CI is green;
  - review findings are resolved or explicitly accepted by Judge;
  - the PR description includes the final test list.
- After merging each PR, sync/rebase the next branch from the mainline before continuing.
- After the final PR, use `superpowers:finishing-a-development-branch` to confirm clean state, final verification, merged PRs, and remaining follow-up tasks.

If Task 15 is deferred, GoalBuddy must record a product decision that `New named shell` is disabled or marked unavailable in the first production `/workbench` release, and the PR description for the final batch must call out that deferral.
