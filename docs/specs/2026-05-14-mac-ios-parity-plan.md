# Mac App iOS Parity Plan

Date: 2026-05-14

Status: Audit-backed implementation plan for long-running `/goal` work.

## Goal

Close the practical feature gaps between the mature iOS app and the newer macOS menu-bar/sidebar app while preserving the Mac app's intended shape: a local-first menu-bar client with per-Desktop sidebars, fast issue triage, and efficient keyboard/mouse workflows.

The Mac app does not need to become a literal clone of the iOS tab app. Parity means that a Mac user can complete the same core workflows without falling back to the web app or iOS app.

## Audited Sources

This plan was checked against three independent audits:

- iOS app feature surface under `apple/IssueCTL` and `apple/IssueCTLShared`.
- Mac app feature surface under `apple/IssueCTLMac` and shared services.
- Existing plan quality, with emphasis on missing discrepancies and weak acceptance criteria.

Primary source files:

- `apple/IssueCTL/App/ContentView.swift`
- `apple/IssueCTL/Views/Onboarding/OnboardingView.swift`
- `apple/IssueCTL/Views/Today/TodayView.swift`
- `apple/IssueCTL/Views/Issues/IssueListView.swift`
- `apple/IssueCTL/Views/Issues/IssueDetailView.swift`
- `apple/IssueCTL/Views/Issues/QuickCreateSheet.swift`
- `apple/IssueCTL/Views/Issues/ParseView.swift`
- `apple/IssueCTL/Views/Issues/DraftDetailView.swift`
- `apple/IssueCTL/Views/Launch/LaunchView.swift`
- `apple/IssueCTL/Views/Terminal/TerminalView.swift`
- `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- `apple/IssueCTL/Views/PullRequests/PRListView.swift`
- `apple/IssueCTL/Views/PullRequests/PRDetailView.swift`
- `apple/IssueCTL/Views/Settings/SettingsView.swift`
- `apple/IssueCTL/Views/Settings/AdvancedSettingsView.swift`
- `apple/IssueCTL/Views/Settings/NotificationSettingsView.swift`
- `apple/IssueCTL/Views/Settings/OfflineQueueView.swift`
- `apple/IssueCTL/Views/Settings/WorktreeListView.swift`
- `apple/IssueCTLMac/App/IssueCTLMacApp.swift`
- `apple/IssueCTLMac/Views/MacSidebarRootView.swift`
- `apple/IssueCTLMac/Views/MacIssuesView.swift`
- `apple/IssueCTLMac/Views/MacIssueDetailView.swift`
- `apple/IssueCTLMac/Views/MacDraftsView.swift`
- `apple/IssueCTLMac/Views/MacSessionsView.swift`
- `apple/IssueCTLMac/Views/MacSettingsView.swift`
- `apple/IssueCTLMac/Views/MacSidebarStore.swift`
- `apple/IssueCTLMac/Views/MacIssueFilterState.swift`
- `apple/IssueCTLMac/Platform/DisplaySidebarCoordinator.swift`
- `apple/IssueCTLMac/Platform/MacSidebarPreferences.swift`
- `apple/IssueCTLMac/Platform/LocalIssueCTLConnection.swift`
- `apple/IssueCTLShared/Services/APIClient.swift`
- `apple/IssueCTLShared/Services/APIClient+Settings.swift`
- `apple/IssueCTLShared/Services/APIClient+AdvancedSettings.swift`
- `apple/IssueCTLShared/Services/APIClient+Drafts.swift`
- `apple/IssueCTLShared/Services/APIClient+DetailActions.swift`
- `apple/IssueCTLShared/Services/APIClient+Assignment.swift`
- `apple/IssueCTLShared/Services/APIClient+ListEnhancements.swift`
- `apple/IssueCTLShared/Services/APIClient+ImageUpload.swift`
- `apple/IssueCTLShared/Services/OfflineCacheStore.swift`
- `apple/IssueCTL/Services/OfflineSyncService.swift`
- `apple/IssueCTL/Services/NotificationSettingsStore.swift`

## Current Baseline

The iOS app includes:

- Config-gated onboarding with server URL, masked API token, health check, localhost guidance, help copy, and setup-link handling.
- Four-tab app navigation: Today, Issues, PRs, and Active sessions.
- Global settings sheet and global offline queue banners.
- Today dashboard with assigned/blocking issues, review PRs, active sessions, metrics, global search, settings, active-session shortcut, and create issue entry point.
- Issue list sections for open, running, unassigned, closed, and drafts, with counts, search, repo filters, sort, mine-only filter, clear filters, pull-to-refresh, cache age, and offline cached-data banners.
- Issue list row actions for launch/open terminal, close, reopen, and draft deletion.
- Issue detail with title, state, priority, author/time, labels, assignees, markdown body, comments, linked PRs, sessions/deployments, GitHub links, and cached/offline behavior.
- Issue detail actions for comment, edit issue, manage labels, manage assignees, set priority, reassign repo, close/reopen, edit own comments, and delete own comments.
- Quick create with destination repo or local draft, title/body, labels, image attachment, and priority.
- Draft detail editing, draft assignment to repo with label selection, and discard confirmation.
- AI parse and batch creation from free text.
- Launch sheet with ready checks, existing-session handling, fresh-clone warning, dirty-worktree warning, workspace mode, agent, branch, comments/files context, preamble, reset/resume choices, and progress UI.
- Terminal view with tokenized ttyd URL, reconnect/respawn retry, text-size controls, session duration, and end session.
- Active session list with search, repo filters, refresh, cached/offline banner, terminal status preview, open terminal, view issue, end session, and periodic polling.
- PR list with review/open/merged/closed sections, search, repo filters, sort, mine-only filter, clear filters, create issue shortcut, cached/offline state, and merge swipe actions for squash/merge/rebase.
- PR detail with title/state/author, branches, diff stats, markdown body, review status, checks, changed files, linked issue, reviews, merge/open GitHub actions, approve, request changes, and comment.
- Settings hub with server status, repo management, advanced settings, notifications, worktrees, offline queue, and disconnect.
- Offline queue for issue comments and issue state changes.
- Push notification preferences and push device registration.
- Shared offline cache fallback for repos, issues, issue detail, PR list, and PR detail.

The Mac app currently includes:

- Menu-bar accessory app with a status menu, settings scene, and no regular app window by default.
- Per-Desktop sidebar controls: show/hide, expand/collapse, reset layout, selected section, repo filters, issue filter, visibility, width, collapse state, and text scale.
- Auto-connect to local `issuectl web` by reading the local database token, with manual URL/token fallback.
- Sidebar sections for Issues, Drafts, and Active.
- Issue list across tracked repos, title/body/repo search, repo checkbox filtering, Open/Unassigned/All filters, updated-date sort, 50-item pagination, issue metadata, and running-session indicator.
- Issue detail with title, state, priority, author, labels, assignees, body, comments, refresh, GitHub link, close/reopen, set priority, add comment, launch, and open session.
- Draft list with local create/edit/delete and title/body/priority editor.
- Active session list with branch, runtime, workspace path, terminal readiness, open, and end actions.
- Settings for connection status, launch at login, sidebar text scale, web settings link, and learned Desktop controls.

## Complete Feature Discrepancy Matrix

| Area | iOS capability | Mac current state | Required parity decision |
| --- | --- | --- | --- |
| App shell | Four tabs: Today, Issues, PRs, Active | Sidebar sections: Issues, Drafts, Active | Add Mac-native Today/PR surfaces without abandoning sidebar model |
| Setup | Onboarding, health check, setup links | Auto-local connect plus manual fallback in sidebar | Keep auto-connect; add explicit reconnect/disconnect/setup controls |
| Global offline | Root offline queue banners | Request errors only | Add visible offline/cached state and queue controls |
| Today | Work queue, metrics, search, create issue | Missing | Add compact Today/Attention section or window |
| Issue sections | Open, Running, Unassigned, Closed, Drafts | Open, Unassigned, All; drafts separate | Match iOS section semantics, including Open excluding Running |
| Issue filters | Search, repos, mine-only, sort, clear | Search, repos, state only, fixed updated sort | Add mine, sort, reset, counts, persisted per-Desktop state |
| Issue cached state | Cache age/offline banners | Missing | Surface `fromCache` and `cachedAt` for lists/details |
| Issue row actions | Launch/open terminal, close/reopen, delete draft | Launch/detail actions only | Add equivalent contextual controls where Mac-appropriate |
| Issue detail rendering | Markdown body/comments, image lightbox | Plain body/comment text | Add shared markdown/image presentation |
| Issue detail actions | Edit issue, labels, assignees, reassign, close with comment, edit/delete comments | Comment, close/reopen, priority, GitHub, launch | Add explicit action parity checklist |
| Linked context | Linked PRs and deployments | Limited active-session context | Show linked PRs, deployments, sessions |
| Quick create | Repo or draft destination, labels, image, priority | Local draft creation only | Add direct issue creation and assignment flow |
| Draft detail | Edit, autosave/save, discard confirmation, assign labels/repo | Basic local edit/delete | Add assignment, labels, failure recovery, navigation |
| AI parse | Free text parse, review, assign, batch create | Missing | Add Mac flow or document intentional omission |
| Launch | Options, ready checks, dirty worktree, reset/resume, progress | One-click launch heuristic | Add launch options and readiness handling |
| Terminal | In-app terminal, reconnect, respawn, text size, end | Opens terminal URL externally | Add embedded terminal window or explicitly scoped alternative |
| Sessions | Search, repo filter, cached state, previews, controls, polling | Basic active list/open/end | Add session filtering, previews, view issue, polling |
| PR list | Review/open/merged/closed, filters, merge swipe | Missing | Add PR section/list |
| PR detail | Checks, files, linked issue, reviews, merge/review/comment | Missing | Add PR detail and actions supported by shared APIs |
| Repository settings | Add manual, browse/search, edit path/pattern, remove | Web settings link only | Add native Mac repo management |
| Server settings | Status card, user, versions, retry, disconnect | Basic connection status, disconnect in sidebar | Add settings hub parity |
| Advanced settings | Cache TTL, agents, args, idle thresholds, branch/worktree/default repo | Missing | Add editable advanced settings |
| Worktrees | Active/stale list, cleanup one/all | Missing | Add worktree management |
| Offline queue | Pending/failed metrics, sync, retry, clear, remove, details | Missing | Share or port queue service to Mac |
| Notifications | Permission, preferences, register/unregister iOS device | Missing; iOS store is UIKit/platform `ios` | Add decision gate for macOS support vs explicit iOS-only copy |
| Shared auth/cache | Keychain config, environment override, offline cache fallback | Uses shared config plus local token auto-connect | Preserve behavior and test local auto-connect |
| Mac-specific state | Not applicable | Per-Desktop sidebars and filters | Preserve and extend per-Desktop state through parity work |

## Acceptance Criteria Standard

Every phase must include:

- Unit tests for local state, reducers, formatters, request builders, and persistence.
- Mock-server UI or integration tests for user-visible workflows.
- HTTP assertions for method, path, request body, and response handling whenever the phase calls backend APIs.
- Empty, loading, success, stale cache, and recoverable error states.
- Accessibility identifiers for new Mac controls used by UI tests.
- Detail/list consistency assertions after mutations.
- Cache invalidation or refresh assertions after add/edit/remove/action flows.
- Dogfood notes in the PR for workflows that depend on macOS status items, Spaces, notifications, or terminal windows.

Minimum validation before merging any phase:

```bash
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests
pnpm typecheck
pnpm lint
```

Run UI validation whenever the phase changes visible macOS behavior:

```bash
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacUITests
```

If a UI test is unstable because of menu-bar/accessory app automation, record the failure mode and replace it with a deterministic runtime verification script plus a narrower UI test where feasible.

## Phase 1: Native Mac Repository Management

Add native repository management to Mac settings. This is the highest priority because repo management blocks first-run usefulness and directly affects sidebar filtering.

### Deliverables

- Add a tracked repository list to `MacSettingsView`.
- Show each repo's full name, local path status, local path, branch pattern, and default-repo indicator if available.
- Add a Mac repo-add sheet with manual `owner/name`, accessible GitHub repo browser, search, refresh, and validation.
- Add a Mac repo-edit sheet for local clone path and branch pattern.
- Add remove repo with confirmation, progress state, and error recovery.
- Refresh Mac settings, `MacSidebarStore`, issue repo filters, draft assignment repo pickers, and PR repo filters after add/edit/remove.
- Keep `Open Web Settings` as a fallback link, not the primary repo management path.

### Acceptance Criteria

- Manual add sends the expected add-repo request, rejects malformed names locally, and shows backend errors inline.
- Browse add loads accessible repos, supports search and refresh, disables already-tracked repos, and adds the selected repo.
- Edit persists local clone path and branch pattern, then displays the saved values after closing and reopening settings.
- Remove requires confirmation, sends the expected remove request, removes the repo from settings and sidebar filters, and recovers cleanly if the backend rejects removal.
- Sidebar issue filters update without app relaunch after add/edit/remove.
- If a removed repo was selected in a per-Desktop filter, that Desktop state drops the missing repo key and keeps other selections intact.
- Empty, loading, unauthorized, and network-error states are visible.

### Required Validation

- `IssueCTLMacTests`: repo settings state, request payload normalization, stale filter cleanup, and add/edit/remove success/failure handling.
- `IssueCTLMacUITests`: mock-server flow to open settings, add manually, add from browser, edit path/pattern, remove, and confirm repo list/filter updates.
- Mock-server assertions for `/api/v1/settings/repos`, accessible GitHub repo browsing, add, update, and remove endpoints.
- Dogfood: start `issuectl web`, launch Mac app, add a repo, confirm it appears in sidebar filters, edit local path, launch an issue with worktree mode, remove repo, confirm filters update.

## Phase 2: Connection And Mac Settings Hub Parity

Expand Mac settings from sidebar preferences into a real settings hub while preserving local auto-connect.

### Deliverables

- Add server status card: server URL, current username, repo count, server version, Mac app version, and retry health check.
- Add explicit connection controls: disconnect, reconnect, manual URL/token edit, and clear credentials.
- Preserve auto-connect from the local `issuectl web` database token when running on the same machine as the web server.
- Add advanced settings UI for launch agent, worktree directory, default branch pattern, default repository, cache TTL, idle thresholds, Claude extra args, and Codex extra args.
- Preserve existing Mac-only settings: Launch at Login, sidebar text size, learned Desktop layout, per-Desktop reset controls.
- Keep settings correctly sized, scrollable, and usable at minimum window size.

### Acceptance Criteria

- Settings shows health and metadata after connection and a useful recoverable error when health check fails.
- Disconnect clears the active API config, clears Mac store state, and leaves auto-connect available for the next launch or reconnect.
- Manual URL/token edit persists credentials and re-runs health check.
- Auto-connect wins when a valid local token is present and manual fallback remains available when local token discovery fails.
- Advanced settings load from `/api/v1/settings`, save via `/api/v1/settings`, survive window close/reopen, and preserve unknown settings keys where applicable.
- Existing Mac sidebar settings still work after adding settings sections.
- Settings remains usable at the configured minimum size.

### Required Validation

- `IssueCTLMacTests`: connection state transitions, local-token preference, credential clearing, advanced settings payloads, and unknown-key preservation.
- `IssueCTLMacUITests`: settings window sizing, health retry, disconnect/reconnect, manual URL/token save, text size persistence.
- Mock-server assertions for health and settings GET/PUT.
- Dogfood: stop/start `issuectl web`, verify auto-connect, disconnect, reconnect, and manual fallback.

## Phase 3: Worktree Management

Bring the iOS worktree cleanup surface to Mac settings.

### Deliverables

- Add a Worktrees settings section or window.
- List active and stale worktrees.
- Show repo, issue number, path, status, age, and cleanup eligibility where available.
- Cleanup individual stale worktrees.
- Cleanup all stale worktrees.
- Surface errors and refresh after cleanup.

### Acceptance Criteria

- User can view active and stale worktrees from Mac settings.
- User can clean one stale worktree and the row disappears or changes status after refresh.
- User can clean all stale worktrees and the stale count reaches zero when backend succeeds.
- Active worktrees are not offered as destructive cleanup unless backend marks them safe.
- Cleanup failures leave the list intact and show a recoverable error.

### Required Validation

- `IssueCTLMacTests`: stale/active rendering decisions and cleanup eligibility.
- `IssueCTLMacUITests`: mock-server list, cleanup one, cleanup all, failure recovery.
- Mock-server assertions for list, cleanup one, and cleanup stale endpoints.
- Dogfood: create or identify stale worktree, clean it from Mac settings, verify filesystem/backend state.

## Phase 4: Issue List Parity

Close list-level gaps while keeping the Mac sidebar dense and efficient.

### Deliverables

- Add iOS-equivalent sections: Open, Running, Unassigned, Closed, and Drafts if drafts remain cross-linked from issue list.
- Match iOS semantics: Open excludes issues with active sessions; Running includes only active open issues.
- Add filters: Mine, repo selection, search, clear filters/reset.
- Add sort options: Updated, Created, Priority.
- Load current user and issue priorities in `MacSidebarStore`.
- Add section counts and filter summary.
- Persist selected section, repo filters, issue filter, mine filter, sort, and search per learned Desktop.
- Decide whether pagination count persists per Desktop or intentionally resets on section/filter changes; document and test the chosen behavior.

### Acceptance Criteria

- Section counts match iOS for the same mocked issue/session/draft data.
- Open excludes active-session issues; Running includes active open issues; Closed includes closed issues; Unassigned includes open issues without assignees; Drafts includes local drafts where exposed.
- Search filters title, body, repo name, and draft title/body when Drafts is selected.
- Mine filter uses current user identity and handles missing current-user data with a visible disabled or error state.
- Sort by updated, created, and priority is deterministic. Tie-breakers are documented and tested.
- Reset filters clears search, mine, repo filters, sort, and issue filter to defaults for the active Desktop.
- Pagination limits initial render, supports loading more, and resets or persists according to the documented rule.
- Per-Desktop issue state remains independent across Space switches, including section, filters, search, sort, and selected repos.
- If tracked repos change, stale per-Desktop repo selections are pruned.

### Required Validation

- `IssueCTLMacTests`: section semantics, mine filter, search, sort tie-breakers, pagination behavior, per-Desktop persistence, stale repo pruning.
- `IssueCTLMacUITests`: select sections/filters/sorts, reset filters, load more, switch two Desktops, confirm independent state.
- Mock-server assertions for current user, repo, issue, draft, and session fixture loading.
- Dogfood: two Desktop pass with Desktop 1 showing repo/filter/sort A and Desktop 2 showing repo/filter/sort B.

## Phase 5: Issue Detail Action Parity

Expand Mac issue detail beyond comment, close/reopen, priority, GitHub, and launch.

### Deliverables

- Render markdown body and comments using shared markdown/image presentation where feasible.
- Add image lightbox support for rendered image links.
- Edit issue title/body.
- Close with optional comment.
- Edit own comments.
- Delete own comments.
- Manage labels.
- Manage assignees.
- Reassign issue to another tracked repo.
- Show linked PRs, deployments, and sessions.
- Keep local sidebar issue state in sync after every action.

### Explicit Action Parity Checklist

| Action | Mac requirement | Acceptance target |
| --- | --- | --- |
| Add comment | Already present; add offline/cached behavior later | Detail comments refresh and list metadata updates |
| Edit issue | Add sheet/editor | Title/body update in detail and list without relaunch |
| Close/reopen | Already present; add close-with-comment | State updates in detail, section counts, and list placement |
| Priority | Already present | Optimistic update rolls back on failure |
| Labels | Add management sheet | Available labels load, selected labels persist, list chips refresh |
| Assignees | Add management sheet | Available users load, selected assignees persist, mine/unassigned filters refresh |
| Reassign | Add repo picker | Source/target repo lists refresh and detail navigates to new issue identity if changed |
| Edit own comment | Add permission-gated action | Only own editable comments expose edit; updated comment renders |
| Delete own comment | Add permission-gated destructive action | Only own deletable comments expose delete; row disappears after success |
| GitHub link | Already present | Link remains available after refactor |
| Linked PRs/deployments | Add sections | Rows navigate to PR/session where Mac surface exists |

### Acceptance Criteria

- Every row in the action checklist is implemented or explicitly marked intentionally omitted with rationale.
- Successful mutations update detail view, sidebar row, counts, filters, and cached state without full app relaunch.
- Failed actions show recoverable errors and preserve unsaved user input.
- Permission-gated actions are hidden or disabled when not allowed.
- Markdown rendering supports links, code blocks, images, and fallback plain text on parse failure.
- Reassign updates source and target repo lists on refresh.

### Required Validation

- `IssueCTLMacTests`: action state transitions, permission gating, optimistic rollback, markdown fallback, linked context mapping.
- `IssueCTLMacUITests`: edit issue, close with comment, label/assignee changes, reassign, edit/delete own comment, linked PR/session navigation.
- Mock-server assertions for exact HTTP methods, paths, payloads, cache invalidation, and refetch behavior.
- Dogfood: edit/comment/label/assign/reassign/close/reopen one real issue and verify sidebar state after each step.

## Phase 6: Draft, Quick Create, Image Attachment, And Parse Workflows

Bring Mac drafts from local-only editing to full issue creation.

### Deliverables

- Keep local draft create/edit/delete.
- Add assign existing draft to tracked repo.
- Add repo selection and label selection during assignment.
- Add quick issue creation from the Mac sidebar and Today surface.
- Add image attachment upload in creation and comment flows.
- Add AI parse/batch create if it fits a Mac workflow; otherwise document an intentional omission with backend/API and UX rationale.
- Preserve draft input on failure.
- Refresh issues/drafts after assignment or creation and navigate to the created issue where possible.

### Acceptance Criteria

- User can assign an existing draft to a tracked repo and select labels loaded for that repo.
- User can create an issue directly without first visiting the Drafts section.
- Created issues appear in the sidebar under the selected repo and the created issue opens or is visibly selected.
- Draft disappears or updates according to backend behavior after successful assignment.
- Assignment or creation failure preserves title/body/priority/labels/image markdown.
- Image attachment uploads via the shared image upload API, inserts markdown into the editor, shows upload progress, and handles invalid image or upload failure.
- Parse/batch create is either implemented with review/accept/reject/repo assignment/result summary, or explicitly documented as deferred with an issue link.

### Required Validation

- `IssueCTLMacTests`: draft assignment state, quick-create request construction, label selection, image markdown insertion, parse decision state.
- `IssueCTLMacUITests`: create/edit/delete draft, assign draft, direct quick create, attach image, failure preserves input.
- Mock-server assertions for draft create/update/delete/assign, issue creation, labels, image upload, parse, and batch create endpoints where implemented.
- Dogfood: create draft, attach image, assign to repo, confirm issue appears under selected repo.

## Phase 7: Pull Request Browse, Detail, And Actions

Add the largest missing product surface: PR browsing, detail, and actions. Shared APIs already support PR list/detail, merge, review, and comments.

### Deliverables

- Add `PRs` section to the Mac sidebar or a Mac-native PR window reachable from the sidebar.
- Add PR list sections: Review, Open, Merged, Closed.
- Add PR repo filter, search, mine filter, sort by Updated/Created, filter summary, reset filters, section counts, pagination, and cached/offline indicators.
- Add PR detail with title/body/metadata, author, branch head/base, diff stats, linked issue, comments, checks, changed files, and reviews.
- Add PR actions: open on GitHub, merge with squash/merge/rebase, approve, request changes, and comment.
- Add navigation from linked issue to issue detail and from issue linked context back to PR detail.

### Acceptance Criteria

- User can browse PRs from tracked repos and section counts match iOS for the same mocked data.
- Review section contains PRs needing user attention according to the same rules as iOS.
- Search, repo filter, mine filter, sort, reset, pagination, and cached/fresh state behave deterministically.
- User can open PR detail and inspect checks, changed files, linked issue, reviews, and comments.
- Merge strategies send the expected strategy and update list/detail state.
- Approve, request changes, and comment actions send expected payloads and refresh review/comment state.
- Failed PR actions show recoverable errors and preserve typed review/comment text.

### Required Validation

- `IssueCTLMacTests`: PR section semantics, filters, sort, merge/review request construction, linked issue mapping.
- `IssueCTLMacUITests`: PR list filters, detail navigation, checks/files/reviews display, comment, approve, request changes, merge.
- Mock-server assertions for PR list/detail, checks/files/reviews, merge, review, and comment endpoints.
- Dogfood: use a repo with open PRs, inspect a PR, comment or approve a test PR, and verify GitHub state.

## Phase 8: Launch, Terminal, And Session Parity

Keep the Mac one-click launch path but add iOS-equivalent launch controls and richer session management.

### Deliverables

- Add launch options sheet: agent, workspace mode, branch name, selected comments, selected files, preamble, resume/reset behavior.
- Add readiness checks: local path known, fresh clone warning, existing session detection, dirty worktree detection.
- Add dirty-worktree choices: discard/start fresh or resume with changes.
- Add launch progress state and failure recovery.
- Add embedded terminal window option in addition to opening browser terminal URL.
- Add terminal controls: text size, reconnect, respawn `ttyd`, session duration, end session.
- Expand Active sessions with search, repo filter, cached/offline banner, terminal status preview, view issue, open terminal, end session, and polling.

### Acceptance Criteria

- One-click launch still works with defaults.
- User can choose launch agent, workspace mode, branch, comments/files context, and preamble.
- Existing session opens instead of launching duplicate work unless the user explicitly chooses a new/reset flow.
- Dirty worktree state is detected and the chosen reset/resume behavior is reflected in the launch request.
- Unknown local path or unavailable worktree mode falls back with visible explanation.
- Embedded terminal opens, resizes, reconnects/respawns, changes text size, shows duration, and can end session.
- Active section updates when sessions start/end and while terminal readiness changes.
- Session search and repo filters produce the same results as iOS for the same data.

### Required Validation

- `IssueCTLMacTests`: launch request construction, readiness decision matrix, dirty-worktree choices, terminal URL/token handling, session filters.
- `IssueCTLMacUITests`: launch options sheet, existing-session path, embedded terminal open/end controls, session filters.
- Mock-server assertions for launch, deployment, ttyd ensure/respawn, end session, worktree status.
- Dogfood: launch clone mode, launch worktree mode, open embedded terminal, respawn terminal, end session, relaunch/open existing session.

## Phase 9: Offline, Cache, And Reliability Parity

Mac currently benefits from shared cache indirectly but does not expose iOS offline behavior. Make offline state visible and queue safe actions.

### Deliverables

- Move or share `OfflineSyncService` so Mac can use the same queue behavior, or create a Mac-specific wrapper over `OfflineActionQueueStore`.
- Add network status banner and cached-data indicators.
- Display cache age for repos, issue list, issue detail, PR list, PR detail, and sessions where backend/cache data supports it.
- Add offline queue for supported actions:
  - Add issue comment.
  - Close/reopen issue.
  - Potentially priority changes only if backend replay is safe and idempotent enough.
- Add offline queue settings view: pending actions, failed actions, sync, retry failed, clear failed, remove individual action, action detail.
- Auto-sync when network/server returns.

### Acceptance Criteria

- User can see when Mac is offline or showing cached data.
- Supported actions queue instead of failing hard when offline.
- Queueable operation set is explicitly listed in UI/help text or implementation docs.
- Queued actions replay in FIFO order when server/network returns.
- Failed queued actions are visible, retryable, removable, and preserve error details.
- Cache indicators distinguish cached from fresh data with age.
- Non-queueable actions fail with clear copy and do not enter the queue.

### Required Validation

- `IssueCTLMacTests`: queue persistence, replay ordering, failure state, non-queueable rejection, cache age formatting.
- `IssueCTLMacUITests`: offline banner, queue view, retry/clear/remove actions, cached indicators.
- Mock outage tests: stop mock server, queue comment/close, restart server, assert replay order and final issue state.
- Dogfood: stop `issuectl web`, perform queueable action, restart web server, confirm action syncs.

## Phase 10: Notifications Decision Gate

Decide whether Mac should support notification registration or explicitly remain iOS-only. This is a platform decision, not just a UI task: current notification code is iOS-specific and registers platform `ios`.

### Deliverables

- Document one selected path:
  - Implement macOS notifications.
  - Keep notifications iOS-only with clear Mac settings copy.
  - Defer notifications with a linked backend/platform issue.
- If implementing:
  - Add macOS notification entitlement and permission flow.
  - Extract shared notification preference logic out of UIKit-only code.
  - Register/unregister Mac device with backend using an explicit platform.
  - Add settings for idle terminals, new issues, and merged PRs.
- If iOS-only:
  - Add Mac settings copy explaining notification availability and no-op state.

### Acceptance Criteria

- The chosen path is documented in this file or a linked issue before implementation begins.
- If implemented, notification preferences persist and survive settings reopen.
- If implemented, permission prompts, authorization denied state, register, unregister, and backend failure states are visible and tested.
- If implemented, backend stores a Mac platform/device registration distinct from iOS.
- If iOS-only, Mac settings clearly states notifications are unavailable on Mac and exposes no broken toggles.

### Required Validation

- `IssueCTLMacTests`: preference persistence or iOS-only decision rendering.
- `IssueCTLMacUITests`: notification settings surface for selected path.
- Mock-server tests for register/unregister if enabled.
- Manual macOS notification permission validation if implemented.

## Phase 11: Today Dashboard / Attention Surface

Decide whether the Mac app needs a full Today surface or a Mac-native compact equivalent.

### Deliverables

- Add compact Today/Attention section or window with assigned/blocking issues, review-needed PRs, active sessions, metrics, and quick navigation.
- Add global search across Today issues and PRs.
- Add quick create entry point.
- Surface offline/cached state.
- Reuse iOS Today logic where possible.

### Acceptance Criteria

- User can see immediate work queue from Mac without opening iOS/web.
- Counts match iOS Today for the same backend data.
- Rows navigate to the correct Mac issue, PR, or session detail surfaces.
- Search finds matching issues/PRs and preserves navigation.
- Quick create opens the Mac creation flow.
- Cached/offline indicators match the underlying data freshness.

### Required Validation

- `IssueCTLMacTests`: Today item selection logic, counts, search, navigation target mapping.
- `IssueCTLMacUITests`: Today view/window, row navigation, global search, quick create.
- Mock-server assertions for issue/PR/session fixture loading.
- Dogfood against a repo with assigned issues, review PRs, and active sessions.

## Cross-Cutting Mac Requirements

### UX Requirements

- Keep Mac UI dense and scannable.
- Prefer native macOS controls: forms, split/sidebar windows, toolbar buttons, menus, context menus, keyboard shortcuts, and settings panes.
- Preserve the sidebar fast path:
  - One-click refresh.
  - One-click launch.
  - Quick collapse/expand.
  - Per-Desktop state.
  - Status-menu controls.
- Do not force web settings for core Mac workflows after Phase 1.
- Do not regress the minimized sliver/expand affordance.

### State Requirements

Per-Desktop state remains independent for:

- Sidebar visibility.
- Collapse state.
- Width.
- Selected section.
- Repo filters.
- Issue section/filter.
- Mine filter.
- Search.
- Sort.
- Pagination behavior if the phase chooses persistence.

Shared settings remain global:

- Server credentials.
- Local auto-connect behavior.
- Launch defaults.
- Repo list.
- Worktree settings.
- Advanced settings.
- Notification preferences if implemented.

### Dogfood Requirements

Each phase PR must include:

- Commands run.
- Whether `IssueCTLMacUITests` passed or why a runtime verification replaced part of it.
- Manual Mac status-menu/sidebar steps performed.
- Any two-Desktop dogfood results if per-Desktop state changed.
- Screenshots or concise notes for new settings/detail/list UI where useful.

## Suggested Execution Order

1. Native Mac repository management.
2. Connection and Mac settings hub parity.
3. Worktree management.
4. Issue list filters, sections, sorting, and per-Desktop state.
5. Issue detail actions, linked context, and markdown rendering.
6. Draft assignment, quick create, image attachment, and parse decision.
7. Pull request browse/detail/actions.
8. Launch, terminal, and session parity.
9. Offline queue and reliability UX.
10. Notifications decision/implementation.
11. Today dashboard or compact attention view.

## Definition Of Done For Full Parity

- A Mac user can configure the app, add repos, manage repo paths, browse issues and PRs, perform core issue/PR actions, create/assign drafts, launch/end sessions, manage worktrees, and understand offline/cache state without opening iOS or the web UI.
- All audited discrepancies in the matrix are either implemented or explicitly marked intentionally omitted with rationale and a linked follow-up.
- Mac-specific per-Desktop sidebar behavior remains stable after the parity work.
- Each completed phase has automated tests or a documented reason why automation is not reliable, plus manual dogfood evidence.
- The Mac app can be dogfooded for a full work session: connect, add repo, filter issue list, inspect issue, edit/comment/label/assign, create issue/draft, inspect PR, launch agent, open terminal, end session, and clean up worktree.
