# Desktop Workflows (viewport: 1280×800)

> Used by QA skills (smoke-tester, ux-auditor, performance-profiler) to verify the app at desktop breakpoints.

## Workflow 1: Browse Issues and Switch Tabs

**Route:** `/`

1. Navigate to `/`
2. Verify four sections visible: Unassigned, In Focus, In Flight, Shipped
3. Verify each issue row shows title, repo chip, age
4. Click "Pull Requests" tab
5. Verify URL updates to `/?tab=prs`
6. Verify PR rows show owner/repo, branch, +/- stats
7. Click "Issues" tab
8. Verify URL returns to `/` (or `/?tab=issues`)

**Expected:** Tab switching is instant, sections render with correct headings, rows are clickable links.

---

## Workflow 2: Create a Draft

**Route:** `/` → CreateDraftSheet

1. Navigate to `/`
2. Click the FAB (bottom-right floating button)
3. Verify CreateDraftSheet slides up from bottom
4. Verify focus is on the title input
5. Leave title empty, click "Save Draft"
6. Verify validation error appears
7. Type "Test draft issue" in title input
8. Click "Save Draft"
9. Verify sheet closes
10. Verify new draft appears in the Unassigned section

**Expected:** Sheet opens with focus trap, validation prevents empty title, successful create adds row to list.

---

## Workflow 3: View and Edit a Draft

**Route:** `/drafts/[draftId]`

1. From `/`, click a draft row in the Unassigned section
2. Verify navigation to `/drafts/[draftId]`
3. Verify title is displayed in an editable input
4. Verify "no repo" and priority metadata shown
5. Verify "local draft" info text visible
6. Edit the title, click outside (blur)
7. Verify "saved" indicator flashes
8. Type body text in the body textarea, click outside (blur)
9. Verify "saved" indicator flashes again
10. Click back link to return to `/`

**Expected:** Auto-save on blur for both title and body, saved indicator confirms persistence.

---

## Workflow 4: Assign a Draft to a Repo

**Route:** `/` → AssignSheet

1. Navigate to `/`
2. Click the assign button on a draft row
3. Verify AssignSheet opens listing all tracked repos
4. Click a repo row
5. Verify loading spinner appears on that row
6. Verify sheet closes on success
7. Verify the draft disappears from Unassigned and reappears as an issue (In Focus or appropriate section)

**Expected:** Draft is converted to a GitHub issue and moves to the correct section.

---

## Workflow 5: View Issue Detail and Set Priority

**Route:** `/issues/[owner]/[repo]/[number]`

1. From `/`, click an issue row
2. Verify navigation to `/issues/[owner]/[repo]/[number]`
3. Verify title, issue number, state chip, repo, labels, age displayed
4. Verify issue body rendered as markdown
5. Verify comments thread displayed below body
6. Click the priority metadata button
7. Verify PriorityPicker sheet opens with High / Normal / Low options
8. Click "High"
9. Verify sheet closes and priority updates in metadata
10. Click back link to return to `/`

**Expected:** Full issue detail loads, priority change persists, back navigation works.

---

## Workflow 6: Add a Comment to an Issue

**Route:** `/issues/[owner]/[repo]/[number]`

1. Navigate to an issue detail page
2. Scroll to the comment composer at the bottom
3. Type "Test comment" in the textarea
4. Press Cmd+Enter (or click send button)
5. Verify comment appears in the thread
6. Verify textarea clears after submission

**Expected:** Comment posts to GitHub and appears in the thread.

---

## Workflow 7: Launch Claude Code from an Issue

**Route:** `/issues/[owner]/[repo]/[number]` → LaunchModal → `/launch/[owner]/[repo]/[number]`

1. Navigate to an issue detail page
2. Verify "Ready to launch" card visible
3. Click "launch →" button
4. Verify LaunchModal opens with branch name, workspace mode, context toggles
5. Verify branch name is auto-populated
6. Toggle a comment checkbox off
7. Click "Launch" button
8. Verify navigation to `/launch/[owner]/[repo]/[number]?deploymentId=...`
9. Verify launch progress page shows deployment status

**Expected:** Modal configures launch options, submission triggers deployment and navigates to progress.

---

## Workflow 8: View PR Detail and Merge

**Route:** `/pulls/[owner]/[repo]/[number]`

1. From `/?tab=prs`, click an open PR row
2. Verify navigation to `/pulls/[owner]/[repo]/[number]`
3. Verify PR title, number, state chip, stats displayed
4. Verify CI Checks section with status dots
5. Verify Files Changed section with per-file +/- counts
6. Click "merge" button
7. Verify confirmation appears: "merge into [base]?" with "yes, merge →" and "cancel"
8. Click "cancel"
9. Verify confirmation disappears, merge button returns
10. Click "merge" again, then "yes, merge →"
11. Verify merged success banner appears

**Expected:** Two-step merge confirmation prevents accidental merges, success state is clear.

---

## Workflow 9: Quick Create (Parse Natural Language)

**Route:** `/parse`

1. Open navigation drawer, click "Quick Create"
2. Verify navigation to `/parse`
3. Type "Fix the login bug in auth module and add rate limiting to API" in textarea
4. Click "Parse with Claude"
5. Verify review step appears with parsed issue cards
6. Verify each card has editable title, body, repo selector, labels, accept toggle
7. Toggle one issue off
8. Click "Create"
9. Verify results step shows success/failure counts

**Expected:** Natural language parses into structured issues, user can review/edit before batch creation.

---

## Workflow 10: Settings Management

**Route:** `/settings`

1. Open navigation drawer, click "Settings"
2. Verify navigation to `/settings`
3. Verify Tracked Repositories section with repo list
4. Click "+ Add Repo", enter owner/name, submit
5. Verify repo appears in list
6. Edit Branch Pattern field
7. Click "Save Settings"
8. Verify toast notification confirms save
9. Click delete on a repo row
10. Verify repo removed from list

**Expected:** All settings are editable and persist, repos can be added/removed.

---

## Workflow 11: Navigation Drawer

**Route:** `/`

1. Navigate to `/`
2. Click the menu button (···) in the top bar
2. Verify drawer slides in from the right
3. Verify links: All issues, Pull requests, Quick Create, Settings
4. Verify GitHub username and auth badge in footer
5. Click "Settings"
6. Verify navigation to `/settings` and drawer closes
7. Click menu button again, press Escape
8. Verify drawer closes without navigating

**Expected:** Drawer opens/closes cleanly, links navigate correctly, Escape dismisses.

---

## Route Coverage

| Route | Workflows |
|---|---|
| `/` | 1, 2, 4 |
| `/drafts/[draftId]` | 3 |
| `/issues/[owner]/[repo]/[number]` | 5, 6, 7 |
| `/pulls/[owner]/[repo]/[number]` | 8 |
| `/launch/[owner]/[repo]/[number]` | 7 |
| `/parse` | 9 |
| `/settings` | 10 |

## CRUD Coverage

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| Draft | W2 | W3 | W3 | W4 (assign converts) |
| Issue | W4 (via assign), W9 | W1, W5 | W6 (comment) | — |
| PR | — | W1, W8 | W8 (merge) | — |
| Priority | — | W5 | W5 | — |
| Repo (tracked) | W10 | W10 | W10 | W10 |
| Settings | — | W10 | W10 | — |
| Deployment | W7 | W7 | — | — |
