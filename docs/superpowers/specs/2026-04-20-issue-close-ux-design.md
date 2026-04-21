# Issue Close UX & FAB Sizing

**Date:** 2026-04-20
**Status:** Approved
**Scope:** Web package — list view, detail view, server actions, core close flow

## Problem

1. The issue list rows display non-interactive checkboxes that waste horizontal space and confuse mobile users (tapping the checkbox navigates to the issue, not toggling state).
2. There is no way to close an issue from the list view — users must navigate into the detail page.
3. GitHub's "comment and close" pattern is not supported — the current close modal is a bare confirmation with no comment field.
4. The mobile FAB (create button) is slightly too small at 48px for comfortable tap targets.

## Design

### 1. Remove checkboxes from list rows

Remove the `Checkbox` component from `ListRow` for both issue rows and draft rows. The section grouping (open / running / closed / drafts) already communicates state — the checkbox is redundant visual decoration.

**Changes:**
- Remove `<Checkbox>` render and the wrapping `<span className={styles.check}>` from `ListRow.tsx`
- Reduce `rowLink` left padding from 58px to 20px (reclaiming space for the title)
- Remove `.check` positioning styles from `ListRow.module.css`
- Remove `Checkbox` import (verify no other consumers in the list context)

### 2. Bidirectional swipe on open & running rows

Extend the existing `SwipeRow` component to support both directions:

| Direction | Gesture | Reveals | Sections | Color |
|-----------|---------|---------|----------|-------|
| Swipe left | Existing | "Launch" button (right side) | open only | `--paper-ink` (dark) |
| Swipe right | New | "Close" button (left side) | open + running | `--paper-accent-danger` / red (#c9553d) |

**Behavior:**
- Only one direction can be revealed at a time — swiping the opposite direction dismisses the current reveal before opening the other side.
- Closed rows: no swipe in either direction (no wrapper).
- Running rows: close only (no launch — session is already active).
- The swipe threshold remains at 60px.
- Desktop (≥768px, hover): swipe is disabled; actions remain hover-revealed inline buttons.

**SwipeRow API change:**
```tsx
type Props = {
  children: ReactNode;
  onLaunch?: () => void;   // swipe-left action (existing)
  onClose?: () => void;    // swipe-right action (new)
  disabled?: boolean;
};
```

### 3. Close confirmation modal with optional comment

Replace the current bare `ConfirmDialog` for closing with a richer modal that includes an optional comment field. This modal is used from both the list swipe and the detail page action sheet.

**UI:**
- Title: "Close Issue"
- Optional textarea: placeholder "Add a closing comment…", no minimum length
- Buttons: "Cancel" (secondary) and "Close Issue" (danger/primary)
- Pending state: "Closing…" on the confirm button, inputs disabled
- Error state: inline error message below the textarea

**Component:** New `CloseIssueModal` component (or extend `ConfirmDialog` with a `children` slot for the textarea). Recommendation: dedicated `CloseIssueModal` since the comment + sequencing logic is specific to this action.

### 4. Close flow (async, multi-step)

The server action signature gains an optional `comment` parameter:

```typescript
export async function closeIssue(
  owner: string,
  repo: string,
  number: number,
  comment?: string,
): Promise<{ success: true; cacheStale?: true } | { success: false; error: string }>
```

**Sequence:**
1. If `comment` is provided and non-empty, call `addComment(octokit, owner, repo, number, comment)` via `withAuthRetry`.
2. If the comment call fails, **abort** — return error. Do not close the issue without the user's intended comment.
3. If comment succeeded (or was not provided), call `coreCloseIssue(octokit, owner, repo, number)` via `withAuthRetry`.
4. Clear cache keys: `issue-detail:{owner}/{repo}#{number}` and `issues:{owner}/{repo}`.
5. Revalidate the page path.

**Running rows (active session):** The existing behavior is preserved — the caller (`IssueActionSheet` or the new list-level handler) ends the active session before invoking `closeIssue`. The `closeIssue` action itself does not manage sessions.

**Optimistic UI:** The swipe row snaps back when the close button is tapped (the modal takes over). On success: toast ("Issue closed") + navigate to `/?section=closed`. On failure: error in the modal, user can retry or cancel.

### 5. FAB size increase (mobile)

Increase the mobile FAB from 48px to 52px for a more comfortable tap target.

**Changes to `Fab.module.css`:**
```css
@media (max-width: 767px) {
  .fab {
    width: 52px;    /* was 48px */
    height: 52px;   /* was 48px */
    font-size: 30px; /* was 28px */
  }
}
```

No other FAB properties change. Desktop FAB remains hidden.

## Out of scope

- Reopening closed issues from the app (can be done from GitHub)
- Comment field on reassign (auto-generated cross-reference is sufficient)
- Batch-close multiple issues
- Swipe gestures on desktop

## Dependencies

- `addComment` already exists in `@issuectl/core` (`packages/core/src/github/issues.ts`)
- `closeIssue` server action already exists (`packages/web/lib/actions/issues.ts`)
- `SwipeRow` component already exists with left-swipe infrastructure
- `withAuthRetry` handles token refresh for both API calls

## Testing

| Layer | What to test |
|-------|-------------|
| Unit (core) | `closeIssue` with comment parameter posts comment then closes |
| Unit (core) | `closeIssue` aborts if comment post fails |
| Integration (web) | Server action with/without comment |
| E2E (Playwright) | Swipe-right on mobile viewport reveals close button |
| E2E (Playwright) | Close modal with comment submits and navigates |
| E2E (Playwright) | Close modal without comment still works |
| E2E (Playwright) | FAB renders at 52px on mobile viewport |
