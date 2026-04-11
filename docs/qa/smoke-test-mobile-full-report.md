# Mobile Smoke Test -- Full Report (with write operations)

**Date:** 2026-04-11
**Viewport:** 393 x 852
**URL:** http://localhost:3847
**Test repo:** mean-weasel/issuectl-test-repo

---

## Results

| Workflow | Step | Action | Result | Status |
|----------|------|--------|--------|--------|
| **W1: Browse Issues** | 1 | Navigate to `/` at 393x852 | Page loaded, single-column layout | PASS |
| | 2 | Verify single-column layout, no sidebar | No sidebar, content centered | PASS |
| | 3 | Verify four sections visible | unassigned, in focus, in flight, shipped all present | PASS |
| | 4 | Verify touch targets >= 44px | Rows are 78-80px tall, 387px wide | PASS |
| | 5 | Tap "Pull Requests" tab | Tab switched to `/?tab=prs` | PASS |
| | 6 | Verify PR rows render | PR "chore: smoke test fixture" #10 visible with repo, status, date | PASS |
| | 7 | Tap "Issues" tab | Returned to issues view at `/` | PASS |
| | 8 | Verify return to issues view | All four sections visible again | PASS |
| **W2: Create a Draft** | 1 | Navigate to `/` | Already on page | PASS |
| | 2 | Tap FAB (bottom-right) | Bottom sheet dialog "New draft" appeared | PASS |
| | 3 | Verify bottom sheet slides up | Dialog covers lower portion with title input, cancel, save | PASS |
| | 4 | Verify keyboard focus on title input | Textbox "What needs to be done?" is active | PASS |
| | 5 | Type "Smoke test draft W2" | Text entered in title field | PASS |
| | 6 | Tap "Save Draft" | Sheet dismissed | PASS |
| | 7 | Verify draft appears in Unassigned | "Smoke test draft W2" in unassigned, count 1 -> 2 | PASS |
| **W3: Assign a Draft** | 1 | Find draft in Unassigned | "Smoke test draft W2" visible with "assign" button | PASS |
| | 2 | Tap "assign" button on draft | "assign to repo" dialog appeared | PASS |
| | 3 | Verify repo list in sheet | "issuectl-test-repo" by "mean-weasel" shown | PASS |
| | 4 | Tap repo to assign | Repo selected, dialog processing | PASS |
| | 5 | Verify draft moves out of Unassigned | Draft removed, unassigned count 2 -> 1 | PASS |
| | 6 | Verify issue created on GitHub | Issue #11 "Smoke test draft W2" appeared in "in focus" on refresh | PASS |
| **W4: View/Edit Draft** | 1 | Tap draft row | Navigated to `/drafts/5b70e907-...` | PASS |
| | 2 | Verify single-column detail layout | Title input, metadata, body textarea visible | PASS |
| | 3 | Verify title input is full-width | Title spans viewport width | PASS |
| | 4 | Edit title to "Draft for smoke test W4" | Title updated | PASS |
| | 5 | Tap outside to trigger save | Title persisted on blur | PASS |
| | 6 | Tap body textarea, type text | "This is a smoke test body for W4" entered | PASS |
| | 7 | Tap outside to save body | Body text persisted | PASS |
| | 8 | Tap back link | Returned to `/`, draft title shows "Draft for smoke test W4" | PASS |
| **W5: View Issue Detail** | 1 | Tap issue "Add user authentication" #1 | Navigated to `/issues/mean-weasel/issuectl-test-repo/1` | PASS |
| | 2 | Verify single-column layout | Content stacked vertically | PASS |
| | 3 | Verify title wraps | "Add user authentication" renders correctly | PASS |
| | 4 | Verify metadata row | repo, #1, open, today, priority: normal visible | PASS |
| | 5 | Verify "Ready to launch" card | Card visible with "launch" and "configure" buttons | PASS |
| | 6 | Verify body markdown renders | Description, referenced files, acceptance criteria all rendered | PASS |
| | 7 | Verify comments thread | 3 comments visible and readable | PASS |
| | 8 | Verify comment composer | Textbox and "comment" button at bottom | PASS |
| **W6: Set Priority** | 1 | Tap priority button | PriorityPicker dialog appeared | PASS |
| | 2 | Verify options with >= 44px targets | high/normal/low options at 65px tall each | PASS |
| | 3 | Verify "normal" marked as current | "current" label on normal option | PASS |
| | 4 | Tap "High" | Dialog closed, priority updated to "priority: high" | PASS |
| **W7: Add a Comment** | 1 | Scroll to comment composer | Composer visible at bottom of issue detail | PASS |
| | 2 | Tap textarea | Textbox activated | PASS |
| | 3 | Type "Smoke test comment from W7 mobile run" | Text entered | PASS |
| | 4 | Verify comment button enabled | Button changed from disabled to enabled | PASS |
| | 5 | Tap "comment" button | Comment submitted | PASS |
| | 6 | Verify comment appears in thread | Comment visible, count 3 -> 4 | PASS |
| | 7 | Verify textarea cleared | Textbox empty, button disabled again | PASS |
| **W8: View PR and Merge** | 1 | Navigate to `/?tab=prs`, tap PR #10 | PR detail loaded at `/pulls/mean-weasel/issuectl-test-repo/10` | PASS |
| | 2 | Verify single-column layout | Title, metadata, description, CI, files all visible | PASS |
| | 3 | Verify CI checks and files readable | "no CI checks reported", 1 file +2/-0 shown | PASS |
| | 4 | Tap "merge pull request" | Confirmation: "merge into main?" with yes/cancel | PASS |
| | 5 | Tap "cancel" | Confirmation dismissed, merge button returned | PASS |
| | 6 | Tap "merge" again | Confirmation reappeared | PASS |
| | 7 | Tap "yes, merge" | Merge executed | PASS |
| | 8 | Verify merged banner | Status changed to "merged", "merged successfully" banner shown | PASS |
| **W9: Navigation Drawer** | 1 | Tap menu button ("...") | Drawer dialog appeared | PASS |
| | 2 | Verify drawer overlay with nav links | All Issues, Pull Requests, Quick Create, Settings visible | PASS |
| | 3 | Verify link touch targets >= 44px | All links 52px tall | PASS |
| | 4 | Tap "Settings" | Navigated to `/settings`, drawer closed | PASS |
| | 5 | Open drawer again | Drawer reappeared | PASS |
| | 6 | Tap close button | Drawer dismissed | PASS |
| **W10: Settings** | 1 | Navigate to `/settings` | Settings page loaded | PASS |
| | 2 | Verify all inputs full-width | All form fields span available width | PASS |
| | 3 | Tap "+ Add Repo" | Inline form expanded with repo/path inputs | PASS |
| | 4 | Type repo name | Text entered, "Add Repo" button enabled | PASS |
| | 5 | Cancel add repo | Form collapsed | PASS |
| | 6 | Edit Cache TTL to 600 | Value changed, "Save Settings" enabled | PASS |
| | 7 | Tap "Save Settings" | Settings saved, button returned to disabled | PASS |
| | 8 | Verify value persisted | Cache TTL shows "600" after save | PASS |
| | 9 | Restore TTL to 300 | Value restored and saved | PASS |
| **W11: Quick Create (UI only)** | 1 | Navigate to `/parse` | Quick Create page loaded | PASS |
| | 2 | Verify textarea full-width | Textarea 329px in 393px viewport (full minus padding) | PASS |
| | 3 | Type issue descriptions | Text entered | PASS |
| | 4 | Verify "Parse with Claude" button enables | Button changed from disabled to enabled | PASS |
| | 5 | Skip parse/create (requires Claude CLI) | N/A per instructions | SKIP |

---

## Mobile-Specific Checks

| Check | Result | Status |
|-------|--------|--------|
| Touch targets >= 44px on all rows | Issue rows 78-80px, priority buttons 65px, nav links 52px | PASS |
| No horizontal scroll on `/` | body.scrollWidth == body.clientWidth (387px) | PASS |
| Bottom sheets thumb-reachable (W2, W3, W6) | All dialogs render in lower portion of viewport | PASS |
| Content wraps correctly (W5, W8) | Titles and metadata wrap within viewport width | PASS |
| Keyboard does not obscure inputs (W2, W4) | Input fields remain accessible when focused | PASS |

---

## Write Operation Results

| Operation | Workflow | Outcome |
|-----------|----------|---------|
| Create draft | W2 | "Smoke test draft W2" created in Unassigned | 
| Assign draft to repo | W3 | Draft converted to GitHub issue #11 in mean-weasel/issuectl-test-repo |
| Edit draft title/body | W4 | Title and body updated, auto-save on blur |
| Set priority | W6 | Priority changed from normal to high on issue #1 |
| Post comment | W7 | Comment posted to issue #1 on GitHub, appeared in thread |
| Merge PR | W8 | PR #10 merged successfully, status updated to "merged" |

---

## Summary

| Metric | Value |
|--------|-------|
| Total steps | 63 |
| Passed | 62 |
| Failed | 0 |
| Skipped | 1 (W11 step 5 -- Claude CLI required) |
| Pass rate | **98.4%** (62/63) |

All 11 workflows executed successfully at 393x852 mobile viewport. All previously-skipped write operations (draft creation, assign-to-repo, comment posting, PR merge) completed without errors. No regressions detected. No horizontal scroll issues. Touch targets meet the 44px minimum across all tested interactions.
