# List UX Redesign — Design Spec

**Date:** 2026-04-19
**Status:** Approved

## Summary

Rename the list sections from abstract metaphors (In Focus / In Flight / Shipped)
to clear labels (Open / Running / Closed), widen the desktop layout, add
hover-to-reveal Launch buttons on desktop, add swipe-to-reveal actions on mobile,
and visually distinguish issues with active Claude Code sessions.

## Section rename and reorder

| Old name | New name | Meaning |
|---|---|---|
| unassigned | **drafts** (unchanged) | Local drafts not yet on GitHub |
| in_focus | **open** | Open issues ready to work on |
| in_flight | **running** | Issues with an active Claude Code session |
| shipped | **closed** | Closed issues |

**Display order:** Drafts → Open → Running → Closed

**Type changes:**

```typescript
type Section = "unassigned" | "open" | "running" | "closed";

type UnifiedList = {
  unassigned: DraftListItem[];
  open: IssueListItem[];
  running: IssueListItem[];
  closed: IssueListItem[];
};
```

**URL param migration:** `?section=in_focus` silently maps to `?section=open`,
`?section=in_flight` → `?section=running`, `?section=shipped` → `?section=closed`.
Old bookmarks continue to work.

**Tab labels:** "drafts", "open", "running" (green accent background), "closed".

## Desktop layout — wider container

- `max-width` changes from `900px` to `1200px`
- Internal padding adjustments as needed to fill the wider space naturally
- All other desktop layout patterns (top bar, tabs, chip row) remain the same

## Desktop actions — hover-to-reveal Launch

**Open issue rows:**
- Default: row shows title + metadata, no action button
- Hover: subtle background highlight + "Launch" button fades in on the right
- Clicking "Launch" opens the `LaunchModal` (same as the issue detail page)
- Clicking the row itself navigates to the issue detail page

**Running issue rows:**
- "Open Terminal" button is always visible (not hover-gated)
- No "Launch" button — suppressed by active deployment
- Clicking "Open Terminal" navigates to the issue detail page (terminal
  panel lives in the issue detail context)
- Clicking the row itself also navigates to the issue detail page

**Closed / Draft rows:**
- No hover actions — clicking navigates to detail page

## Mobile actions — swipe-to-reveal

**New component: `SwipeRow`**

A wrapper around `ListRow` that handles touch gestures for swipe-to-reveal.

**Behavior:**
- Track touch start X position
- If deltaX < -60px (swipe left), translate row content left to reveal
  action buttons behind it on the right side
- Touch end: if past threshold, snap open; otherwise snap back
- Only one row can be open at a time — opening a new one closes the previous
- Tap elsewhere or swipe right closes the revealed actions

**Action buttons revealed (behind the row):**
- **Open issues:** "Launch" (green accent bg) + "Re-assign" (muted bg)
- **Running issues:** No swipe — "Open Terminal" is always visible inline
  below the metadata
- **Closed issues:** No swipe actions
- **Drafts:** No swipe actions

**Desktop:** `SwipeRow` is disabled — touch handlers don't register on
non-touch devices. Hover-to-reveal handles desktop.

## Running section visual treatment

**Row indicators:**
- Filled green dot (vs open circle for open issues)
- "active" label in metadata, styled in green (`--paper-accent`)
- "Open Terminal" button always visible (mobile: below metadata, desktop: inline right)

**Section tab:**
- Green accent background (`--paper-accent` bg, light text) to visually
  distinguish from other tabs

**Launch prevention:**
- Running issues have no Launch button (desktop hover or mobile swipe)
- The launch modal cannot be opened for issues with a live deployment
- Already enforced server-side; UI now also prevents it

## What changes

### New components

| Component | Responsibility |
|---|---|
| `SwipeRow` | Touch gesture wrapper for mobile swipe-to-reveal |

### Modified components

| Component | Change |
|---|---|
| `ListRow` | Hover Launch button (desktop), "Open Terminal" for running rows, running dot indicator |
| `ListSection` | Section header uses new names |
| `ListContent` | Renders sections in new order |
| `List` | Section tabs with new names + green accent for running tab |
| `groupIntoSections` | New section string values (`open`, `running`, `closed`) |
| `page.tsx` (app) | `SECTIONS` constant, URL param migration for old values |
| Types (`types.ts`) | `Section` union, `UnifiedList` field names |

### No new DB or core logic changes

The grouping logic in `groupIntoSections` already separates issues by
deployment status. This is a rename of the string values + UI enhancement.
No schema changes, no new server actions, no process management changes.

## Known limitations

- **"Open Terminal" from list navigates to issue page** — the terminal panel
  lives in the issue detail context. Opening it directly from the list would
  require lifting terminal state to the list level. Navigate-then-open is
  simpler for v1.
- **Swipe gestures require touch** — desktop uses hover instead. No
  drag-with-mouse support for swipe actions.
