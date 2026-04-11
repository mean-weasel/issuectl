# Mobile Workflows (viewport: 393×852)

> Used by QA skills (smoke-tester, mobile-ux-auditor, adversarial-breaker) to verify the app at mobile breakpoints. All interactions use touch — no hover states.

## Workflow 1: Browse Issues and Switch Tabs

**Route:** `/`

1. Navigate to `/` at 393×852
2. Verify single-column layout, no sidebar, max-width centered
3. Verify four sections visible: Unassigned, In Focus, In Flight, Shipped
4. Verify issue rows are full-width, touch targets ≥ 44px tall
5. Tap "Pull Requests" tab
6. Verify tab switches, PR rows render with branch and stats
7. Tap "Issues" tab
8. Verify return to issues view

**Expected:** Full-width layout, no horizontal scroll, tabs switch cleanly, rows are easily tappable.

---

## Workflow 2: Create a Draft

**Route:** `/` → CreateDraftSheet

1. Navigate to `/`
2. Tap the FAB (bottom-right)
3. Verify bottom sheet slides up, covering lower portion of screen
4. Verify keyboard opens when title input receives focus
5. Verify sheet doesn't get obscured by keyboard
6. Type "Mobile draft test"
7. Tap "Save Draft"
8. Verify sheet dismisses and draft appears in Unassigned

**Expected:** Bottom sheet is reachable with thumb, keyboard doesn't obscure input, successful creation.

---

## Workflow 3: Swipe to Assign a Draft

**Route:** `/`

1. Navigate to `/`
2. Find a draft row in Unassigned section
3. Swipe left on the draft row (touch start → move left ≥ threshold → release)
4. Verify assign action is revealed or AssignSheet opens
5. Verify repo list displays in bottom sheet
6. Tap a repo
7. Verify loading state, then sheet closes
8. Verify draft moves out of Unassigned

**Expected:** Swipe gesture triggers assign flow, touch feedback is immediate, sheet is thumb-reachable.

---

## Workflow 4: View and Edit a Draft (Mobile)

**Route:** `/drafts/[draftId]`

1. From `/`, tap a draft row
2. Verify navigation to draft detail
3. Verify title input is full-width
4. Tap title to edit — verify keyboard opens
5. Change title text, tap outside input area
6. Verify "saved" indicator appears
7. Scroll down to body textarea
8. Tap to edit, type body text, tap outside
9. Verify save confirmation
10. Tap back link

**Expected:** Inputs are full-width, keyboard doesn't break layout, auto-save works on blur.

---

## Workflow 5: View Issue Detail (Mobile)

**Route:** `/issues/[owner]/[repo]/[number]`

1. From `/`, tap an issue row
2. Verify issue detail loads in single-column layout
3. Verify title wraps correctly (no overflow)
4. Verify metadata row wraps if needed (state chip, labels, age)
5. Verify "Ready to launch" card is visible and full-width
6. Scroll down — verify body markdown renders within viewport width
7. Verify comments thread is readable
8. Verify comment composer sticks to bottom

**Expected:** No horizontal overflow, content is readable, all elements accessible by scrolling.

---

## Workflow 6: Set Priority (Mobile)

**Route:** `/issues/[owner]/[repo]/[number]`

1. Navigate to `/issues/[owner]/[repo]/[number]`
2. Tap priority metadata button
3. Verify PriorityPicker sheet slides up from bottom
4. Verify options (High/Normal/Low) have ≥ 44px touch targets
5. Tap "High"
6. Verify sheet closes and priority updates

**Expected:** Bottom sheet is thumb-friendly, options are easily tappable.

---

## Workflow 7: Add a Comment (Mobile)

**Route:** `/issues/[owner]/[repo]/[number]`

1. Navigate to `/issues/[owner]/[repo]/[number]`
2. Scroll to comment composer at bottom
3. Tap textarea — verify keyboard opens
4. Verify composer isn't obscured by keyboard (should remain visible above keyboard)
5. Type "Mobile comment test"
6. Tap send button
7. Verify comment appears in thread
8. Verify keyboard dismisses

**Expected:** Composer remains accessible when keyboard is open, comment posts successfully.

---

## Workflow 8: View PR and Merge (Mobile)

**Route:** `/pulls/[owner]/[repo]/[number]`

1. From `/?tab=prs`, tap a PR row
2. Verify PR detail loads in single-column layout
3. Verify CI checks and files changed are readable
4. Tap "merge" button
5. Verify confirmation buttons appear with adequate touch targets
6. Tap "cancel"
7. Verify confirmation disappears, merge button returns
8. Tap "merge" again, then tap "yes, merge →"
9. Verify merged banner appears

**Expected:** Merge confirmation buttons are large enough to tap accurately, cancel path works, no accidental taps.

---

## Workflow 9: Navigation Drawer (Mobile)

**Route:** `/`

1. Navigate to `/`
2. Tap the menu button (···) in top bar
2. Verify drawer slides in from right, overlays content
3. Verify drawer width is appropriate (not full-screen, leaves visible backdrop)
4. Verify all nav links have ≥ 44px touch targets
5. Tap "Settings"
6. Verify navigation to `/settings` and drawer closes
7. Open drawer again, tap backdrop area
8. Verify drawer closes

**Expected:** Drawer is easily dismissible, links are tappable, backdrop tap closes.

---

## Workflow 10: Settings (Mobile)

**Route:** `/settings`

1. Navigate to `/settings`
2. Verify all form inputs are full-width
3. Tap "+ Add Repo" — verify inline form expands
4. Verify keyboard doesn't break layout when typing repo name
5. Submit repo
6. Scroll to settings form
7. Edit a field, tap "Save Settings"
8. Verify toast notification appears
9. Verify toast doesn't obscure content
10. Tap delete on a repo row
11. Verify repo removed from list

**Expected:** Forms work at mobile width, keyboard interactions are smooth, toasts are visible but non-blocking, repo deletion works.

---

## Workflow 11: Quick Create (Mobile)

**Route:** `/parse`

1. Navigate to `/parse` via drawer
2. Verify textarea is full-width
3. Type issue descriptions
4. Tap "Parse with Claude"
5. Verify review cards are single-column, readable
6. Verify toggle and edit controls are tappable
7. Tap "Create"
8. Verify results display correctly

**Expected:** Multi-step flow works at mobile width, cards don't overflow, controls are accessible.

---

## Mobile-Specific Checks

| Check | Workflows |
|---|---|
| Touch targets ≥ 44px | All |
| No horizontal scroll | All |
| Keyboard doesn't obscure inputs | W2, W4, W7, W10 |
| Bottom sheets thumb-reachable | W2, W3, W6 |
| Swipe gestures work | W3 |
| Content wraps correctly | W5, W8, W11 |
| Sticky composer above keyboard | W7 |

## Route Coverage

| Route | Workflows |
|---|---|
| `/` | 1, 2, 3 |
| `/drafts/[draftId]` | 4 |
| `/issues/[owner]/[repo]/[number]` | 5, 6, 7 |
| `/pulls/[owner]/[repo]/[number]` | 8 |
| `/parse` | 11 |
| `/settings` | 10 |

## CRUD Coverage

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| Draft | W2 | W4 | W4 | W3 (assign converts) |
| Issue | W3 (via assign), W11 | W1, W5 | W7 (comment) | — |
| PR | — | W1, W8 | W8 (merge) | — |
| Priority | — | W6 | W6 | — |
| Repo (tracked) | W10 | W10 | W10 | W10 |
| Settings | — | W10 | W10 | — |
