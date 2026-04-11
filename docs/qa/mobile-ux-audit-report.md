# Mobile UX Audit Report

**Date:** 2026-04-11
**Viewport:** 393x852 (iPhone 15 Pro)
**App:** issuectl web dashboard at `http://localhost:3847`
**Design system:** Paper (warm cream, ink, forest green accent)

---

## Scorecard: 31/56 (55%)

| Category | Weight | Grade | Pass/Total | Findings |
|----------|--------|-------|------------|----------|
| Touch & Interaction | 2x | FAIL | 3/7 | 4 findings |
| iOS Safari Specific | 1.5x | FAIL | 2/5 | 3 findings |
| iOS Native Feel | 1x | MINOR | 4/6 | 2 findings |
| Viewport & Responsive | 1x | PASS | 6/6 | -- |
| Mobile Typography | 1.5x | MINOR | 6/8 | 2 findings |
| Mobile Form UX | 1.5x | FAIL | 2/6 | 4 findings |
| Interstitials & Overlays | 1.5x | PASS | 4/4 | -- |
| Mobile Accessibility | 2x | MINOR | 5/6 | 1 finding |
| Gestures & Interaction | 0.5x | MINOR | 3/4 | 1 finding |
| Animation & Motion | 0.5x | PASS | 4/4 | -- |

---

## Screen-by-Screen Results

### 1. Home / Issues Tab -- `/` (393x852)

**Screenshot:** `qa-reports/screenshots/mobile-ux-auditor-home-issues-01.png`

| Check | Result | Detail |
|-------|--------|--------|
| Single-column layout | PASS | Max-width centered, no sidebar |
| No horizontal scroll | PASS | docWidth === viewWidth (393px) |
| Issue rows full-width | PASS | All issue links 393px wide |
| Issue row touch target | PASS | Each row 393x79px (well above 44px) |
| Tab touch targets | FAIL | "Issues" tab 55x40px, "Pull requests" tab 99x40px -- height 40px, below 44px minimum |
| Menu button (three dots) | FAIL | 51x31px -- height only 31px, well below 44px |
| FAB button | PASS | 60x60px, border-radius 50%, positioned 30px from bottom-right |
| Section headings visible | PASS | unassigned, in focus, in flight, shipped all render |
| Font stack correct | PASS | Fraunces (23 elements), Inter (60), IBM Plex Mono (21) |
| Design tokens active | PASS | 25 `--paper-*` tokens loaded, correct palette values |

### 2. Navigation Drawer -- `/` (via menu button)

**Screenshot:** `qa-reports/screenshots/mobile-ux-auditor-home-drawer-01.png`

| Check | Result | Detail |
|-------|--------|--------|
| Slides from right | PASS | Drawer appears from right side |
| Leaves backdrop visible | PASS | Drawer x=87px, width=300px, leaves 87px of backdrop visible on left |
| Nav link touch targets | PASS | "All issues" 299x52px, "Quick Create" 299x52px, "Settings" 299x52px -- all above 44px |
| Close button | FAIL | 31x30px -- significantly below 44px minimum |
| Backdrop tap dismisses | PASS | Scrim element with pointer-events:auto closes drawer |
| Escape key dismisses | PASS | Pressing Escape closes the drawer |
| Role=dialog | PASS | Drawer uses `role="dialog"` |

### 3. Pull Requests Tab -- `/?tab=prs`

**Screenshot:** `qa-reports/screenshots/mobile-ux-auditor-prs-tab-01.png`

| Check | Result | Detail |
|-------|--------|--------|
| Tab switches cleanly | PASS | Empty state renders correctly |
| Empty state centered | PASS | Decorative icon + message centered |
| No horizontal scroll | PASS | Content within viewport |

### 4. Issue Detail -- `/issues/mean-weasel/issuectl-test-repo/1`

**Screenshot:** `qa-reports/screenshots/mobile-ux-auditor-issue-detail-01.png`
**Full page:** `qa-reports/screenshots/mobile-ux-auditor-issue-detail-fullpage-02.png`

| Check | Result | Detail |
|-------|--------|--------|
| Single-column layout | PASS | Full-width, no sidebar on mobile |
| Title wraps correctly | PASS | H1 "Add user authentication" at 26px, width 339px, within viewport |
| Metadata wraps | PASS | flex-wrap: wrap on meta row |
| No horizontal overflow | PASS | docWidth === viewWidth |
| Back chevron touch target | FAIL | 55x40px -- height 40px, below 44px |
| Priority button | CRITICAL FAIL | 79x14px -- height is only 14px (padding: 0 in CSS). Extremely difficult to tap on mobile |
| Launch button | FAIL | 105x40px -- height 40px, below 44px |
| Configure button | FAIL | 104x40px -- height 40px, below 44px |
| Comment button | FAIL | 83x31px -- height 31px, below 44px |
| Comment textarea font-size | FAIL | 14.5px -- below 16px, triggers iOS Safari auto-zoom on focus |
| Comment composer sticky | FAIL | position: static -- composer scrolls with page instead of sticking to bottom. Not accessible when keyboard is open |
| Body markdown readable | PASS | Prose wraps within viewport, code blocks contained |
| Comments readable | PASS | Comment bubbles full-width with proper spacing |

### 5. Create Draft Bottom Sheet -- `/` (via FAB)

**Screenshot:** `qa-reports/screenshots/mobile-ux-auditor-create-draft-sheet-01.png`

| Check | Result | Detail |
|-------|--------|--------|
| Sheet slides up from bottom | PASS | position: fixed, bottom: 0, border-radius 24px top corners |
| Thumb-reachable | PASS | Sheet top at y=574px (67% down viewport), well within thumb zone |
| Title input font-size | PASS | 26px -- above 16px threshold, no iOS zoom |
| Title input touch target | PASS | 331x51px -- well above 44px |
| Cancel button | FAIL | 83x40px -- height 40px, below 44px |
| Save Draft button | FAIL | 106x40px -- height 40px, below 44px |
| Max-height cap | PASS | max-height: 85vh prevents full-screen takeover |
| Grab handle present | PASS | 44x4px handle bar for visual affordance |

### 6. Settings -- `/settings`

**Screenshot:** `qa-reports/screenshots/mobile-ux-auditor-settings-fullpage-01.png`

| Check | Result | Detail |
|-------|--------|--------|
| No horizontal overflow | PASS | Content within viewport |
| Input font-size | CRITICAL FAIL | All 6 form inputs at 13px -- every one triggers iOS Safari auto-zoom on focus |
| Input height | FAIL | All inputs 34px tall -- below 44px minimum touch target |
| "Set path" button | FAIL | 59x24px -- 24px height, severely undersized |
| "Remove" button | FAIL | 58x24px -- 24px height, severely undersized |
| "+ Add Repo" button | FAIL | 83x25px -- 25px height, severely undersized |
| "Save Settings" button | FAIL | 127x40px -- height 40px, below 44px |
| Delete (worktree) buttons | FAIL | 50x24px -- 24px height, severely undersized. Also positioned close together, risk of accidental taps |
| Two-column form layout | MINOR | Side-by-side fields at 156px width each -- narrow but functional |
| Autocomplete attributes | MISSING | No inputs use autocomplete attribute |

### 7. Quick Create -- `/parse`

**Screenshot:** `qa-reports/screenshots/mobile-ux-auditor-parse-01.png`

| Check | Result | Detail |
|-------|--------|--------|
| No horizontal overflow | PASS | Content within viewport |
| Textarea full-width | PASS | 329px wide (within 393px viewport minus padding) |
| Textarea font-size | FAIL | 13px -- triggers iOS Safari auto-zoom on focus |
| "Parse with Claude" button | FAIL | 159x40px -- height 40px, below 44px |

---

## Findings Detail (prioritized by severity)

### CRITICAL

1. **`[D]` Priority button on issue detail is 79x14px** -- The `priority: normal` trigger button has zero padding (`padding: 0` in PriorityPicker.module.css `.trigger` class). At 14px tall, this is effectively untappable on mobile. Users need to tap a 14px-high inline text link to change priority. Needs minimum `padding: 15px 8px` to reach 44px.

2. **`[D]` All 6 Settings form inputs trigger iOS Safari auto-zoom** -- Every input in SettingsForm uses `font-size: 13px` (set in `.input` class). iOS Safari auto-zooms the viewport when focusing any input below 16px. This creates a jarring, disorienting zoom-in on every field tap with no way to zoom back out except double-tap. Fix: increase `.input` font-size to 16px.

3. **`[D]` Settings page buttons are 24px tall** -- "Set path" (59x24px), "Remove" (58x24px), "+ Add Repo" (83x25px), and "Delete" (50x24px) buttons are roughly half the 44px iOS HIG minimum. The Delete buttons are destructive actions positioned close together, compounding the accidental-tap risk.

### MAJOR

4. **`[D]` Comment textarea triggers iOS Safari auto-zoom** -- The comment composer textarea in CommentComposer.module.css uses `font-size: 14.5px`, which is below the 16px threshold. Every time a user taps to write a comment, the page zooms in unexpectedly. Fix: set `.textarea` font-size to 16px.

5. **`[D]` Quick Create textarea triggers iOS Safari auto-zoom** -- The parse page textarea uses `font-size: 13px`. Same zoom issue as above.

6. **`[D]` Comment composer is not sticky** -- The comment composer at the bottom of issue detail has `position: static`. When a user scrolls to the bottom and taps the textarea, the keyboard will push it off-screen or require manual scrolling. Mobile comment composers should use `position: sticky; bottom: 0` or equivalent to remain above the keyboard.

7. **`[D]` Launch and Configure buttons are 40px tall** -- Both action buttons in the "Ready to launch" card are 40px, 4px below the 44px minimum. The `.btn` class uses `padding: 10px 20px` which produces ~40px height at 14px font-size. Fix: increase base padding to `12px 20px` or add `min-height: 44px`.

### MINOR

8. **`[D]` Tab links are 40px tall** -- The "Issues" and "Pull requests" tabs measure 40px in height. While they have adequate width (55px and 99px respectively), the height is 4px below the 44px minimum. Fix: increase `.tab` padding from `10px 2px 12px` to `12px 2px 14px`.

9. **`[D]` Navigation menu button (three dots) is 51x31px** -- The `.menuBtn` class uses `padding: 4px 8px` which produces a 31px-tall touch target. This is a primary navigation entry point. Fix: increase padding to `padding: 10px 12px` for minimum 44px height.

10. **`[D]` Drawer close button is 31x30px** -- The X button to close the navigation drawer is 30px tall, well below the 44px minimum.

11. **`[D]` Comment submit button is 83x31px** -- The "comment" button in the composer footer is only 31px tall.

12. **`[D]` No viewport-fit=cover in meta tag** -- The viewport meta is `width=device-width, initial-scale=1` without `viewport-fit=cover`. On iPhones with the notch/Dynamic Island, the app won't properly account for safe area insets. No `env(safe-area-inset-*)` CSS usage detected in any stylesheet.

13. **`[D]` No safe-area-inset padding on FAB or bottom sheets** -- The FAB is positioned 30px from bottom, which may overlap with the iPhone home indicator. Bottom sheets should use `padding-bottom: env(safe-area-inset-bottom)` to prevent overlap.

14. **`[H]` Small font sizes below 12px** -- The tab count badges (10px), section counts (10px), repo name chips (10.5px), and metadata separators (11px) are below the generally recommended 12px minimum for mobile readability. While these are secondary information, 10px text is very difficult to read on mobile.

15. **`[H]` No back-to-top mechanism on long lists** -- The home page with 10+ issues requires significant scrolling. No sticky header, scroll-to-top button, or pull-to-refresh pattern is present.

16. **`[H]` Settings page lacks form input labels as `<label>` elements** -- Form labels are rendered as plain `<div>` elements with the `.label` class rather than proper `<label>` elements with `for` attributes. This hurts form accessibility and prevents iOS users from tapping the label to focus the input.

17. **`[J]` Missing autocomplete attributes on Settings inputs** -- Fields like "Application" and "Branch Pattern" could benefit from `autocomplete` hints to reduce typing on mobile.

---

## Cross-Screen Consistency

| Pattern | Consistent? | Notes |
|---------|-------------|-------|
| Touch target sizing | Inconsistent | Issue rows (79px) vs. buttons (24-40px) vs. FAB (60px) -- wide variation |
| Typography scale | Consistent | Fraunces/Inter/IBM Plex Mono used correctly throughout |
| Color tokens | Consistent | All 25 `--paper-*` tokens used properly, no hardcoded colors |
| Navigation pattern | Consistent | Drawer from right on all pages |
| Horizontal overflow | Consistent PASS | No overflow on any screen |
| iOS zoom triggers | Consistently FAILING | Every form input below 16px across all screens |

---

## Category Breakdown

### Touch & Interaction (2x weight) -- FAIL (3/7)

- [x] Issue rows >= 44px
- [x] FAB >= 44px
- [x] Drawer nav links >= 44px
- [ ] Tab links >= 44px (40px)
- [ ] Menu button >= 44px (31px)
- [ ] Priority trigger >= 44px (14px)
- [ ] Settings buttons >= 44px (24px)

### iOS Safari Specific (1.5x weight) -- FAIL (2/5)

- [x] Viewport meta tag present
- [x] No horizontal scroll
- [ ] viewport-fit=cover missing
- [ ] safe-area-inset-* not used
- [ ] Form inputs trigger zoom (all below 16px)

### iOS Native Feel (1x weight) -- MINOR (4/6)

- [x] Bottom sheets slide from bottom
- [x] Drawer slides from right
- [x] Serif/italic typography gives distinctive character
- [x] Warm color palette with good contrast
- [ ] No pull-to-refresh or momentum-scroll affordances
- [ ] Comment composer not sticky (native apps fix composer above keyboard)

### Viewport & Responsive (1x weight) -- PASS (6/6)

- [x] Single-column layout at 393px
- [x] max-width: 900px with auto margins
- [x] No horizontal overflow (all 5 screens)
- [x] Content padding consistent (24px sides)
- [x] Media query breakpoint at 768px properly gates desktop features
- [x] Desktop-only elements (hover actions, date display) correctly hidden

### Mobile Typography (1.5x weight) -- MINOR (6/8)

- [x] Three font families correctly loaded and applied
- [x] H1 titles readable at 26px
- [x] Body text at 16-17px
- [x] Monospace used for identifiers
- [x] Line-heights adequate (1.3-1.55)
- [x] No text overflow or clipping
- [ ] Tab count badges at 10px (below 12px floor)
- [ ] Metadata text at 10.5-11px (borderline readability)

### Mobile Form UX (1.5x weight) -- FAIL (2/6)

- [x] Create Draft title input at 26px (no zoom)
- [x] Create Draft input full-width
- [ ] Comment textarea at 14.5px (triggers zoom)
- [ ] Settings inputs at 13px (triggers zoom)
- [ ] Quick Create textarea at 13px (triggers zoom)
- [ ] No autocomplete attributes on any input

### Interstitials & Overlays (1.5x weight) -- PASS (4/4)

- [x] Bottom sheets use role="dialog"
- [x] Scrim has pointer-events for dismiss
- [x] Sheets capped at max-height: 85vh
- [x] Drawer leaves visible backdrop (87px)

### Mobile Accessibility (2x weight) -- MINOR (5/6)

- [x] aria-label on FAB, menu button, action buttons
- [x] Heading hierarchy (h1 > h2 > h3)
- [x] Link text is descriptive (issue titles)
- [x] Color contrast adequate (ink #1a1712 on cream #f3ecd9)
- [x] Focus styles present on inputs
- [ ] Form labels not using `<label>` elements with `for` attributes

### Gestures & Interaction (0.5x weight) -- MINOR (3/4)

- [x] Swipe-to-assign rows present in DOM (SwipeRow component exists)
- [x] Button press feedback (translateY(1px) on :active)
- [x] Sheet grab handle for visual drag affordance
- [ ] No visible active/pressed state on issue rows (only hover background, which doesn't apply on touch)

### Animation & Motion (0.5x weight) -- PASS (4/4)

- [x] Transition on button opacity (120ms ease)
- [x] Transition on input border-color (150ms)
- [x] Shadow tokens for depth (sheet, drawer, modal)
- [x] No janky animations observed

---

## Priority Fix List (recommended order)

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| P0 | Set all form input `font-size` to 16px to prevent iOS zoom | Low | Eliminates disorienting zoom on every input focus |
| P0 | Add `min-height: 44px` to all interactive Button variants | Low | Fixes 15+ undersized touch targets across all screens |
| P0 | Add padding to PriorityPicker `.trigger` (currently 14px tall) | Trivial | Makes priority selection possible on mobile |
| P1 | Make comment composer sticky (`position: sticky; bottom: 0`) | Medium | Keeps composer accessible when keyboard is open |
| P1 | Add `viewport-fit=cover` and `env(safe-area-inset-*)` CSS | Low | Proper iPhone notch/home indicator handling |
| P1 | Increase `.menuBtn` padding for 44px min height | Trivial | Primary navigation entry point needs adequate target |
| P2 | Convert form labels to proper `<label>` elements | Low | Accessibility and usability improvement |
| P2 | Add `autocomplete` attributes to Settings inputs | Trivial | Reduces mobile typing |
| P2 | Add `:active` styles for issue rows on touch devices | Low | Provides immediate tap feedback on touch |
| P3 | Increase minimum font size for metadata to 12px | Trivial | Readability improvement |

---

## Screenshots Index

| File | Description |
|------|-------------|
| `qa-reports/screenshots/mobile-ux-auditor-home-issues-01.png` | Home page, Issues tab, viewport |
| `qa-reports/screenshots/mobile-ux-auditor-home-issues-fullpage-01.png` | Home page, Issues tab, full page |
| `qa-reports/screenshots/mobile-ux-auditor-home-drawer-01.png` | Navigation drawer open |
| `qa-reports/screenshots/mobile-ux-auditor-prs-tab-01.png` | Pull Requests tab (empty state) |
| `qa-reports/screenshots/mobile-ux-auditor-issue-detail-01.png` | Issue detail, viewport |
| `qa-reports/screenshots/mobile-ux-auditor-issue-detail-fullpage-02.png` | Issue detail, full page |
| `qa-reports/screenshots/mobile-ux-auditor-settings-fullpage-01.png` | Settings page, full page |
| `qa-reports/screenshots/mobile-ux-auditor-parse-01.png` | Quick Create page |
| `qa-reports/screenshots/mobile-ux-auditor-create-draft-sheet-01.png` | Create Draft bottom sheet |
