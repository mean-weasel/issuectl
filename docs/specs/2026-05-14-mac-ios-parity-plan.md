# Mac App iOS Parity Plan

Date: 2026-05-14

Status: Draft implementation plan for long-running `/goal` work.

## Goal

Close the practical feature gaps between the mature iOS app and the newer macOS menu-bar/sidebar app while preserving the Mac app's intended shape: a local-first menu-bar client with per-Desktop sidebars, fast issue triage, and efficient keyboard/mouse workflows.

The Mac app does not need to become a literal clone of the iOS tab app. Parity means that a Mac user can complete the same core workflows without falling back to the web app or iOS app.

## Current Baseline

The iOS app already includes:

- Setup/onboarding with server URL, API token, and setup links.
- Full settings hub with server status, repository management, advanced settings, notifications, worktrees, offline queue, and disconnect.
- Today dashboard.
- Issue list with sections, filters, search, sorting, pagination, drafts, and running-session awareness.
- Issue detail with edit, labels, assignees, comments, priority, reassign, close/reopen, launch, linked PR/deployment context, and GitHub links.
- Draft creation, editing, assigning to repos, labels, natural-language parsing, and batch creation.
- Pull request list/detail flows.
- Launch configuration and embedded terminal.
- Active session management.
- Offline action queue and notification settings.

The Mac app currently includes:

- Menu-bar accessory app with per-Desktop sidebar controls.
- Auto-connect to local `issuectl web` token plus manual URL/token fallback.
- Sidebar sections for Issues, Drafts, and Active.
- Issue search, repo filter, Open/Unassigned/All filters, 50-item pagination.
- Issue detail with comment, close/reopen, priority, GitHub link, and one-click launch/open terminal.
- Local draft create/edit/delete.
- Active session list/open/end.
- Settings for connection, launch at login, text size, web settings link, and learned Desktop layout.

## Phase 1: Native Mac Repository Management

Add native repository management to the Mac settings window. This is the highest priority because repo management blocks first-run usefulness and directly affects sidebar filtering.

### Deliverables

- Add a tracked repository list to `MacSettingsView`.
- Show each repo's full name, local path status, local path, and branch pattern.
- Add a Mac repo-add sheet:
  - Manual `owner/name` entry.
  - Browse accessible GitHub repos.
  - Search and refresh GitHub repo browser.
- Add a Mac repo-edit sheet:
  - Edit local clone path.
  - Edit branch pattern.
- Add remove repo with confirmation and error recovery.
- Refresh `MacSidebarStore` after add/edit/remove so sidebar filters and issues update without app relaunch.
- Keep `Open Web Settings` as a fallback link, not the primary repo management path.

### Acceptance Criteria

- A user can add a repo from Mac settings manually with `owner/name`.
- A user can browse accessible GitHub repos, search the list, select one, and add it.
- A user can edit a repo's local clone path and branch pattern.
- A user can remove a repo and confirm removal.
- After add/edit/remove, the Mac sidebar reloads repo filters without relaunch.
- Errors from add/edit/remove are shown inline and do not leave stale optimistic state.

### Required Validation

- Add `IssueCTLMacTests` coverage for repo settings state and add/edit/remove success/failure handling.
- Add or extend `IssueCTLMacUITests` with a mock server flow:
  - Open Mac settings.
  - Add repo.
  - Edit repo local path and branch pattern.
  - Remove repo.
  - Confirm the repo list updates.
- Run:

```bash
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacUITests
```

### Dogfood Checklist

- Start `issuectl web`.
- Launch Mac app.
- Open Settings from status menu.
- Add a repo.
- Confirm the repo appears in sidebar repo filters.
- Edit local path.
- Launch an issue from that repo and confirm worktree mode is used when local path is set.
- Remove the repo and confirm it disappears from filters.

## Phase 2: Mac Settings Hub Parity

Expand Mac settings from sidebar preferences into a real settings hub.

### Deliverables

- Add server status card:
  - Server URL.
  - Current username.
  - Repo count.
  - Server version.
  - Mac app version.
  - Retry health check.
- Add advanced settings UI:
  - Launch agent.
  - Worktree directory.
  - Default branch pattern.
  - Cache TTL.
  - Idle thresholds.
  - Claude extra args.
  - Codex extra args.
- Preserve existing Mac-only settings:
  - Launch at Login.
  - Sidebar text size.
  - Learned Desktop layout.
- Keep Settings window correctly sized and scrollable.

### Acceptance Criteria

- Mac settings shows server health and app/server metadata after connection.
- Advanced settings load from `/api/v1/settings`.
- Editing advanced settings persists through `/api/v1/settings` and survives window close/reopen.
- Existing Mac sidebar settings still work.
- Settings remains usable at minimum window size.

### Required Validation

- Add unit coverage for advanced setting form normalization and save payloads.
- Add UI smoke coverage for settings sections and window sizing.
- Add mock-server integration coverage for loading and saving settings.
- Run Mac build, `IssueCTLMacTests`, and focused `IssueCTLMacUITests` for settings.

## Phase 3: Worktree Management

Bring the iOS worktree cleanup surface to Mac settings.

### Deliverables

- Add a Worktrees settings section/window.
- List active and stale worktrees.
- Show repo, issue number, path, status, and age where available.
- Cleanup individual stale worktrees.
- Cleanup all stale worktrees.
- Surface errors and refresh after cleanup.

### Acceptance Criteria

- User can view worktrees from Mac settings.
- User can clean one stale worktree.
- User can clean all stale worktrees.
- Active worktrees are not accidentally offered as destructive cleanup unless backend marks them safe.
- Cleanup results update without relaunch.

### Required Validation

- Add mock-server UI tests for worktree list and cleanup actions.
- Add unit tests for stale/active rendering decisions.
- Run Mac build, `IssueCTLMacTests`, and worktree-focused `IssueCTLMacUITests`.

## Phase 4: Issue List Parity

Close list-level gaps while keeping the Mac sidebar dense and efficient.

### Deliverables

- Add filters:
  - Mine.
  - Running.
  - Closed.
  - Drafts, if drafts remain cross-linked from issue list.
- Add sort options:
  - Updated.
  - Created.
  - Priority.
- Load current user and issue priorities in `MacSidebarStore`.
- Add filter summary and reset filters.
- Persist search/filter/sort/page state per learned Desktop.

### Acceptance Criteria

- Issue list supports iOS-equivalent filtering for open, closed, unassigned, mine, running, and repo selection.
- Sort by updated, created, and priority produces deterministic ordering.
- Search filters title, body, and repo name.
- Pagination still limits initial render and supports loading more.
- Per-Desktop filters remain independent across Space switches.

### Required Validation

- Add `IssueCTLMacTests` for filter and sort logic.
- Add UI tests for selecting filters, resetting filters, and pagination.
- Add two-Desktop dogfood pass for independent filter state:
  - Desktop 1 set repo/filter/sort A.
  - Desktop 2 set repo/filter/sort B.
  - Switch back and forth and verify state remains independent.

## Phase 5: Issue Detail Action Parity

Expand Mac issue detail beyond comment, close/reopen, priority, GitHub, and launch.

### Deliverables

- Edit issue title/body.
- Close with optional comment.
- Edit own comments.
- Delete own comments.
- Manage labels.
- Manage assignees.
- Reassign issue to another tracked repo.
- Show linked PRs and deployment/session context more completely.
- Keep local sidebar issue state in sync after every action.

### Acceptance Criteria

- Every iOS issue action has a Mac equivalent unless explicitly documented as intentionally omitted.
- Successful actions update detail view and sidebar list without full app relaunch.
- Failed actions show recoverable errors.
- Comment edit/delete is only offered where permitted.
- Reassign updates the source/target repo lists on refresh.

### Required Validation

- Add unit tests for action state transitions where logic is local.
- Add mock-server UI tests for edit, label, assignee, reassign, comment edit/delete, close with comment.
- Run Mac build, `IssueCTLMacTests`, and detail-action `IssueCTLMacUITests`.

## Phase 6: Draft And Creation Workflows

Bring Mac drafts from local-only draft editing to full issue creation.

### Deliverables

- Add assign draft to repo.
- Add repo selection and label selection during assignment.
- Add quick issue creation from Mac sidebar.
- Add natural-language parse/batch create only if it fits a Mac window workflow; otherwise create a separate full-size Mac creation window.
- Refresh issues/drafts after assignment or creation.

### Acceptance Criteria

- User can create a local draft.
- User can edit a local draft.
- User can assign a draft to a tracked repo.
- User can select labels when assigning where backend data is available.
- Created issues appear in the sidebar after refresh.
- Draft disappears or updates according to backend behavior.

### Required Validation

- Add unit coverage for draft assignment state.
- Add mock-server UI tests for create/edit/delete/assign draft.
- Add integration dogfood:
  - Create draft.
  - Assign to repo.
  - Confirm issue appears under selected repo.

## Phase 7: Pull Request Support

Add the largest missing product surface: PR browsing and detail.

### Deliverables

- Add `PRs` section to the Mac sidebar.
- Add PR list:
  - Repo filter.
  - Search.
  - Review-needed/status filters.
  - Pagination.
- Add PR detail:
  - Title/body/metadata.
  - Comments.
  - Checks.
  - Files changed.
  - Open on GitHub.
- Add review/comment/request-changes actions if shared APIs support them; otherwise document backend/API gaps.

### Acceptance Criteria

- User can browse PRs from tracked repos in the Mac app.
- User can filter/search PRs.
- User can open PR detail.
- User can inspect checks and changed files.
- PR list/detail refresh without app relaunch.

### Required Validation

- Add Mac store tests for PR loading and filtering.
- Add UI tests with mock PR data.
- Add dogfood against a repo with open PRs.

## Phase 8: Launch And Terminal Parity

Keep the Mac one-click launch path but add iOS-equivalent launch controls.

### Deliverables

- Add launch options sheet:
  - Agent.
  - Workspace mode.
  - Branch name.
  - Selected comments.
  - Selected files.
  - Preamble.
  - Resume/reset behavior.
- Add existing-session detection before launch.
- Add embedded terminal window option in addition to opening browser terminal URL.
- Add terminal controls:
  - Text size.
  - Respawn `ttyd`.
  - End session.

### Acceptance Criteria

- One-click launch still works with defaults.
- User can choose launch agent and workspace mode.
- User can customize branch and preamble.
- Existing session opens instead of launching duplicate work.
- Embedded terminal can open, resize, and end session.
- Active section updates when a session starts or ends.

### Required Validation

- Add unit tests for launch request construction.
- Add UI tests for launch options sheet.
- Add integration dogfood:
  - Launch with clone mode.
  - Launch with worktree mode.
  - Open terminal.
  - End session.
  - Relaunch/open existing session.

## Phase 9: Offline And Reliability Parity

Mac currently benefits from shared cache indirectly. Add user-visible offline behavior and queued actions.

### Deliverables

- Add network status banner.
- Add cached-data indicators.
- Add offline queue for supported actions:
  - Add comment.
  - Close/reopen issue.
  - Potentially priority changes if backend replay is safe.
- Add offline queue settings view:
  - Pending actions.
  - Failed actions.
  - Retry.
  - Clear failed.
  - Remove individual action.
- Auto-sync when network returns.

### Acceptance Criteria

- User can see when Mac is offline.
- Supported actions queue instead of failing hard when offline.
- Queued actions replay in FIFO order when server/network returns.
- Failed queued actions are visible and recoverable.
- Cache indicators distinguish cached from fresh data.

### Required Validation

- Add unit tests for queue persistence and replay ordering.
- Add mock network/server outage tests.
- Add UI tests for offline queue view.
- Dogfood:
  - Stop server.
  - Add comment or close issue.
  - Restart server.
  - Confirm queued action syncs.

## Phase 10: Notifications

Decide whether Mac should support notification registration or explicitly remain iOS-only.

### Deliverables

- Add notification settings if Mac notifications are in scope:
  - Authorization status.
  - Enable notifications.
  - Idle terminal notifications.
  - New issue notifications.
  - Merged PR notifications.
- Register/unregister Mac device with backend if supported.
- If not in scope, add clear Mac settings copy explaining notifications are iOS-only.

### Acceptance Criteria

- Notification preferences persist.
- Device registration succeeds where supported.
- Disabling notifications unregisters or disables delivery.
- Unsupported Mac notification states are clearly explained.

### Required Validation

- Add unit tests for preference persistence.
- Add mock-server tests for register/unregister where enabled.
- Manual validation for macOS notification permission prompts if implemented.

## Phase 11: Today Dashboard

Decide whether the Mac app needs a full Today surface or a Mac-native compact equivalent.

### Deliverables

- Add a compact Today/Attention section or window with:
  - Assigned issues.
  - Review-needed PRs.
  - Active sessions.
  - Quick navigation to Issues, PRs, Active.
- Reuse iOS Today logic where possible.
- Keep it optional if sidebar complexity grows too much.

### Acceptance Criteria

- User can see immediate work queue from Mac without opening iOS/web.
- Counts match iOS Today for the same backend data.
- Rows navigate to the correct Mac detail surfaces.

### Required Validation

- Add tests for Today item selection logic.
- Add UI tests with mock issue/PR/session data.
- Dogfood against a repo with assigned issues, PRs, and active sessions.

## Cross-Cutting Requirements

### UX Requirements

- Keep Mac UI dense and scannable.
- Prefer native macOS controls: forms, split/sidebar windows, toolbar buttons, menus, and keyboard shortcuts.
- Preserve the sidebar's fast path:
  - One-click refresh.
  - One-click launch.
  - Quick collapse/expand.
  - Per-Desktop state.
- Do not force web settings for core Mac workflows after Phase 1.

### State Requirements

- Per-Desktop state remains independent for:
  - Sidebar visibility.
  - Collapse state.
  - Selected section.
  - Repo filters.
  - Issue filters.
  - Search and pagination state where useful.
- Shared settings remain global:
  - Server credentials.
  - Launch defaults.
  - Repo list.
  - Worktree settings.

### Testing Requirements

Every phase should include:

- Unit tests for local logic.
- Mock-server UI/integration tests for user-visible flows.
- Direct dogfood notes in the PR.
- Validation commands in the PR description or PR comment.

Minimum validation before merging any phase:

```bash
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests
pnpm typecheck
pnpm lint
```

UI validation should be added whenever the phase changes user-visible macOS behavior:

```bash
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacUITests
```

If a UI test is unstable because of menu-bar/accessory app automation, record the failure mode and replace it with a deterministic runtime verification script plus a narrower UI test where feasible.

## Suggested Execution Order

1. Native Mac repository management.
2. Mac settings hub and advanced settings.
3. Worktree management.
4. Issue list filters and sorting.
5. Issue detail actions.
6. Draft assignment and issue creation.
7. Pull request support.
8. Launch customization and embedded terminal.
9. Offline queue and reliability UX.
10. Notifications decision/implementation.
11. Today dashboard or compact attention view.

## Definition Of Done For Full Parity

- A Mac user can configure the app, add repos, manage repo paths, browse issues and PRs, perform core issue/PR actions, create/assign drafts, launch/end sessions, and manage worktrees without opening iOS or the web UI.
- Mac-specific per-Desktop sidebar behavior remains stable after the parity work.
- Each completed phase has automated tests or a documented reason why automation is not reliable, plus manual dogfood evidence.
- The Mac app can be dogfooded for a full work session: add repo, filter issue list, inspect issue, edit/comment/label/assign, launch agent, open terminal, end session, and clean up worktree.
