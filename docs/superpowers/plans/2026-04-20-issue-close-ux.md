# Issue Close UX & FAB Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add swipe-to-close on the issue list, replace bare close confirmation with a comment-enabled modal, remove decorative checkboxes from rows, and bump the mobile FAB size.

**Architecture:** The changes span three layers: (1) server action update to accept an optional closing comment, (2) a new `CloseIssueModal` client component that replaces the bare `ConfirmDialog` for closing, and (3) `SwipeRow`/`ListRow` modifications for bidirectional swipe and checkbox removal. Each task produces working, testable code independently.

**Tech Stack:** Next.js Server Actions, React client components, CSS Modules, Octokit (`addComment` + `closeIssue` in core).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/web/components/paper/Fab.module.css` | Modify | Increase mobile FAB from 48→52px |
| `packages/web/lib/actions/issues.ts` | Modify | Add optional `comment` param to `closeIssue` server action |
| `packages/web/components/ui/CloseIssueModal.tsx` | Create | Modal with optional comment textarea + close confirmation |
| `packages/web/components/ui/CloseIssueModal.module.css` | Create | Styles for the new modal |
| `packages/web/components/list/SwipeRow.tsx` | Modify | Add right-swipe (onClose) support |
| `packages/web/components/list/SwipeRow.module.css` | Modify | Add left-side close button styles |
| `packages/web/components/list/ListRow.tsx` | Modify | Remove Checkbox, add onClose prop, wire SwipeRow for close |
| `packages/web/components/list/ListRow.module.css` | Modify | Remove .check styles, reduce left padding |
| `packages/web/components/list/ListSection.tsx` | Modify | Thread onClose prop |
| `packages/web/components/list/ListContent.tsx` | Modify | Add CloseIssueModal state + onClose handler |
| `packages/web/components/detail/IssueActionSheet.tsx` | Modify | Use CloseIssueModal instead of ConfirmDialog for close |

---

### Task 1: FAB Size Increase

**Files:**
- Modify: `packages/web/components/paper/Fab.module.css:31-38`

- [ ] **Step 1: Update FAB dimensions**

In `packages/web/components/paper/Fab.module.css`, change the mobile media query:

```css
@media (max-width: 767px) {
  .fab {
    width: 52px;
    height: 52px;
    font-size: 30px;
    right: 20px;
    bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS (CSS-only change, no type impact)

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/paper/Fab.module.css
git commit -m "fix: increase mobile FAB from 48px to 52px for better tap target"
```

---

### Task 2: Update `closeIssue` Server Action to Accept Optional Comment

**Files:**
- Modify: `packages/web/lib/actions/issues.ts:137-162`

- [ ] **Step 1: Add `comment` parameter and comment-first logic**

Replace the existing `closeIssue` function in `packages/web/lib/actions/issues.ts`:

```typescript
export async function closeIssue(
  owner: string,
  repo: string,
  number: number,
  comment?: string,
): Promise<{ success: true; cacheStale?: true } | { success: false; error: string }> {
  if (!owner || !repo || !Number.isFinite(number) || number <= 0) {
    return { success: false, error: "Valid owner, repo, and issue number are required" };
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return { success: false, error: "Repository is not tracked" };
    }

    // Post closing comment first — abort if this fails so the issue
    // isn't closed without the user's intended comment.
    if (comment && comment.trim()) {
      await withAuthRetry((octokit) =>
        coreAddComment(octokit, owner, repo, number, comment.trim()),
      );
    }

    await withAuthRetry((octokit) =>
      coreCloseIssue(octokit, owner, repo, number),
    );
    clearCacheKey(db, `issue-detail:${owner}/${repo}#${number}`);
    clearCacheKey(db, `issues:${owner}/${repo}`);
  } catch (err) {
    console.error("[issuectl] Failed to close issue:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
  const { stale } = revalidateSafely(`/issues/${owner}/${repo}/${number}`, "/");
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}
```

- [ ] **Step 2: Add import for `addComment`**

At the top of `packages/web/lib/actions/issues.ts`, add `addComment` to the core import:

```typescript
import {
  getDb,
  getRepo,
  getRepoById,
  createIssue as coreCreateIssue,
  updateIssue as coreUpdateIssue,
  closeIssue as coreCloseIssue,
  addComment as coreAddComment,
  reassignIssue as coreReassignIssue,
  addLabel as coreAddLabel,
  removeLabel as coreRemoveLabel,
  clearCacheKey,
  withAuthRetry,
  withIdempotency,
  DuplicateInFlightError,
  formatErrorForUser,
  type ReassignResult,
} from "@issuectl/core";
```

Note: The `addComment` exported from `@issuectl/core` is the one in `packages/core/src/github/issues.ts` which takes `(octokit, owner, repo, number, body)`. Verify this is the correct signature — the data-layer version in `packages/core/src/data/comments.ts` takes `(db, octokit, ...)` and also clears comment caches. Use the data-layer version if it's the one exported from the index. Check: `grep "addComment" packages/core/src/index.ts`.

If the exported `addComment` is the data-layer version (takes `db` as first param), use:
```typescript
const db = getDb();
// ... (db already declared above)
await withAuthRetry((octokit) =>
  coreAddComment(db, octokit, owner, repo, number, comment.trim()),
);
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Run existing tests**

Run: `pnpm --filter @issuectl/core test`
Expected: All existing tests pass (we didn't change core, just the server action)

- [ ] **Step 5: Commit**

```bash
git add packages/web/lib/actions/issues.ts
git commit -m "feat: add optional closing comment to closeIssue server action"
```

---

### Task 3: Create `CloseIssueModal` Component

**Files:**
- Create: `packages/web/components/ui/CloseIssueModal.tsx`
- Create: `packages/web/components/ui/CloseIssueModal.module.css`

- [ ] **Step 1: Create the CSS module**

Create `packages/web/components/ui/CloseIssueModal.module.css`:

```css
.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  font-size: 14px;
  color: var(--paper-ink-soft);
  line-height: 1.5;
  margin: 0;
}

.textarea {
  width: 100%;
  min-height: 80px;
  padding: 10px 12px;
  border: 1px solid var(--paper-line);
  border-radius: var(--paper-radius-sm);
  font-family: var(--paper-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--paper-ink);
  background: var(--paper-bg);
  resize: vertical;
}

.textarea:focus {
  outline: none;
  border-color: var(--paper-accent);
  box-shadow: 0 0 0 2px var(--paper-accent-soft);
}

.textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  margin: 0;
  font-size: 12px;
  color: var(--paper-brick);
}

.danger {
  background: var(--paper-brick);
  color: var(--paper-bg);
  border-color: var(--paper-brick);
}

.danger:hover {
  background: #e5443c;
}
```

- [ ] **Step 2: Create the component**

Create `packages/web/components/ui/CloseIssueModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import styles from "./CloseIssueModal.module.css";

type Props = {
  issueNumber: number;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
  isPending?: boolean;
  error?: string;
};

export function CloseIssueModal({
  issueNumber,
  onConfirm,
  onCancel,
  isPending,
  error,
}: Props) {
  const [comment, setComment] = useState("");

  return (
    <Modal
      title="Close Issue"
      width={480}
      onClose={onCancel}
      disabled={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onConfirm(comment)}
            disabled={isPending}
            className={styles.danger}
          >
            {isPending ? "Closing\u2026" : "Close Issue"}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <p className={styles.message}>
          Close issue #{issueNumber}? This can be reopened later from GitHub.
        </p>
        <textarea
          className={styles.textarea}
          placeholder="Add a closing comment\u2026"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={isPending}
          rows={3}
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/ui/CloseIssueModal.tsx packages/web/components/ui/CloseIssueModal.module.css
git commit -m "feat: add CloseIssueModal with optional comment textarea"
```

---

### Task 4: Extend SwipeRow for Bidirectional Swipe

**Files:**
- Modify: `packages/web/components/list/SwipeRow.tsx`
- Modify: `packages/web/components/list/SwipeRow.module.css`

- [ ] **Step 1: Update SwipeRow component for bidirectional support**

Replace the entire content of `packages/web/components/list/SwipeRow.tsx`:

```tsx
"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";
import styles from "./SwipeRow.module.css";

const SWIPE_THRESHOLD = 60;

type SwipeState = "idle" | "left" | "right";

type Props = {
  children: ReactNode;
  onLaunch?: () => void;
  onClose?: () => void;
  disabled?: boolean;
};

export function SwipeRow({ children, onLaunch, onClose, disabled }: Props) {
  const [swiped, setSwiped] = useState<SwipeState>("idle");
  const startX = useRef<number | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      startX.current = e.touches[0].clientX;
    },
    [disabled],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (startX.current === null) return;
      const touch = e.changedTouches[0];
      if (!touch) {
        startX.current = null;
        return;
      }
      const delta = touch.clientX - startX.current;
      if (delta > SWIPE_THRESHOLD && onClose) {
        // Swiped right — reveal close on left
        setSwiped("right");
      } else if (delta < -SWIPE_THRESHOLD && onLaunch) {
        // Swiped left — reveal launch on right
        setSwiped("left");
      } else if (Math.abs(delta) > SWIPE_THRESHOLD) {
        // Swipe in a direction with no handler — dismiss
        setSwiped("idle");
      }
      startX.current = null;
    },
    [onLaunch, onClose],
  );

  const handleTouchCancel = useCallback(() => {
    startX.current = null;
  }, []);

  const dismiss = useCallback(() => setSwiped("idle"), []);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div
      className={styles.wrapper}
      data-swiped={swiped}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {onClose && (
        <div className={styles.actionsLeft}>
          <button
            className={`${styles.actionBtn} ${styles.closeBtn}`}
            onClick={() => {
              dismiss();
              onClose();
            }}
          >
            Close
          </button>
        </div>
      )}
      {onLaunch && (
        <div className={styles.actionsRight}>
          <button
            className={`${styles.actionBtn} ${styles.launchBtn}`}
            onClick={() => {
              dismiss();
              onLaunch();
            }}
          >
            Launch
          </button>
        </div>
      )}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Update SwipeRow CSS for bidirectional reveals**

Replace the entire content of `packages/web/components/list/SwipeRow.module.css`:

```css
.wrapper {
  position: relative;
  overflow: hidden;
}

/* Left-side actions (close) — revealed on swipe-right */
.actionsLeft {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  display: flex;
  transform: translateX(-100%);
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Right-side actions (launch) — revealed on swipe-left */
.actionsRight {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  transform: translateX(100%);
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.content {
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  background: var(--paper-bg);
}

/* Swiped left — content slides left, right actions revealed */
.wrapper[data-swiped="left"] .actionsRight {
  transform: translateX(0);
}

.wrapper[data-swiped="left"] .content {
  transform: translateX(-80px);
}

/* Swiped right — content slides right, left actions revealed */
.wrapper[data-swiped="right"] .actionsLeft {
  transform: translateX(0);
}

.wrapper[data-swiped="right"] .content {
  transform: translateX(80px);
}

.actionBtn {
  display: flex;
  align-items: center;
  padding: 0 24px;
  font-family: var(--paper-sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--paper-bg);
  border: none;
  cursor: pointer;
  white-space: nowrap;
}

.launchBtn {
  background: var(--paper-ink);
}

.closeBtn {
  background: var(--paper-brick, #c9553d);
}

@media (min-width: 768px) and (hover: hover) {
  .wrapper {
    overflow: visible;
  }

  .actionsLeft,
  .actionsRight {
    display: none;
  }

  .content {
    transform: none !important;
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/list/SwipeRow.tsx packages/web/components/list/SwipeRow.module.css
git commit -m "feat: extend SwipeRow with bidirectional swipe (right reveals close)"
```

---

### Task 5: Remove Checkboxes and Wire Close in ListRow

**Files:**
- Modify: `packages/web/components/list/ListRow.tsx`
- Modify: `packages/web/components/list/ListRow.module.css`

- [ ] **Step 1: Update ListRow component**

Replace the entire content of `packages/web/components/list/ListRow.tsx`:

```tsx
import Link from "next/link";
import type { UnifiedListItem } from "@issuectl/core";
import { Chip, LabelChip } from "@/components/paper";
import { SyncDot } from "@/components/ui/SyncDot";
import { SwipeRow } from "./SwipeRow";
import styles from "./ListRow.module.css";

type Props = {
  item: UnifiedListItem;
  onLaunch?: (owner: string, repo: string, issueNumber: number) => void;
  onClose?: (owner: string, repo: string, issueNumber: number) => void;
};

// Drafts store updatedAt as unix seconds (SQLite INTEGER). GitHub issues
// use ISO strings. Normalize both to "N days ago" for display. Clamps
// negative diffs to "today" so a clock-skewed future timestamp doesn't
// render "-1d".
function formatAge(updatedAt: string | number): string {
  const now = Date.now();
  const updated =
    typeof updatedAt === "number"
      ? updatedAt * 1000
      : new Date(updatedAt).getTime();
  if (!Number.isFinite(updated)) return "";
  const diffDays = Math.floor((now - updated) / (24 * 60 * 60 * 1000));
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "1d";
  return `${diffDays}d`;
}

export function ListRow({ item, onLaunch, onClose }: Props) {
  if (item.kind === "draft") {
    return (
      <div className={styles.item}>
        <Link href={`/drafts/${item.draft.id}`} className={styles.rowLink}>
          <div className={styles.title}>{item.draft.title}</div>
          <div className={styles.meta}>
            <Chip variant="dashed">no repo</Chip>
            <span className={styles.sep}>·</span>
            <SyncDot status="local" label="local draft" />
            <span className={styles.sep}>·</span>
            <span>{formatAge(item.draft.updatedAt)}</span>
          </div>
        </Link>
      </div>
    );
  }

  const { issue, repo, section } = item;
  const titleClass =
    section === "closed" ? `${styles.title} ${styles.done}` : styles.title;

  const displayLabels = issue.labels.filter(
    (l) => !l.name.startsWith("issuectl:"),
  );

  let actionLabel: string;
  let actionAria: string;
  switch (section) {
    case "open":
      actionLabel = "launch";
      actionAria = "Launch issue";
      break;
    case "running":
      actionLabel = "open";
      actionAria = "Open active session";
      break;
    case "closed":
      actionLabel = "view";
      actionAria = "View issue";
      break;
    default: {
      const _exhaustive: never = section;
      throw new Error(`ListRow: unhandled section ${String(_exhaustive)}`);
    }
  }

  const rowContent = (
    <div className={styles.item} data-section={section}>
      <Link
        href={`/issues/${repo.owner}/${repo.name}/${issue.number}`}
        className={styles.rowLink}
      >
        <div className={titleClass}>{issue.title}</div>
        <div className={styles.meta}>
          <Chip>{repo.name}</Chip>
          <span className={styles.num}>#{issue.number}</span>
          {displayLabels.length > 0 && (
            <>
              <span className={styles.sep}>·</span>
              {displayLabels.map((l) => (
                <LabelChip key={l.name} name={l.name} color={l.color} />
              ))}
            </>
          )}
          {(issue.commentCount ?? 0) > 0 && (
            <>
              <span className={styles.sep}>·</span>
              <span className={styles.comments}>
                <svg
                  className={styles.commentIcon}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2v2.19l2.72-2.72.53-.22h4.25a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
                </svg>
                {issue.commentCount}
              </span>
            </>
          )}
          <span className={styles.sep}>·</span>
          <span>{formatAge(issue.updatedAt)}</span>
          {issue.user && (
            <>
              <span className={styles.sep}>·</span>
              <span className={styles.author}>{issue.user.login}</span>
            </>
          )}
          {section === "running" && (
            <>
              <span className={styles.sep}>·</span>
              <span className={styles.activeLabel}>active</span>
            </>
          )}
        </div>
      </Link>
      <div className={styles.actions}>
        {section === "open" && onLaunch ? (
          <button
            className={styles.actionBtn}
            onClick={() => onLaunch(repo.owner, repo.name, issue.number)}
            aria-label={actionAria}
          >
            {actionLabel} →
          </button>
        ) : (
          <Link
            href={`/issues/${repo.owner}/${repo.name}/${issue.number}`}
            className={`${styles.actionBtn} ${section === "running" ? styles.actionBtnRunning : ""}`}
            aria-label={actionAria}
          >
            {actionLabel} →
          </Link>
        )}
      </div>
    </div>
  );

  // Wrap in SwipeRow for open (launch + close) and running (close only)
  if (section === "open" || section === "running") {
    return (
      <SwipeRow
        onLaunch={
          section === "open" && onLaunch
            ? () => onLaunch(repo.owner, repo.name, issue.number)
            : undefined
        }
        onClose={
          onClose
            ? () => onClose(repo.owner, repo.name, issue.number)
            : undefined
        }
      >
        {rowContent}
      </SwipeRow>
    );
  }

  return rowContent;
}
```

- [ ] **Step 2: Update ListRow CSS — remove checkbox, reduce padding**

In `packages/web/components/list/ListRow.module.css`:

Remove the `.check` block entirely (lines 31-35):
```css
/* DELETE THIS BLOCK */
.check {
  position: absolute;
  left: 24px;
  top: 18px;
}
```

Change `.rowLink` padding from `58px` left to `20px`:
```css
.rowLink {
  padding: 16px 24px 8px 20px;
  display: block;
  color: inherit;
  text-decoration: none;
  position: relative;
  min-width: 0;
}
```

Change `.actions` left padding from `58px` to `20px`:
```css
.actions {
  display: flex;
  align-items: center;
  padding: 0 20px 14px 20px;
  gap: 8px;
  justify-content: flex-end;
  flex-shrink: 0;
}
```

Update the mobile media query to also hide actions for running rows (SwipeRow reveals close):
```css
@media (max-width: 767px), (hover: none) {
  .item[data-section="open"] .actions,
  .item[data-section="running"] .actions {
    display: none;
  }
}
```

Update the desktop media query `.rowLink` padding:
```css
@media (min-width: 768px) and (hover: hover) {
  /* ... */
  .rowLink {
    flex: 1;
    padding: 16px 24px 16px 24px;
  }
  /* ... */
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: May show errors in `ListSection.tsx` / `ListContent.tsx` because `onClose` prop is not threaded yet. That's fine — we fix it in the next task.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/list/ListRow.tsx packages/web/components/list/ListRow.module.css
git commit -m "feat: remove checkboxes from list rows, add onClose prop, wire SwipeRow for close"
```

---

### Task 6: Thread `onClose` Through ListSection and ListContent

**Files:**
- Modify: `packages/web/components/list/ListSection.tsx`
- Modify: `packages/web/components/list/ListContent.tsx`

- [ ] **Step 1: Add `onClose` to ListSection**

Replace the content of `packages/web/components/list/ListSection.tsx`:

```tsx
import type { ReactNode } from "react";
import type { UnifiedListItem } from "@issuectl/core";
import { ListRow } from "./ListRow";
import styles from "./ListSection.module.css";

type Props = {
  title: ReactNode | null;
  items: UnifiedListItem[];
  onLaunch?: (owner: string, repo: string, issueNumber: number) => void;
  onClose?: (owner: string, repo: string, issueNumber: number) => void;
};

export function ListSection({ title, items, onLaunch, onClose }: Props) {
  if (items.length === 0) return null;

  return (
    <>
      {title ? (
        <div className={styles.section}>
          <h3>{title}</h3>
          <div className={styles.rule} />
          <span className={styles.count}>{items.length}</span>
        </div>
      ) : null}
      {items.map((item) => (
        <ListRow
          key={
            item.kind === "draft"
              ? `draft-${item.draft.id}`
              : `issue-${item.repo.id}-${item.issue.number}`
          }
          item={item}
          onLaunch={onLaunch}
          onClose={onClose}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 2: Add `CloseIssueModal` state and `onClose` handler to ListContent**

Replace the content of `packages/web/components/list/ListContent.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Section, UnifiedList } from "@issuectl/core";
import type { PrEntry } from "@/lib/page-filters";
import { ListSection } from "./ListSection";
import { PrListRow } from "./PrListRow";
import { CloseIssueModal } from "@/components/ui/CloseIssueModal";
import { closeIssue } from "@/lib/actions/issues";
import { endSession } from "@/lib/actions/launch";
import { useToast } from "@/components/ui/ToastProvider";
import styles from "./List.module.css";

type Props = {
  activeTab: "issues" | "prs";
  activeSection: Section;
  data: UnifiedList;
  prs: PrEntry[];
  activeRepo: string | null;
  mineOnly: boolean;
  /** Deployments indexed by "owner/repo#number" for session-end-before-close */
  activeDeployments?: Map<string, number>;
};

const PAGE_SIZE = 15;

const SECTION_EMPTY: Record<Section, { title: string; body: string }> = {
  unassigned: {
    title: "no drafts",
    body: "start a draft with the + button — it'll live here until you assign it to a repo.",
  },
  open: {
    title: "all clear",
    body: "nothing on your plate. breathe, or draft the next one.",
  },
  running: {
    title: "no running sessions",
    body: "when you launch an issue with Claude Code, it lands here while the session is active.",
  },
  closed: {
    title: "nothing closed yet",
    body: "closed issues show up here once PRs merge and reconcile.",
  },
};

type CloseTarget = {
  owner: string;
  repo: string;
  number: number;
};

export function ListContent({
  activeTab,
  activeSection,
  data,
  prs,
  activeRepo,
  mineOnly,
  activeDeployments,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [closeTarget, setCloseTarget] = useState<CloseTarget | null>(null);
  const [isPending, startTransition] = useTransition();
  const [closeError, setCloseError] = useState<string | null>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeSection]);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  const handleLaunch = useCallback(
    (owner: string, repo: string, issueNumber: number) => {
      router.push(`/issues/${owner}/${repo}/${issueNumber}?launch=true`);
    },
    [router],
  );

  const handleCloseRequest = useCallback(
    (owner: string, repo: string, issueNumber: number) => {
      setCloseError(null);
      setCloseTarget({ owner, repo, number: issueNumber });
    },
    [],
  );

  const handleCloseConfirm = useCallback(
    (comment: string) => {
      if (!closeTarget) return;
      const { owner, repo, number } = closeTarget;
      startTransition(async () => {
        try {
          // End active session if one exists for this issue
          if (activeDeployments) {
            const key = `${owner}/${repo}#${number}`;
            const deploymentId = activeDeployments.get(key);
            if (deploymentId !== undefined) {
              const endResult = await endSession(deploymentId, owner, repo, number);
              if (!endResult.success) {
                showToast(
                  "Terminal session could not be stopped cleanly — it will be cleaned up on next restart.",
                  "warning",
                );
              }
            }
          }

          const result = await closeIssue(owner, repo, number, comment || undefined);
          if (!result.success) {
            setCloseError(result.error);
            return;
          }
          setCloseTarget(null);
          showToast(
            result.cacheStale
              ? "Issue closed — reload if the list looks stale"
              : "Issue closed",
            "success",
          );
          router.replace("/?section=closed");
        } catch (err) {
          console.error("[issuectl] Close issue from list failed:", err);
          setCloseError("Unable to reach the server. Check your connection and try again.");
        }
      });
    },
    [closeTarget, activeDeployments, showToast, router],
  );

  const handleCloseCancel = useCallback(() => {
    setCloseTarget(null);
    setCloseError(null);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, activeSection]);

  if (activeTab === "issues") {
    const total = data[activeSection].length;
    const showing = Math.min(visibleCount, total);
    return (
      <>
        {renderIssueSection({
          activeSection,
          data,
          visibleCount,
          onLaunch: handleLaunch,
          onClose: handleCloseRequest,
        })}
        {total > PAGE_SIZE && (
          <div className={styles.pageStatus}>
            Showing {showing} of {total}
          </div>
        )}
        {visibleCount < total && (
          <div ref={sentinelRef} className={styles.sentinel} />
        )}
        {closeTarget && (
          <CloseIssueModal
            issueNumber={closeTarget.number}
            onConfirm={handleCloseConfirm}
            onCancel={handleCloseCancel}
            isPending={isPending}
            error={closeError ?? undefined}
          />
        )}
      </>
    );
  }

  if (prs.length === 0) {
    let emptyMessage: string;
    if (activeRepo && mineOnly) {
      emptyMessage = `no open PRs from you in ${activeRepo}.`;
    } else if (activeRepo) {
      emptyMessage = `no open PRs in ${activeRepo}.`;
    } else if (mineOnly) {
      emptyMessage = "no open PRs from you across your repos.";
    } else {
      emptyMessage = "no open PRs across your repos.";
    }

    return (
      <div className={styles.empty}>
        <div className={styles.emptyMark}>❧</div>
        <h3>no pull requests</h3>
        <p>
          <em>{emptyMessage}</em>
        </p>
      </div>
    );
  }

  return (
    <div>
      {prs.map(({ repo, pull }) => (
        <PrListRow
          key={`pr-${repo.owner}-${repo.name}-${pull.number}`}
          owner={repo.owner}
          repoName={repo.name}
          pull={pull}
        />
      ))}
    </div>
  );
}

function renderIssueSection({
  activeSection,
  data,
  visibleCount,
  onLaunch,
  onClose,
}: {
  activeSection: Section;
  data: UnifiedList;
  visibleCount: number;
  onLaunch: (owner: string, repo: string, issueNumber: number) => void;
  onClose: (owner: string, repo: string, issueNumber: number) => void;
}) {
  const allItems = data[activeSection];

  if (allItems.length === 0) {
    const empty = SECTION_EMPTY[activeSection];
    return (
      <div className={styles.empty}>
        <div className={styles.emptyMark}>❧</div>
        <h3>{empty.title}</h3>
        <p>
          <em>{empty.body}</em>
        </p>
      </div>
    );
  }

  const items = allItems.slice(0, visibleCount);
  return <ListSection title={null} items={items} onLaunch={onLaunch} onClose={onClose} />;
}
```

**Note on `activeDeployments`:** This prop provides a lookup from issue key to deployment ID so the list can end sessions before closing. The caller (`DashboardContent`) will need to pass this data. If this proves too complex for this iteration, omit the session-end logic from the list close (users closing running issues from the list would just close without ending the session — the session cleanup happens on next restart anyway). The detail page still handles it properly.

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: May show a type error in `DashboardContent.tsx` if `activeDeployments` is not passed. Since it's optional (`?`), it should pass. Verify.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/list/ListSection.tsx packages/web/components/list/ListContent.tsx
git commit -m "feat: thread onClose through list, add CloseIssueModal to ListContent"
```

---

### Task 7: Update Detail Page to Use CloseIssueModal

**Files:**
- Modify: `packages/web/components/detail/IssueActionSheet.tsx`

- [ ] **Step 1: Replace ConfirmDialog with CloseIssueModal in IssueActionSheet**

In `packages/web/components/detail/IssueActionSheet.tsx`:

1. Replace the `ConfirmDialog` import with `CloseIssueModal`:

```typescript
import { CloseIssueModal } from "@/components/ui/CloseIssueModal";
```

Remove:
```typescript
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
```

2. Replace the `handleCloseConfirm` function (currently at ~line 127-164):

```typescript
function handleCloseConfirm(comment: string) {
  setError(null);
  startTransition(async () => {
    try {
      // End active terminal session before closing the issue
      const liveDeployment = deployments.find((d) => d.endedAt === null);
      if (liveDeployment) {
        const endResult = await endSession(liveDeployment.id, owner, repo, number);
        if (!endResult.success) {
          console.warn(
            "[issuectl] Failed to end session while closing issue:",
            endResult.error,
          );
          showToast(
            "Terminal session could not be stopped cleanly — it will be cleaned up on next restart.",
            "warning",
          );
        }
      }
      const result = await closeIssue(owner, repo, number, comment || undefined);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirmClose(false);
      showToast(
        result.cacheStale
          ? "Issue closed — reload if the list looks stale"
          : "Issue closed",
        "success",
      );
      router.replace("/?section=closed");
    } catch (err) {
      console.error("[issuectl] Close issue failed:", err);
      setError("Unable to reach the server. Check your connection and try again.");
    }
  });
}
```

3. Replace the `{confirmClose && (<ConfirmDialog ... />)}` JSX (currently at ~line 287-296) with:

```tsx
{confirmClose && (
  <CloseIssueModal
    issueNumber={number}
    onConfirm={handleCloseConfirm}
    onCancel={() => setConfirmClose(false)}
    isPending={isPending}
    error={error ?? undefined}
  />
)}
```

- [ ] **Step 2: Verify the `ConfirmDialog` import is still used for reassign**

Check: `ConfirmDialog` is still rendered for the reassign confirmation. If so, keep the import but only for reassign. If `ConfirmDialog` is ONLY used for close, remove the import entirely.

Looking at the existing code: `ConfirmDialog` is used for BOTH close (line ~287) and reassign (line ~344). After this change, only the reassign still uses `ConfirmDialog`. **Keep the `ConfirmDialog` import.**

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/detail/IssueActionSheet.tsx
git commit -m "feat: use CloseIssueModal with comment support on detail page"
```

---

### Task 8: E2E Tests

**Files:**
- Modify or create: `packages/web/e2e/issue-close.spec.ts`

- [ ] **Step 1: Create E2E test file**

Create `packages/web/e2e/issue-close.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 393, height: 852 };

test.describe("Issue close UX", () => {
  test.describe("swipe-to-close on mobile", () => {
    test.use({ viewport: MOBILE_VIEWPORT });

    test("swipe right reveals close button on open issue row", async ({ page }) => {
      await page.goto("/");
      // Wait for list to load
      await page.waitForSelector('[data-section="open"]');

      const row = page.locator('[data-section="open"]').first();
      const box = await row.boundingBox();
      if (!box) throw new Error("Row not visible");

      // Simulate swipe right (touch start left, end right)
      await page.touchscreen.tap(box.x + 30, box.y + box.height / 2);
      await row.dispatchEvent("touchstart", {
        touches: [{ clientX: box.x + 30, clientY: box.y + box.height / 2 }],
      });
      await row.dispatchEvent("touchend", {
        changedTouches: [{ clientX: box.x + 130, clientY: box.y + box.height / 2 }],
      });

      // Close button should be visible
      const closeBtn = page.getByRole("button", { name: "Close" });
      await expect(closeBtn).toBeVisible();
    });

    test("tapping close button opens CloseIssueModal", async ({ page }) => {
      await page.goto("/");
      await page.waitForSelector('[data-section="open"]');

      const row = page.locator('[data-section="open"]').first();
      const box = await row.boundingBox();
      if (!box) throw new Error("Row not visible");

      // Swipe right
      await row.dispatchEvent("touchstart", {
        touches: [{ clientX: box.x + 30, clientY: box.y + box.height / 2 }],
      });
      await row.dispatchEvent("touchend", {
        changedTouches: [{ clientX: box.x + 130, clientY: box.y + box.height / 2 }],
      });

      // Tap close
      await page.getByRole("button", { name: "Close" }).click();

      // Modal should appear
      await expect(page.getByRole("dialog", { name: "Close Issue" })).toBeVisible();
      await expect(page.getByPlaceholder("Add a closing comment")).toBeVisible();
    });
  });

  test("close modal from detail page has comment field", async ({ page }) => {
    // Navigate to an open issue detail page (assumes at least one issue exists)
    await page.goto("/");
    await page.waitForSelector('[data-section="open"]');
    await page.locator('[data-section="open"] a').first().click();

    // Wait for detail page
    await page.waitForSelector("h1");

    // Open action sheet and click close
    // On desktop, the "Close issue" button is in the desktop bar
    await page.getByRole("button", { name: "Close issue" }).click();

    // Modal should have comment field
    await expect(page.getByRole("dialog", { name: "Close Issue" })).toBeVisible();
    await expect(page.getByPlaceholder("Add a closing comment")).toBeVisible();
  });

  test("FAB is 52px on mobile viewport", async ({ page }) => {
    test.use({ viewport: MOBILE_VIEWPORT });
    await page.goto("/");
    await page.waitForSelector('[aria-label="Create a new draft"]');

    const fab = page.locator('[aria-label="Create a new draft"]');
    const box = await fab.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeCloseTo(52, 0);
    expect(box!.height).toBeCloseTo(52, 0);
  });

  test("no checkboxes in issue list rows", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[data-section]');

    // There should be no checkbox SVG elements in rows
    const checkboxes = page.locator('[data-section] svg rect[rx="2"]');
    await expect(checkboxes).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run the E2E tests**

Run: `pnpm --filter @issuectl/web test:e2e -- --grep "Issue close"`
Expected: Tests should pass if the dev server is running on :3847. Some tests may need adjustment based on actual page structure — iterate as needed.

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/issue-close.spec.ts
git commit -m "test: add E2E tests for swipe-to-close, close modal, and FAB sizing"
```

---

## Execution Order

Tasks 1-3 are independent and can be executed in parallel.
Task 4 depends on nothing.
Task 5 depends on Task 4 (SwipeRow must support `onClose` before ListRow uses it).
Task 6 depends on Tasks 3 and 5 (CloseIssueModal and ListRow must exist).
Task 7 depends on Tasks 2 and 3 (server action comment param and CloseIssueModal).
Task 8 depends on all prior tasks.

```
Task 1 (FAB) ──────────────────────────────────────┐
Task 2 (server action) ─────────────────────┐      │
Task 3 (CloseIssueModal) ──────────┐        │      │
Task 4 (SwipeRow bidirectional) ──┐ │        │      │
                                  ▼ │        │      │
Task 5 (ListRow + checkbox) ──────┤ │        │      │
                                  ▼ ▼        ▼      │
Task 6 (thread onClose) ─────────────────────┤      │
                                             ▼      │
Task 7 (detail page) ──────────────────────────────┤
                                                    ▼
Task 8 (E2E tests) ─────────────────────────────────
```
