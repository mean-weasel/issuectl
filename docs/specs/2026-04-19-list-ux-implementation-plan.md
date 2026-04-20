# List UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename list sections (Open/Running/Closed), widen desktop to 1200px, add hover-to-reveal Launch on desktop, add swipe-to-reveal on mobile, and visually distinguish running sessions.

**Architecture:** Pure rename of section string values across types, core logic, and all web consumers. New `SwipeRow` client component wraps `ListRow` on mobile for touch gestures. Desktop `ListRow` gets hover-reveal Launch button. No DB or server-side changes.

**Tech Stack:** TypeScript types, Vitest tests, Next.js App Router (Server + Client Components), CSS Modules, touch events.

---

## File Map

### Files to create

| File | Responsibility |
|---|---|
| `packages/web/components/list/SwipeRow.tsx` | Mobile swipe-to-reveal gesture wrapper |
| `packages/web/components/list/SwipeRow.module.css` | Swipe row styles and action button styles |

### Files to modify

| File | Change |
|---|---|
| `packages/core/src/types.ts` | Rename `Section` union and `UnifiedList` fields |
| `packages/core/src/data/unified-list.ts` | Rename section variables and string values |
| `packages/core/src/data/unified-list.test.ts` | Update section names in all tests |
| `packages/web/app/page.tsx` | Update `SECTIONS` array, default section, URL param migration |
| `packages/web/app/DashboardContent.tsx` | Update section field references |
| `packages/web/components/list/List.tsx` | Update `SECTION_LABEL`, tab styling for running |
| `packages/web/components/list/List.module.css` | Widen to 1200px, add running tab accent style |
| `packages/web/components/list/ListContent.tsx` | Update `SECTION_EMPTY` keys and messages |
| `packages/web/components/list/ListRow.tsx` | Update section switch cases, add Launch/Open Terminal buttons |
| `packages/web/components/list/ListRow.module.css` | Update flight → running class names |
| `packages/web/components/list/ListSection.tsx` | Pass section to ListRow for swipe enablement |
| `packages/web/components/list/ListCountContext.tsx` | Update section field references |
| `packages/web/lib/list-href.ts` | Update section references |
| `packages/web/lib/list-href.test.ts` | Update section names in tests |
| `packages/web/lib/page-filters.ts` | Update section references |
| `packages/web/lib/page-filters.test.ts` | Update section names in tests |
| `packages/web/e2e/data-freshness.spec.ts` | Update section references |
| `packages/web/e2e/action-sheets.spec.ts` | Update section references |
| `packages/web/e2e/mobile-ux-patterns.spec.ts` | Update section references |

---

## Milestone 1: Core type rename

**Test checkpoint:** `pnpm turbo typecheck && pnpm --filter @issuectl/core test` passes.

---

### Task 1: Rename Section type and UnifiedList fields

**Files:**
- Modify: `packages/core/src/types.ts:79,111-115`
- Modify: `packages/core/src/data/unified-list.ts:83-85,100-124,151-156`
- Modify: `packages/core/src/data/unified-list.test.ts` (all test references)

- [ ] **Step 1: Update Section type in types.ts**

Change line 79:

```typescript
export type Section = "unassigned" | "open" | "running" | "closed";
```

- [ ] **Step 2: Update UnifiedList fields in types.ts**

Change lines 111-116:

```typescript
export type UnifiedList = {
  unassigned: DraftListItem[];
  open: IssueListItem[];
  running: IssueListItem[];
  closed: IssueListItem[];
};
```

- [ ] **Step 3: Update UnifiedListItem section type**

The `section` field on `IssueListItem` uses `Exclude<Section, "unassigned">` which will automatically resolve to `"open" | "running" | "closed"`. No change needed here.

- [ ] **Step 4: Update groupIntoSections in unified-list.ts**

Rename the variables and string values:

```typescript
  const open: IssueListItem[] = [];
  const running: IssueListItem[] = [];
  const closed: IssueListItem[] = [];
```

Update the classification logic:

```typescript
      let section: "open" | "running" | "closed";
      if (issue.state === "closed") {
        section = "closed";
      } else if (activeLaunchSet.has(issue.number)) {
        section = "running";
      } else {
        section = "open";
      }
```

Update the push logic:

```typescript
      if (section === "open") open.push(item);
      else if (section === "running") running.push(item);
      else closed.push(item);
```

Update the return:

```typescript
  return {
    unassigned,
    open: sortIssues(open),
    running: sortIssues(running),
    closed: sortIssues(closed),
  };
```

- [ ] **Step 5: Update unified-list.test.ts**

Find-and-replace across the test file:
- `in_focus` → `open`
- `in_flight` → `running`
- `shipped` → `closed`
- `"puts closed issues in shipped"` → `"puts closed issues in closed"`
- `"puts open issues with an active deployment in in_flight"` → `"puts open issues with an active deployment in running"`
- `"treats an issue with only ended deployments as in_focus"` → `"treats an issue with only ended deployments as open"`

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @issuectl/core test`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/data/unified-list.ts packages/core/src/data/unified-list.test.ts
git commit -m "refactor: rename sections — in_focus→open, in_flight→running, shipped→closed"
```

---

## Milestone 2: Web consumer rename

**Test checkpoint:** `pnpm turbo typecheck` passes across all packages.

---

### Task 2: Update page.tsx and URL param migration

**Files:**
- Modify: `packages/web/app/page.tsx:30-35,58-62`

- [ ] **Step 1: Update SECTIONS constant and default**

```typescript
const SECTIONS: readonly Section[] = [
  "unassigned",
  "open",
  "running",
  "closed",
];
```

Update the default section (line 62): `"in_focus"` → `"open"`.

- [ ] **Step 2: Add URL param migration**

Before the section resolution, add a migration map:

```typescript
  const SECTION_MIGRATION: Record<string, Section> = {
    in_focus: "open",
    in_flight: "running",
    shipped: "closed",
  };
  const resolvedSection = SECTION_MIGRATION[sectionParam ?? ""] ?? sectionParam;
  const activeSection: Section = (SECTIONS as readonly string[]).includes(
    resolvedSection ?? "",
  )
    ? (resolvedSection as Section)
    : "open";
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/page.tsx
git commit -m "refactor: update page.tsx sections with URL param migration"
```

---

### Task 3: Update List.tsx — labels, tabs, and running accent

**Files:**
- Modify: `packages/web/components/list/List.tsx:41-46` (SECTION_LABEL)
- Modify: `packages/web/components/list/List.module.css` (max-width + running tab style)

- [ ] **Step 1: Update SECTION_LABEL**

```typescript
const SECTION_LABEL: Record<Section, string> = {
  unassigned: "drafts",
  open: "open",
  running: "running",
  closed: "closed",
};
```

- [ ] **Step 2: Update any references to old section names in List.tsx**

Search for `in_focus`, `in_flight`, `shipped` in the file and replace with `open`, `running`, `closed`. This includes the `visibleSections` filter logic and `sectionHref` calls.

- [ ] **Step 3: Add running tab accent CSS class**

In the section tabs rendering, add a conditional class for the running tab:

```typescript
const tabClass = isActive
  ? section === "running"
    ? styles.sectionTabRunning
    : styles.sectionTabActive
  : styles.sectionTab;
```

- [ ] **Step 4: Update List.module.css — widen to 1200px**

Change the container max-width:

```css
.container {
  max-width: 1200px;
  /* ... rest unchanged */
}
```

- [ ] **Step 5: Add running tab accent style to List.module.css**

```css
.sectionTabRunning {
  /* Same base as sectionTabActive */
  padding: 10px 14px;
  font-family: var(--paper-serif);
  font-size: var(--paper-fs-sm);
  font-style: italic;
  border-radius: var(--paper-radius-sm);
  white-space: nowrap;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  /* Green accent */
  background: var(--paper-accent);
  color: var(--paper-bg);
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/components/list/List.tsx packages/web/components/list/List.module.css
git commit -m "refactor: update List tabs, widen to 1200px, add running tab accent"
```

---

### Task 4: Update ListContent.tsx — section empty messages

**Files:**
- Modify: `packages/web/components/list/ListContent.tsx:21-38`

- [ ] **Step 1: Update SECTION_EMPTY keys and messages**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/components/list/ListContent.tsx
git commit -m "refactor: update ListContent section empty messages"
```

---

### Task 5: Update ListRow.tsx — section switch cases

**Files:**
- Modify: `packages/web/components/list/ListRow.tsx:50-83`
- Modify: `packages/web/components/list/ListRow.module.css:79-88`

- [ ] **Step 1: Update checkbox state mapping**

```typescript
  const checkState =
    section === "closed" ? "done" : section === "running" ? "flight" : "open";
```

- [ ] **Step 2: Update action label switch**

```typescript
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
```

- [ ] **Step 3: Update CSS class name**

In ListRow.tsx, change `styles.actionBtnFlight` to `styles.actionBtnRunning`.

In ListRow.module.css, rename `.actionBtnFlight` to `.actionBtnRunning` (both the base class and the `:hover` rule).

- [ ] **Step 4: Add "active" label for running rows in metadata**

After the age span in the metadata section, add for running rows:

```tsx
          {section === "running" && (
            <>
              <span className={styles.sep}>·</span>
              <span className={styles.activeLabel}>active</span>
            </>
          )}
```

Add to ListRow.module.css:

```css
.activeLabel {
  color: var(--paper-accent);
  font-weight: 600;
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/list/ListRow.tsx packages/web/components/list/ListRow.module.css
git commit -m "refactor: update ListRow section cases, add running indicator"
```

---

### Task 6: Update remaining web consumers

**Files:**
- Modify: `packages/web/app/DashboardContent.tsx`
- Modify: `packages/web/components/list/ListCountContext.tsx`
- Modify: `packages/web/lib/list-href.ts`
- Modify: `packages/web/lib/list-href.test.ts`
- Modify: `packages/web/lib/page-filters.ts`
- Modify: `packages/web/lib/page-filters.test.ts`
- Modify: `packages/web/components/detail/IssueActionSheet.tsx`

- [ ] **Step 1: Update DashboardContent.tsx**

Find-and-replace: `in_focus` → `open`, `in_flight` → `running`, `shipped` → `closed`.

- [ ] **Step 2: Update ListCountContext.tsx**

Same find-and-replace for section field references.

- [ ] **Step 3: Update list-href.ts and list-href.test.ts**

Same find-and-replace.

- [ ] **Step 4: Update page-filters.ts and page-filters.test.ts**

Same find-and-replace.

- [ ] **Step 5: Update IssueActionSheet.tsx**

Check for any section references (e.g., redirect to `/?section=shipped` after closing an issue). Update to `/?section=closed`.

- [ ] **Step 6: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS across all packages

- [ ] **Step 7: Run core tests**

Run: `pnpm --filter @issuectl/core test`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: update all web consumers for section rename"
```

---

### Task 7: Update E2E tests

**Files:**
- Modify: `packages/web/e2e/data-freshness.spec.ts`
- Modify: `packages/web/e2e/action-sheets.spec.ts`
- Modify: `packages/web/e2e/mobile-ux-patterns.spec.ts`

- [ ] **Step 1: Find and update section references in E2E tests**

In each file, find-and-replace: `in_focus` → `open`, `in_flight` → `running`, `shipped` → `closed`. Also update any UI text assertions (e.g., `"in focus"` → `"open"`, `"in flight"` → `"running"`).

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/
git commit -m "test: update E2E tests for section rename"
```

---

**Milestone 2 checkpoint:** Stop and test.

Run: `pnpm turbo typecheck && pnpm --filter @issuectl/core test`

All packages should pass. Start the dev server and verify the section tabs now show "drafts", "open", "running", "closed" with the running tab in green accent. Verify the wider 1200px container on desktop.

---

## Milestone 3: SwipeRow component for mobile

**Test checkpoint:** Swipe-to-reveal works on mobile viewport. Launch and Re-assign buttons appear on swipe.

---

### Task 8: Create SwipeRow component

**Files:**
- Create: `packages/web/components/list/SwipeRow.tsx`
- Create: `packages/web/components/list/SwipeRow.module.css`

- [ ] **Step 1: Create SwipeRow.module.css**

```css
.wrapper {
  position: relative;
  overflow: hidden;
}

.actions {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  transform: translateX(100%);
  transition: transform 0.2s ease;
}

.wrapper[data-swiped="true"] .actions {
  transform: translateX(0);
}

.content {
  transition: transform 0.2s ease;
}

.wrapper[data-swiped="true"] .content {
  transform: translateX(-160px);
}

.actionBtn {
  display: flex;
  align-items: center;
  padding: 0 20px;
  font-family: var(--paper-sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--paper-bg);
  border: none;
  cursor: pointer;
  white-space: nowrap;
}

.launchBtn {
  background: var(--paper-accent);
}

.reassignBtn {
  background: var(--paper-ink-muted);
}

/* Disable swipe on desktop — hover actions handle it */
@media (min-width: 768px) and (hover: hover) {
  .wrapper {
    overflow: visible;
  }

  .actions {
    display: none;
  }

  .content {
    transform: none !important;
  }
}
```

- [ ] **Step 2: Create SwipeRow.tsx**

```tsx
"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";
import styles from "./SwipeRow.module.css";

const SWIPE_THRESHOLD = 60;

type Props = {
  children: ReactNode;
  onLaunch?: () => void;
  onReassign?: () => void;
  disabled?: boolean;
};

export function SwipeRow({ children, onLaunch, onReassign, disabled }: Props) {
  const [swiped, setSwiped] = useState(false);
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
      const delta = startX.current - e.changedTouches[0].clientX;
      if (delta > SWIPE_THRESHOLD) {
        setSwiped(true);
      } else if (delta < -SWIPE_THRESHOLD) {
        setSwiped(false);
      }
      startX.current = null;
    },
    [],
  );

  const close = useCallback(() => setSwiped(false), []);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div
      className={styles.wrapper}
      data-swiped={swiped}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className={styles.actions}>
        {onLaunch && (
          <button
            className={`${styles.actionBtn} ${styles.launchBtn}`}
            onClick={() => {
              close();
              onLaunch();
            }}
          >
            Launch
          </button>
        )}
        {onReassign && (
          <button
            className={`${styles.actionBtn} ${styles.reassignBtn}`}
            onClick={() => {
              close();
              onReassign();
            }}
          >
            Re-assign
          </button>
        )}
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/list/SwipeRow.tsx packages/web/components/list/SwipeRow.module.css
git commit -m "feat: add SwipeRow component for mobile swipe-to-reveal actions"
```

---

### Task 9: Wire SwipeRow into ListRow and ListSection

**Files:**
- Modify: `packages/web/components/list/ListRow.tsx`
- Modify: `packages/web/components/list/ListSection.tsx`

- [ ] **Step 1: Update ListRow to accept and use SwipeRow**

ListRow needs to know whether to wrap itself in a SwipeRow. Add a `swipeActions` prop:

```tsx
import { SwipeRow } from "./SwipeRow";

type Props = {
  item: UnifiedListItem;
  onLaunch?: (owner: string, repo: string, issueNumber: number) => void;
};
```

For issue items in the `open` section, wrap the row content in `SwipeRow` with `onLaunch` and `onReassign`. For `running` and `closed` sections, no swipe.

The actual row content (the `<div className={styles.item}>` block) stays the same — SwipeRow wraps around it.

- [ ] **Step 2: Update ListSection to pass onLaunch through to ListRow**

```tsx
type Props = {
  title: ReactNode | null;
  items: UnifiedListItem[];
  onLaunch?: (owner: string, repo: string, issueNumber: number) => void;
};
```

Pass `onLaunch` to each `ListRow`.

- [ ] **Step 3: Update ListContent to pass onLaunch through to ListSection**

The `onLaunch` callback will eventually open the `LaunchModal`. For now, wire the prop through. The actual modal integration happens in Task 10.

- [ ] **Step 4: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/list/ListRow.tsx packages/web/components/list/ListSection.tsx packages/web/components/list/ListContent.tsx
git commit -m "feat: wire SwipeRow into ListRow for mobile swipe-to-reveal"
```

---

## Milestone 4: Launch from list

**Test checkpoint:** Launch button (desktop hover or mobile swipe) opens the LaunchModal directly from the list page.

---

### Task 10: Add LaunchModal trigger from list page

**Files:**
- Modify: `packages/web/components/list/List.tsx` or `packages/web/components/list/ListContent.tsx`

- [ ] **Step 1: Add launch state to ListContent**

ListContent is a client component — it can hold the `launchOpen` state and render the `LaunchModal`.

Add state:

```typescript
const [launchTarget, setLaunchTarget] = useState<{
  owner: string;
  repo: string;
  issueNumber: number;
} | null>(null);
```

Pass `onLaunch` callback to `ListSection`:

```typescript
const handleLaunch = useCallback(
  (owner: string, repo: string, issueNumber: number) => {
    setLaunchTarget({ owner, repo, issueNumber });
  },
  [],
);
```

- [ ] **Step 2: Render LaunchModal when launchTarget is set**

Import `LaunchModal` and render it conditionally. The LaunchModal needs issue data — fetch it via a server action or navigate to the issue page with a `?launch=true` param.

The simpler approach: navigate to the issue detail page with `?launch=true` in the URL, and have the issue detail page auto-open the launch modal when that param is present. This avoids duplicating issue data fetching logic in the list page.

```typescript
const handleLaunch = useCallback(
  (owner: string, repo: string, issueNumber: number) => {
    router.push(`/issues/${owner}/${repo}/${issueNumber}?launch=true`);
  },
  [router],
);
```

- [ ] **Step 3: Update IssueActionSheet to auto-open launch modal from URL param**

In `IssueActionSheet.tsx`, check for `?launch=true` in the URL on mount and auto-trigger `handleLaunchTap()`:

```typescript
import { useSearchParams } from "next/navigation";

const searchParams = useSearchParams();

useEffect(() => {
  if (searchParams.get("launch") === "true") {
    handleLaunchTap();
  }
}, []); // Run once on mount
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 5: Test manually**

Start dev server, navigate to the list, hover over an open issue on desktop — "Launch" button should appear. Click it — should navigate to the issue page with the launch modal auto-opened.

On mobile viewport, swipe left on an open issue — "Launch" and "Re-assign" buttons should appear. Tap "Launch" — same navigation + auto-open.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: launch from list — hover button (desktop) and swipe action (mobile)"
```

---

**Milestone 4 checkpoint:** Stop and test end-to-end.

1. Desktop: hover over open issue → Launch button appears → click → navigates to issue + launch modal opens
2. Mobile: swipe left on open issue → Launch + Re-assign buttons → tap Launch → same flow
3. Running issues: no Launch action, "Open Terminal" visible → click navigates to issue page
4. Section tabs show "drafts", "open", "running" (green), "closed"
5. Desktop list is wider (1200px)

---

## Milestone 5: Cleanup and tests

### Task 11: Update CLAUDE.md if needed

- [ ] **Step 1: Check CLAUDE.md for any section references**

Search for `in_focus`, `in_flight`, `shipped` in CLAUDE.md. Update if found.

- [ ] **Step 2: Commit if changed**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for section rename"
```

---

**Final checkpoint:**

```bash
pnpm turbo typecheck
pnpm --filter @issuectl/core test
```

All should pass. The feature is complete when:
- Section tabs show "drafts", "open", "running" (green accent), "closed"
- Display order is Drafts → Open → Running → Closed
- Desktop list is 1200px wide
- Desktop: hover over open issue row reveals "Launch" button
- Mobile: swipe left on open issue reveals "Launch" + "Re-assign"
- Running issues show filled green dot + "active" label, no Launch action
- Old URL params (`?section=in_focus`) silently map to new values
