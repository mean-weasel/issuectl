# Workbench User Workflows

These workflows are for manual dogfooding and Playwright CLI passes against the desktop `/workbench` surface.

## Test Setup

- Server: `http://localhost:3847`
- Recommended viewport: `1440x1000`
- Secondary viewport: `1100x850`
- Start route: `/workbench`

Use a safe repo and issue when running mutation-heavy steps against real data. Steps marked **Gated** can launch terminals, write settings, create drafts/issues, comment, close issues, reassign issues, edit repo setup, merge PRs, or remove repos.

For a first smoke pass, run only workflows 1-9 and the read-only portions of workflows 10-14.

## Workflow 1: Production Shell And Repo Rail

**Route:** `/workbench`

1. Navigate to `/workbench`.
2. Verify the top-left link reads `issuectl workbench`.
3. Verify top navigation contains `Workbench`, `Issues`, `Board`, `PRs`, `Quick Create`, and `Settings`.
4. Verify no prototype controls render: `Mock state`, `Terminal selected`, `Issue selected`, `Repo selected`, and `Repo setup` should not appear.
5. Verify the left repo rail is visible with admitted repositories.
6. Click a repo in the rail.
7. Verify the selected repo button has `aria-pressed="true"`.
8. Verify the center focus heading changes to the selected repo.

**Expected:** `/workbench` loads as the production surface, repo selection updates focus without leaving the route, and prototype mock-state controls are absent.

## Workflow 2: Repo Overview And Setup Entry

**Route:** `/workbench`

1. Navigate to `/workbench`.
2. Click a repo in the rail.
3. Verify the overview shows repo name, session count, issue count, and workbench health.
4. If the repo has active local setup, verify local path/status context is visible.
5. If the repo has no local path configured, verify `Set up local path` or equivalent setup copy appears.
6. When `Open repo setup` is visible, click it.
7. Verify navigation to `/workbench/settings?repoSetup=1`.
8. Verify both side panes are collapsed.

**Expected:** Repo overview reflects setup state and setup entry opens the settings/repo setup surface with side panes closed.

## Workflow 3: Issue Sessions Sorting And Terminal Focus

**Route:** `/workbench`

**Requires:** At least one active issue session. If none exist, verify the empty sessions pane and run this workflow later with a disposable launched session or fixture data.

1. Navigate to `/workbench`.
2. Verify the `Active sessions` pane is visible.
3. Verify running sessions appear before idle sessions.
4. Verify any preview error session shows an error state instead of an empty preview.
5. Click the first session row.
6. Verify the focus area changes to terminal focus for that session.
7. Verify the terminal iframe is present.
8. Verify the URL remains `/workbench`.

**Expected:** Session rows are sorted running-first, preview errors are visible, and selecting a session replaces the focus area with the terminal.

## Workflow 4: Session Reconnect

**Route:** `/workbench`

**Requires:** At least one session with a `Reconnect` action. If none exist, run with fixture data or after intentionally creating a disposable session.

1. Navigate to `/workbench`.
2. Find a session with a `Reconnect` action.
3. Click `Reconnect`.
4. Verify the selected terminal opens in the focus area.
5. Verify the terminal iframe points through `/api/terminal/...`, not directly to a raw ttyd port.

**Expected:** Reconnect refreshes the terminal preview while keeping the workbench layout and same-origin terminal proxy.

## Workflow 5: End Session Confirmation

**Route:** `/workbench`

**Gated:** Ends a real active deployment/session.

**Requires:** At least one disposable active session.

1. Navigate to `/workbench`.
2. Pick a disposable session.
3. Click `End`.
4. Verify a confirmation state appears.
5. Click `Cancel` or navigate away for a safe pass.
6. For a destructive pass only, click `End session`.
7. Verify the session row disappears.
8. Verify the linked issue no longer shows running state.

**Expected:** Ending a session requires confirmation and updates both the session list and issue queue after completion.

## Workflow 6: Instance Pane Collapsing

**Route:** `/workbench`

1. Navigate to `/workbench`.
2. Click `Toggle sessions section`.
3. Verify the issue sessions body hides and the header remains visible.
4. Click another repo.
5. Verify the sessions section remains collapsed.
6. Expand the sessions section again.
7. Click `Toggle named shells section`.
8. Verify named shells remain unavailable for v1 and do not masquerade as issue deployments.

**Expected:** Collapse state persists across repo changes, and named shells are honestly disabled.

## Workflow 7: Repo Issue Queue Filters

**Route:** `/workbench`

1. Navigate to `/workbench`.
2. Verify the right `Repo issues` pane is visible.
3. Verify issue cards show number, title, priority/status metadata, and action buttons.
4. Click `Running`.
5. Verify only running issues remain.
6. Click `Closed`.
7. Verify closed issues render or an empty state appears.
8. Click `Open work`.
9. Verify open issue cards return.

**Expected:** Queue filters change visible issue rows without changing the selected repo or route.

## Workflow 8: Issue Detail Focus

**Route:** `/workbench`

1. Navigate to `/workbench`.
2. In the `Repo issues` pane, click `Details` for an issue.
3. Verify the focus area changes to issue detail, not terminal focus.
4. Verify title, issue number, state, labels, body, comments, linked PRs, deployments, and launch options are visible when present.
5. Collapse and expand the comments section.
6. Verify the issue queue and active sessions panes remain visible.

**Expected:** Issue selection opens issue details in the focus area while preserving the repo-scoped side panes.

## Workflow 9: Jump From Issue To Running Session

**Route:** `/workbench`

**Requires:** At least one issue with running/session status.

1. Navigate to `/workbench`.
2. Find an issue with running/session status.
3. Click `Jump to session`.
4. Verify focus changes to terminal focus.
5. Verify the active repo remains selected.
6. Verify the issue queue still shows the selected repo.

**Expected:** Running issue cards can jump directly to their active terminal session.

## Workflow 10: Issue Detail Mutations

**Route:** `/workbench`

**Gated:** These steps can mutate a real GitHub issue.

1. Navigate to `/workbench`.
2. Open issue details for a disposable issue.
3. Change priority and verify the issue queue updates locally.
4. Add a comment with harmless text such as `Workbench dogfood check`.
5. Add a safe label only if it already exists and is appropriate.
6. Use `Assign me` only if assigning the issue to the current user is acceptable.
7. Test `Attach image` only with a throwaway image and disposable issue.
8. Test `Close issue` only on a disposable issue, and verify it moves to the closed filter.
9. Test `Reassign` only when moving the issue between safe repos is intended.

**Expected:** Mutations show status feedback and keep the issue queue/focus state coherent after each action.

## Workflow 11: Launch Options And Worktree Status

**Route:** `/workbench`

**Gated:** Launching starts a real terminal/agent session and can create or modify worktrees.

1. Navigate to `/workbench`.
2. Open issue details for a disposable issue.
3. Verify launch options expose `Codex`, `Claude Code`, `Existing repo`, `Git worktree`, and `Fresh clone`.
4. Verify branch name is populated.
5. If a dirty worktree warning appears, verify `Reset worktree` and `Cleanup stale` controls are visible.
6. For a safe pass, stop before clicking `Launch issue`.
7. For a launch pass only, select the intended agent/workspace mode.
8. Add a clear preamble.
9. Click `Launch issue`.
10. Verify duplicate-launch protection if shown.
11. Verify a new session appears and terminal focus opens through `/api/terminal/...`.

**Expected:** Real launch options are visible, worktree status is explicit, and launch creates a terminal session only after an intentional click.

## Workflow 12: Global Issues Mode

**Route:** `/workbench/issues`

1. Navigate to `/workbench/issues` or click `Issues`.
2. Verify both side panes are collapsed.
3. Verify issues are grouped by repo.
4. Verify each repo group has a heading.
5. Verify running issues are marked.
6. Click `Open issue` on a non-destructive issue card.
7. Verify the app returns to `/workbench`.
8. Verify side panes reopen.
9. Verify the issue's repo is selected.
10. Verify issue detail focus opens.

**Expected:** Global Issues is an aggregate issue view, and opening an issue restores the repo workbench layout.

## Workflow 13: Cross-Repo Board

**Route:** `/workbench/board`

1. Navigate to `/workbench/board` or click `Board`.
2. Verify both side panes are collapsed.
3. Verify one board column appears per admitted repo.
4. Click `Show running only`.
5. Verify non-running issue cards are hidden and empty states appear where appropriate.
6. Click `Show running only` again.
7. Click `Sort by priority`.
8. Verify high-priority issue cards sort ahead of lower-priority cards within a column.
9. Click `Open issue` on a board card.
10. Verify the app returns to `/workbench`, side panes reopen, the repo is selected, and issue detail focus opens.

**Expected:** Board provides at-a-glance cross-repo issue state and card selection returns to focused repo work.

## Workflow 14: Settings And Repo Setup

**Route:** `/workbench/settings`

**Partly Gated:** Saving settings and repo setup writes local settings/repo state. Removing repos changes admitted repo state.

1. Navigate to `/workbench/settings` or click `Settings`.
2. Verify both side panes are collapsed.
3. Verify health summary shows server state, user, tracked repo count, and version when available.
4. Collapse and expand the health section.
5. Verify launch defaults show branch pattern, cache TTL, worktree directory, launch agent, Claude args, Codex args, idle grace period, and idle threshold.
6. For a read-only pass, do not click `Save settings`.
7. For a write pass, change a harmless value, click `Save settings`, and verify `Settings saved`.
8. Use repo setup for a disposable repo only.
9. Verify local path and branch pattern fields are visible.
10. For a write pass, save repo setup and verify confirmation.
11. Use `Refresh GitHub repos` to refresh selectable repos.
12. Do not click `Remove repository` unless intentionally testing repo removal.

**Expected:** Settings is a collapsed global mode, exposes real launch/default options, and repo setup writes are explicit.

## Workflow 15: Quick Create

**Route:** `/workbench/quick-create`

**Gated:** Parsing may call configured AI services; creating accepted issues writes to GitHub; draft actions write local drafts and may assign them.

1. Navigate to `/workbench/quick-create` or click `Quick Create`.
2. Verify side panes remain visible.
3. Verify the selected repo context is preserved.
4. Enter a short input such as `Fix flaky workbench navigation and add a regression note`.
5. For a safe pass, stop before clicking `Parse`.
6. For a parse pass, click `Parse`.
7. Verify candidate issue cards appear.
8. Reject at least one candidate.
9. Verify accepted/rejected state is visible.
10. Stop before `Create accepted issues` unless creating real issues is intended.
11. For local draft testing only, use draft fields on a safe title/body and verify status messages after save/update.
12. Use `Assign draft` only if assigning the draft to GitHub is intended.

**Expected:** Quick Create keeps repo context, exposes reviewable candidates, and separates parse/create/draft actions clearly.

## Workflow 16: Pull Requests Mode

**Route:** `/workbench/prs`

**Gated:** Review, comment, and merge actions mutate GitHub PR state.

**Requires for detail coverage:** At least one open disposable PR. If no open PRs exist, verify the empty state and use fixture data for PR detail/actions.

1. Navigate to `/workbench/prs` or click `PRs`.
2. Verify side panes remain visible.
3. Verify PR list loads for the selected repo.
4. Verify each PR card shows number/title and check state when available.
5. Click `Open PR`.
6. Verify PR detail shows linked issue, checks, branch/base metadata, and review/merge/comment controls.
7. For a safe pass, stop before mutation controls.
8. Click another repo with no PRs, if available.
9. Verify the empty PR state renders.
10. Use `Review`, `Comment`, or `Merge squash` only on a disposable PR where that action is intended.

**Expected:** PR mode is repo-scoped, detail opens in focus, and mutation controls are visible but avoid accidental changes unless deliberately exercised.

## Workflow 17: Width Adjustability

**Route:** `/workbench`

1. Navigate to `/workbench`.
2. Drag `Resize instances column` to widen the left sessions pane.
3. Verify the focus pane remains usable and text does not overlap.
4. Drag `Resize issues column` to widen the right issue pane.
5. Verify column widths persist after a reload.
6. Click `Reset column widths`.
7. Verify columns return to default proportions.

**Expected:** Desktop column resizing is stable, persistent, and resettable.

## Workflow 18: Responsive Desktop Matrix

**Routes:** `/workbench`, `/workbench/issues`, `/workbench/settings`, `/workbench/board`

Run this at each viewport:

- `1440x1000`
- `1280x900`
- `1100x850`

Steps:

1. Navigate to `/workbench`.
2. Verify top navigation stays on one row and all nav buttons are clickable.
3. Verify repo rail, sessions pane, focus pane, and issues pane do not overlap.
4. Navigate to `/workbench/issues`.
5. Verify side panes are collapsed and there is no horizontal page scroll.
6. Navigate to `/workbench/settings`.
7. Verify side panes are collapsed and settings fields fit their containers.
8. Navigate to `/workbench/board`.
9. Verify columns remain scannable and no page-level horizontal scroll appears.

**Expected:** The workbench remains usable at supported desktop widths.

## Workflow 19: Deep Links And Browser Navigation

**Routes:** `/workbench`, `/workbench/issues`, `/workbench/board`, `/workbench/prs`, `/workbench/quick-create`, `/workbench/settings`

1. Navigate directly to each route.
2. Verify no route returns a 404.
3. Verify the matching top nav item has `aria-current="page"`.
4. Use browser back/forward between routes.
5. Verify repo selection is preserved where appropriate.
6. Verify global modes continue to collapse side panes.
7. Verify Workbench/PRs/Quick Create modes show side panes.

**Expected:** Workbench subroutes are directly addressable and browser navigation preserves expected state.

## Workflow 20: Empty Repository State

**Route:** `/workbench`

**Gated:** Requires an environment with no admitted repos or a fixture database.

1. Start from an empty tracked-repository state.
2. Navigate to `/workbench`.
3. Verify `No tracked repositories` appears.
4. Verify `Add repository` and `Open settings` actions are visible.
5. Click `Add repository`.
6. Verify navigation to `/workbench/settings?repoSetup=1`.

**Expected:** Empty setup has a clear path into repo setup.

## Safe Screenshot Pass

Capture these after running the safe workflows:

| Screenshot | Route or State |
| --- | --- |
| `workbench-overview-1440.png` | `/workbench` after selecting an active repo |
| `workbench-terminal-1440.png` | Terminal focus after selecting an existing session |
| `workbench-issue-1440.png` | Issue detail focus after clicking `Details` |
| `workbench-issues-1440.png` | `/workbench/issues` |
| `workbench-board-1440.png` | `/workbench/board` |
| `workbench-settings-1440.png` | `/workbench/settings` |
| `workbench-prs-1440.png` | `/workbench/prs` |
| `workbench-quick-create-1440.png` | `/workbench/quick-create` before parsing |
| `workbench-overview-1100.png` | `/workbench` at `1100x850` |

## Coverage Map

| Surface | Workflows |
| --- | --- |
| Production shell and nav | 1, 18, 19 |
| Repo rail and repo overview | 1, 2 |
| Active sessions and terminal focus | 3, 4, 5, 9 |
| Instance sorting and preview errors | 3 |
| Collapsible sections | 6, 14 |
| Repo issue queue | 7, 9 |
| Issue detail and mutations | 8, 10 |
| Launch options and worktree status | 11 |
| Global Issues | 12 |
| Cross-repo Board | 13 |
| Settings and repo setup | 14, 20 |
| Quick Create | 15 |
| Pull requests | 16 |
| Width adjustability | 17 |
| Responsive desktop behavior | 18 |
| Deep links | 19 |
