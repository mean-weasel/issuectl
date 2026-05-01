# iOS User Workflows

> Executable playbooks for QA-testing the issuectl iOS app via Claude Code + `xcodebuildmcp ui-automation`. Each workflow is self-contained and describes the preconditions, steps, and expected outcomes.

**Prerequisites for all workflows:**
- iOS app built and running on simulator (`xcodebuildmcp simulator build-and-run`) or a physical iPhone
- `issuectl web` running on port 3847
- At least one GitHub repo accessible via `gh auth token`

When testing on a physical iPhone, use the LAN URL printed by `issuectl web`, for example `http://192.0.2.10:3847`. Do not use `localhost`, because that points at the phone, not the Mac. `issuectl web` also prints the current mobile API token, an `issuectl://setup?...` deep link, and a QR code that configures the iOS app automatically.

**Automation commands used:**
```
xcodebuildmcp ui-automation snapshot-ui   # view hierarchy + coordinates
xcodebuildmcp ui-automation tap --label   # tap by accessibility label
xcodebuildmcp ui-automation tap --id      # tap by accessibility identifier
xcodebuildmcp ui-automation tap -x -y     # tap by coordinates
xcodebuildmcp ui-automation type          # type text into focused field
xcodebuildmcp ui-automation swipe         # swipe gesture
xcodebuildmcp simulator screenshot        # capture screen state
```

**Automated XCTest smoke suites:**

Use these when the workflow has an accessibility-identifier backed XCTest in `ios/IssueCTLUITests/IssueCTLUITests.swift`.

| Command | Scope | Intended use |
|---------|-------|--------------|
| `pnpm ios:ui-smoke:fast` | One critical launch/re-enter workflow | Local pre-push confidence check for iOS changes |
| `pnpm ios:ui-smoke:full` | All focused iOS UI smoke workflows | Local CI parity before opening or updating a PR |
| `pnpm ios:ui-smoke` | Full suite by default | Backward-compatible alias for the full suite |
| `RUN_IOS_UI_SMOKE=1 git push` | Fast profile through Husky pre-push | Opt-in local gate before pushing iOS changes |

The smoke runner accepts the same knobs in local and CI environments:

```sh
IOS_UI_SMOKE_PROFILE=fast ./scripts/ios-ui-smoke.sh
IOS_UI_SMOKE_PROFILE=full ./scripts/ios-ui-smoke.sh
IOS_DESTINATION='platform=iOS Simulator,name=iPhone 17' pnpm ios:ui-smoke:full
```

CI runs the full profile in `.github/workflows/ios.yml` on iOS, smoke-script, pre-push hook, package script, and iOS workflow changes. Keep the fast profile short enough for developer pushes; put broader regression coverage in the full profile.

---

## Workflow 1: Onboarding — Connect to Server

**Precondition:** Fresh app install or after disconnect. App shows OnboardingView.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Screenshot to confirm onboarding screen visible | See "Server URL" and "API Token" fields |
| 2 | Tap the Server URL field | Field is focused |
| 3 | Type `http://localhost:3847` on simulator, or the LAN URL from `issuectl web` on a physical iPhone | URL appears in field |
| 4 | Tap the API Token field | Field is focused (SecureField) |
| 5 | Type the API token from `issuectl web` output | Dots appear in field |
| 6 | Tap "Connect" button | Loading indicator, then transition to main TabView |
| 7 | Screenshot to confirm main app loaded | See Issues tab with tab bar at bottom |

**Shortcut:** On a physical iPhone, scan the QR code printed by `issuectl web` or open the printed `issuectl://setup?...` link. The app should save the server URL and token, then transition to the main TabView.

**Recovery:** If connect fails, verify `issuectl web` is running, the phone and Mac are on the same network, the server URL is not `localhost` on a physical iPhone, and the token matches `SELECT value FROM settings WHERE key = 'api_token'`.

---

## Workflow 2: Add a Repository

**Precondition:** App is connected (past onboarding). Settings tab is accessible.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap "Settings" tab | Settings screen loads with server info |
| 2 | Tap "+" button (Add repository, accessibility label) | AddRepoSheet appears |
| 3 | Tap "Owner" field | Field is focused |
| 4 | Type the repo owner (e.g., `mean-weasel`) | Text appears |
| 5 | Tap "Name" field | Field is focused |
| 6 | Type the repo name (e.g., `issuectl`) | Text appears |
| 7 | Tap "Add" button | Sheet dismisses, repo appears in list |
| 8 | Screenshot to confirm repo in list | See `mean-weasel/issuectl` with colored dot |

**Alternative: Browse repos**
| Step | Action | Verify |
|------|--------|--------|
| 3a | Tap "Browse Accessible Repos" disclosure | Expandable section opens |
| 4a | Tap refresh button | Loading spinner, then repo list populates |
| 5a | Tap a repo from the list | Owner/Name fields auto-fill, checkmark appears |
| 6a | Tap "Add" button | Sheet dismisses, repo in list |

---

## Workflow 3: Remove a Repository

**Precondition:** At least one repo exists in Settings.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap "Settings" tab | See repo list |
| 2 | Swipe left on a repo row | "Delete" button appears (red) |
| 3 | Tap "Delete" | Repo removed from list |
| 4 | Tap "Issues" tab | Issue list no longer shows issues from deleted repo |

---

## Workflow 4: Browse Issues

**Precondition:** At least one repo added with open issues on GitHub.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap "Issues" tab | Issue list loads (may show loading spinner first) |
| 2 | Screenshot the issue list | See section tabs (Drafts, Open, Running, etc.) and issue rows |
| 3 | Tap "Open" section tab | Open issues displayed with title, labels, author |
| 4 | Tap the bottom-right filter button | Filter & Sort sheet appears |
| 5 | Tap a repository option | Issue counts and visible rows update to that repo |
| 6 | Tap "All Repos" | Full issue counts and rows are restored |
| 7 | Scroll to the bottom of the Filter & Sort sheet | Sort segmented control and Mine Only toggle are visible |
| 8 | Toggle "Mine Only" on | Counts update to issues associated with the current user |
| 9 | Toggle "Mine Only" off | Full issue counts are restored |
| 10 | Select "Created" in the Sort segmented control | List re-sorts by creation date |
| 11 | Dismiss the sheet | Issue list remains visible with selected sort applied |

---

## Workflow 5: View Issue Detail

**Precondition:** Issue list has at least one open issue.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap an issue row in the Open section | IssueDetailView loads |
| 2 | Screenshot the detail view | See title, state badge, body text, comments |
| 3 | Scroll down to verify comments section | Comments visible (if any) with author and timestamp |
| 4 | Tap back button to return to list | Issue list visible again |

---

## Workflow 6: Create a Draft Issue

**Precondition:** On Issues tab.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap the bottom "Create Issue" button | QuickCreateSheet appears |
| 2 | Tap the "Local Draft" repository chip | Local Draft chip is selected and the submit button says "Create Draft" |
| 3 | Tap "Title" field | Field focused |
| 4 | Type `Test draft issue from automation` | Title appears |
| 5 | Tap "Details" TextEditor | Editor focused |
| 6 | Type `This is a test draft created via workflow automation.` | Text appears |
| 7 | Expand "More Options" | Priority segmented picker appears |
| 8 | Tap Priority "High" segment | High selected in segmented picker |
| 9 | Tap "Create Draft" button | Loading indicator, then sheet dismisses |
| 10 | Tap "Drafts" section tab | New draft visible in list |
| 11 | Screenshot to confirm | See "Test draft issue from automation" in drafts |

---

## Workflow 7: Edit a Draft Issue

**Precondition:** At least one draft exists (run Workflow 6 first).

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap "Drafts" section tab | Drafts listed |
| 2 | Tap the draft row | DraftDetailView loads with current values |
| 3 | Tap the Title field | Field focused with current title |
| 4 | Clear and type `Updated draft title` | New title appears |
| 5 | Tap Priority "Low" segment | Low selected |
| 6 | Tap "Save" button (top-right) | Loading, then back to list |
| 7 | Verify the draft shows updated title | Title changed in list |

---

## Workflow 8: Assign Draft to Repo (Create GitHub Issue)

**Precondition:** A draft exists and at least one repo is added.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap "Drafts" section tab | Drafts listed |
| 2 | Tap a draft row | DraftDetailView opens |
| 3 | In "Assign to Repository", select a repo row (e.g., `mean-weasel/issuectl-test-repo`) | Repo row shows selected state and labels load |
| 4 | (Optional) Select one or more labels | Labels toggled on |
| 5 | Scroll to the bottom of the labels list | "Create Issue in {repo}" button is visible |
| 6 | Tap "Create Issue in {repo}" button | Loading, then returns to issue list |
| 7 | Tap "Open" section | New issue visible in open issues |
| 8 | Verify on GitHub: `gh issue list --repo owner/repo` | Issue exists on GitHub |

---

## Workflow 9: Parse Natural Language into Issues (Create with AI)

**Precondition:** App connected with at least one repo. On Issues tab.

This is the AI-powered flow: write freeform text describing multiple issues, the server parses them via Claude CLI into structured issues with titles, bodies, types, suggested labels, and repo assignments. You then review, accept/reject, assign repos, and batch-create.

**Phase 1: Input**
| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap the Parse with AI icon in the bottom issue action bar | ParseView appears with text editor |
| 2 | Screenshot the input view | See instruction text, empty editor, character counter "0 / 8192" |
| 3 | Tap the text editor | Editor focused |
| 4 | Type a freeform description, e.g.: | Text appears with live character count |
|   | `Fix the login page crash when password is empty.` | |
|   | `Add dark mode support to the settings screen.` | |
|   | `The API returns 500 when the repo name has dots.` | |
| 5 | Include a repo full name when you want explicit assignment, e.g. `Create these in owner/repo:` | Parsed issues can be auto-assigned to that repo |
| 6 | Tap "Parse with AI" button | Loading spinner, "Parsing..." text |
| 7 | Wait for parsing to complete (may take 5-15s) | Transitions to review view |

**Phase 2: Review parsed issues**
| Step | Action | Verify |
|------|--------|--------|
| 8 | Screenshot the review view | See summary bar ("3 issues found, 3 accepted") |
| 9 | Verify each parsed issue shows: | Title (bold), body preview, type badge (bug/feature/etc.), suggested labels, repo picker |
| 10 | All issues start accepted (green checkmark) | Green checkmark circles on right side |
| 11 | Tap checkmark on one issue to reject it | Checkmark becomes empty circle, title strikes through, opacity dims |
| 12 | Tap it again to re-accept | Green checkmark returns |
| 13 | Verify repo auto-assignment | If confidence >= 70% or single repo, picker pre-filled; otherwise shows "Select repo..." in orange |

**Phase 3: Assign repos (if not auto-assigned)**
| Step | Action | Verify |
|------|--------|--------|
| 14 | Tap "Select repo..." on an unassigned issue | Menu appears with repo list |
| 15 | Tap a repo from the menu | Repo name replaces "Select repo...", text turns from orange to primary |
| 16 | Repeat for any other unassigned issues | All accepted issues have repos |
| 17 | "Create N Issues" button becomes enabled | Button not disabled/grayed |

**Phase 4: Batch create**
| Step | Action | Verify |
|------|--------|--------|
| 18 | Tap "Create N Issues" button | Loading spinner, "Creating..." |
| 19 | Wait for creation to complete | Result view appears |
| 20 | Screenshot the result | Green checkmark with "N issues created" (and optionally "N drafts saved") |
| 21 | If any failures, verify error details | Red xmark items with error messages |
| 22 | Tap "Done" | Sheet dismisses, back to issue list |
| 23 | Tap "Open" section tab | New issues visible in the open issue list |
| 24 | Verify on GitHub: `gh issue list --repo owner/repo` | Issues exist on GitHub with correct titles and labels |

**Alternative: Start over**
| Step | Action | Verify |
|------|--------|--------|
| A1 | From review view, tap "Start Over" button | Returns to input view with previous text still in editor |
| A2 | Edit the text and re-parse | New parse results replace old ones |

**Edge cases to test:**
- Parse with single issue → "1 issue found"
- Parse with all issues rejected → "Create 0 Issues" button disabled
- Parse with some repos assigned and some not → button stays disabled until all accepted issues have repos
- Input over 8192 characters → "Parse with AI" button disabled
- Empty/whitespace-only input → button disabled

---

## Workflow 10: Close and Reopen an Issue

**Precondition:** An open issue exists in the list.

**Close via swipe:**
| Step | Action | Verify |
|------|--------|--------|
| 1 | Swipe left on an open issue row | "Close" button appears (red) |
| 2 | Tap "Close" | "Close Issue" confirmation dialog appears |
| 3 | Tap "Close" in the confirmation dialog | Issue closes on GitHub |
| 4 | Scroll the section tabs horizontally if needed, then tap "Closed" | See the closed issue |

**Reopen via swipe:**
| Step | Action | Verify |
|------|--------|--------|
| 5 | Swipe right on the closed issue | "Reopen" button appears (green) |
| 6 | Tap "Reopen" | "Reopen Issue" confirmation dialog appears |
| 7 | Tap "Reopen" in the confirmation dialog | Issue reopens and returns to the Open section |

**Close via detail view:**
| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap an open issue → detail view | Detail loads |
| 2 | Tap the overflow menu in the bottom action bar | Issue actions menu appears |
| 3 | Tap "Close Issue" | Confirmation dialog appears |
| 4 | Confirm close | Issue state changes to Closed, badge updates |

**Reopen via detail view:**
| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap a closed issue → detail view | Detail loads with a "Closed" badge |
| 2 | Tap "Reopen" in the bottom action bar | "Reopen Issue" confirmation dialog appears |
| 3 | Confirm reopen | Issue state changes to Open, badge updates |

---

## Workflow 11: Add a Comment to an Issue

**Precondition:** Viewing an issue in IssueDetailView.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap the overflow menu in the bottom action bar | Issue actions menu appears |
| 2 | Tap "Comment" | IssueCommentSheet appears |
| 3 | Tap the comment TextEditor | Editor focused |
| 4 | Type `Test comment from iOS automation` | Text appears |
| 5 | Tap "Add Comment" | Loading, sheet dismisses |
| 6 | Scroll down in detail view if needed | New comment visible at bottom with your username |
| 7 | Verify on GitHub: `gh issue view NUMBER --repo owner/repo --comments` | Comment exists on GitHub |

---

## Workflow 12: Launch Claude Code from an Issue

**Precondition:** An open issue exists, `issuectl web` is running with ttyd/tmux available.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap an open issue in the list | IssueDetailView loads |
| 2 | Tap "Launch Claude" in the bottom action bar | LaunchView sheet appears |
| 3 | Screenshot the launch form | See issue title, recommended workspace summary, and launch button |
| 4 | If the repo has no local clone, verify the warning | "This repository has no local clone. A fresh clone will be created." appears and Clone mode is selected |
| 5 | Tap "Advanced Options" | Workspace mode picker, branch name, comment toggles, file options, and preamble appear |
| 6 | Verify branch name is auto-generated | Field shows `issue-{number}-{slug}` |
| 7 | If workspace mode is editable, switch between Worktree/Existing/Clone | Selected workspace summary updates |
| 8 | (Optional) Toggle comment checkboxes | Selected comments included in context |
| 9 | Tap "Launch with Recommended Settings" | Loading/progress state appears |
| 10 | Wait for launch to complete | TerminalView appears full-screen |
| 11 | If Claude shows the workspace trust prompt, choose "Yes, I trust this folder" | Claude Code continues loading |
| 12 | Screenshot the terminal | See ttyd terminal with Claude Code running for the issue |

**Alternative: Launch via swipe**
| Step | Action | Verify |
|------|--------|--------|
| 1 | Swipe left on an open issue row | "Launch" button appears (green) |
| 2 | Tap "Launch" | LaunchView sheet appears |
| 3 | Continue from step 4 above | Same flow |

---

## Workflow 13: Exit Terminal Session (Done)

**Precondition:** Terminal is open from Workflow 12.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap "Done" button (top-left of terminal) | Full-screen terminal dismisses |
| 2 | Back at IssueDetailView (or wherever launched from) | Previous screen visible |
| 3 | If returned to IssueDetailView, verify the primary action changed to "Re-enter Terminal" | Session is still running for the issue |
| 4 | Tap "Active" tab from the main tab bar | SessionListView shows the session still running |
| 5 | Screenshot to confirm session is listed | See repo, issue number, branch, running duration |
| 6 | Optional backend verification: `curl /api/v1/deployments` | Deployment for the issue has `state: active`, `ttydPort`, and `endedAt: null` |

---

## Workflow 14: Re-enter Active Session (Terminal Reconnect)

**Precondition:** A session was launched and exited via "Done" (Workflow 12). Session is still in Active tab.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap "Active" tab | Session list visible with running session |
| 2 | Tap the session row | TerminalView appears full-screen |
| 3 | Wait 1-2 seconds for ttyd respawn | Terminal content loads (not blank/black) |
| 4 | Screenshot the terminal | See Claude Code session, same state as before |
| 5 | Tap "Done" to exit again | Back to session list |

**Key verification:** The terminal should NOT show a blank/black screen. The server-side `ensureTtydRunning()` respawns ttyd against the still-running tmux session.

**Alternative: Re-enter from the running issue**
| Step | Action | Verify |
|------|--------|--------|
| A1 | From Issues, tap the "Running" section tab | Running issue list appears |
| A2 | Tap the running issue | IssueDetailView appears with "Re-enter Terminal" |
| A3 | Tap "Re-enter Terminal" | TerminalView appears full-screen |
| A4 | Screenshot the terminal | Same Claude Code session state appears, not a blank/black screen |
| A5 | Tap "Done" to exit again | Back to issue detail |

---

## Workflow 15: End a Session

**Precondition:** An active session exists.

**Via Active Sessions tab:**
| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap "Active" tab | Session list visible |
| 2 | Swipe right on a session row | "End" button appears (red) |
| 3 | Tap "End" | Confirmation dialog |
| 4 | Confirm | Session disappears from list |

**Via Terminal view:**
| Step | Action | Verify |
|------|--------|--------|
| 1 | Open terminal (tap session row) | TerminalView visible |
| 2 | Tap the top-right stop/End button | "End this session?" confirmation dialog appears |
| 3 | Tap "End Session" | Terminal closes, back to previous screen |
| 4 | Previous issue detail returns to "Launch Claude" instead of "Re-enter Terminal" | Session is no longer active for that issue |
| 5 | Tap "Active" tab | Session no longer listed |
| 6 | Optional backend verification: `curl /api/v1/deployments` | No active deployment remains for the ended issue |

---

## Workflow 16: Browse and Review Pull Requests

**Precondition:** At least one repo with open PRs.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap "PRs" tab | PR list loads |
| 2 | Screenshot the list | See Review/Open/Merged/Closed section tabs and PR rows with state badges |
| 3 | Tap an open or review PR | PRDetailView loads |
| 4 | Screenshot the detail | See title, diff stats, branches, body, and bottom action bar |
| 5 | Scroll to verify sections | Checks (CI) and Changed Files visible; Reviews appears when review data exists |
| 6 | Tap the overflow menu | See Open on GitHub, Comment, Request Changes, and Approve actions |
| 7 | Tap outside the menu, then tap back | PR list visible |

---

## Workflow 17: Edit Repo Settings

**Precondition:** A repo exists in Settings.

| Step | Action | Verify |
|------|--------|--------|
| 1 | From Today, tap the top-right gear button | Settings sheet appears with repo list |
| 2 | Tap a repo row | Edit Repository sheet appears |
| 3 | Tap "Local Path" field | Field focused |
| 4 | Type `/Users/you/code/repo-name` | Path entered |
| 5 | Tap "Branch Pattern" field | Field focused |
| 6 | Type `feature/{{number}}-{{slug}}` | Pattern entered |
| 7 | Tap "Save" | Sheet dismisses, repo updated |
| 8 | Tap the repo again to verify | Fields show saved values |
| 9 | Optional backend verification: `curl /api/v1/repos` | Repo has the saved `localPath` and `branchPattern` |

---

## Workflow 18: Disconnect and Reconnect

**Precondition:** App is connected.

| Step | Action | Verify |
|------|--------|--------|
| 1 | From Today, tap the top-right gear button | Settings sheet visible |
| 2 | Scroll to bottom | "Disconnect" button visible (red) |
| 3 | Tap "Disconnect" | Confirmation dialog |
| 4 | Confirm | App transitions to OnboardingView |
| 5 | Follow Workflow 1 to reconnect | Connected Settings sheet or main app appears with server/user/repo data |
| 6 | If Settings remains open, tap "Done" | Back to main app with data |

---

## Workflow 19: Set Issue Priority

**Precondition:** Viewing an issue in IssueDetailView.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap the overflow menu in the bottom action bar | Menu appears |
| 2 | Tap "Priority" submenu | Priority options appear (High, Normal, Low) |
| 3 | Tap "High" | Checkmark appears next to High |
| 4 | Verify priority badge in header | Red "High" badge visible next to issue title |
| 5 | Return to issue list | Priority badge visible on the row (if sorting by Priority) |
| 6 | Optional backend verification: `curl /api/v1/issues/owner/repo/NUMBER/priority` | Priority value matches the selected option |

---

## Workflow 20: Manage Issue Labels

**Precondition:** Viewing an issue in IssueDetailView.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Tap bottom overflow menu → "Manage Labels" | LabelManagementSheet appears |
| 2 | Screenshot the label list | See available repo labels with colored dots |
| 3 | Tap a label to add it | Checkmark appears, label added to issue |
| 4 | Tap another label to add | Second checkmark |
| 5 | Tap the first label again to remove | Checkmark disappears |
| 6 | Dismiss the sheet | Issue detail shows updated labels |
| 7 | Optional GitHub verification: `gh issue view NUMBER --repo owner/repo --json labels` | Labels match the expected final set |

---

## Workflow 21: Full End-to-End — Create Issue and Launch

**Precondition:** App connected with at least one repo.

This combines multiple workflows into a single golden-path scenario:

| Step | Action | Verify |
|------|--------|--------|
| 1 | Issues tab → "Create Issue" in bottom action bar | QuickCreateSheet |
| 2 | Title: `E2E test: launch from new issue` | Title entered |
| 3 | Description: `Testing the full create-to-launch flow` | Description entered |
| 4 | Select a repo if needed | Create button names the selected repo |
| 5 | Tap "Create Issue in {repo}" | Issue created on GitHub |
| 6 | Verify on GitHub: `gh issue list --repo owner/repo --search "E2E test"` | New issue exists |
| 7 | Open the issue from the list/search or detail route | IssueDetailView appears |
| 8 | Tap "Launch Claude" | LaunchView sheet |
| 9 | Tap "Launch with Recommended Settings" | Loading/progress, then TerminalView |
| 10 | Verify terminal is live | Terminal is not blank; Claude prompt or session content is visible |
| 11 | If Claude shows the workspace trust prompt, stop here unless testing Claude execution | Avoids unintended test-repo edits/PRs |
| 12 | Tap "Done" | Back to list/detail |
| 13 | Tap "Active" tab | Session listed |
| 14 | Tap session row | Terminal reconnects (not black) |
| 15 | Tap top-right stop/End button → confirm | Session ended |
| 16 | Tap "Active" tab | No sessions listed |
| 17 | Close the test issue via app or GitHub CLI | Issue moved to Closed |

**Notes:**
- The issue list may need a refresh before the newly created issue appears in app search.
- Backend verification for launch cleanup: `curl /api/v1/deployments` should return no deployment for the E2E issue after ending the session.
- Ending the session should also remove `issuectl:in-progress`; `issuectl:deployed` remains as launch history.

---

## Execution Notes

**Running a workflow with Claude Code:**
```
"Run Workflow 11 (Launch Claude Code) against issue #42 in mean-weasel/issuectl"
```

Claude Code will:
1. Take a snapshot-ui to orient
2. Execute each step using tap/type/swipe commands
3. Take screenshots at verification points
4. Report pass/fail for each step

**Cleanup after testing:**
- Close any test issues created: `gh issue close --repo owner/repo <number>`
- Delete test drafts via the app (long press → delete)
- End any active sessions via the Active tab
