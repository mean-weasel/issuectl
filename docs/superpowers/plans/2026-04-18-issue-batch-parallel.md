# Issue Batch: Parallel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 12 code issues across 6 parallel workstreams — 4 data-freshness bugs, 3 mobile UX improvements, 2 feature additions, and a PWA fix — each with dedicated E2E and mobile tests.

**Architecture:** Issues are grouped into independent workstreams that touch non-overlapping files and can execute in parallel git worktrees. Each workstream produces a focused PR. Bug fixes land first, then UX/features. Research issues (#108, #113, #134, #136, #139) and the major offline feature (#138) are excluded from this batch — they require investigation or depend on these fixes landing first.

**Tech Stack:** Next.js App Router, Server Actions, CSS Modules, SQLite (better-sqlite3), Playwright E2E, Vitest unit tests

---

## Issue Triage & Root Cause Analysis

| # | Title | Root Cause | Workstream |
|---|-------|-----------|------------|
| **128** | New issue not on index after creation | `createIssue` revalidates `/${owner}/${repo}` but dashboard is `/` — stale cache | A |
| **129** | Filters cleared on back-navigation | `backHref="/"` in DetailTopBar drops all query params | A |
| **131** | Comment disappears after issue creation | Same root as #135 — no client-side refresh after server action | A |
| **135** | Comment not showing locally after post | CommentComposer doesn't call `router.refresh()` after success | A |
| **127** | Hamburger menu not mobile-optimized | NavDrawer uses desktop-style list; needs swipe, touch targets, grouping | B |
| **133** | Pull-to-refresh not native-feeling | No actual pull-to-refresh gesture — only edge-swipe for filters | B |
| **137** | Launch button awkwardly placed | LaunchCard renders inline in body; should be an action in the sheet | C |
| **130** | Issue author not shown in list | `GitHubIssue.user` exists but `ListRow` doesn't render it | D |
| **132** | No standard tags in draft creation | CreateDraftSheet has no label picker; NewIssuePage has one already | E |
| **126** | Can't install as PWA from Safari | Missing Apple-specific meta tags + 180x180 icon | F |

### Excluded from this batch

| # | Title | Why |
|---|-------|-----|
| **108, 136** | Move to MacBook Pro | Ops task, not code |
| **113** | Claude app managed launch | Research task |
| **134** | Async processing research | Research prerequisite for #138, #139 |
| **138** | Offline mutation queue | Major feature — depends on bug fixes landing first |
| **139** | Performance | Needs profiling data — schedule after #134 research |

---

## Parallel Workstream Map

```
Time ──────────────────────────────────────────────────────>

Lane A ─ #128 #129 #131 #135  [Data Freshness Bugs]
Lane B ─ #127 #133            [Mobile UX]
Lane C ─ #137                 [Launch Button → Sheet]
Lane D ─ #130                 [Author Display]
Lane E ─ #132                 [Labels in Draft Creation]
Lane F ─ #126                 [Safari PWA Fix]

All lanes run in parallel — zero file overlap between lanes.
```

### File Ownership by Lane

| Lane | Owns (modify) | Owns (create) |
|------|--------------|---------------|
| A | `web/lib/actions/comments.ts`, `web/lib/actions/issues.ts`, `web/components/detail/CommentComposer.tsx`, `web/components/detail/IssueDetail.tsx`, `web/components/detail/DetailTopBar.tsx` | `web/e2e/data-freshness.spec.ts` |
| B | `web/components/list/List.tsx`, `web/components/list/NavDrawerContent.module.css` | `web/components/list/PullToRefresh.tsx`, `web/components/list/PullToRefresh.module.css`, `web/e2e/pull-to-refresh.spec.ts` |
| C | `web/components/detail/IssueActionSheet.tsx`, `web/components/detail/LaunchCard.tsx` | (none) |
| D | `web/components/list/ListRow.tsx`, `web/components/list/ListRow.module.css` | (none) |
| E | `web/components/list/CreateDraftSheet.tsx`, `web/app/new/NewIssuePage.tsx` | (none) |
| F | `web/public/manifest.json`, `web/app/layout.tsx` | `web/public/apple-touch-icon.png` |

---

## Workstream A: Data Freshness Bugs (#128, #129, #131, #135)

### Task A1: Fix comment not showing after post (#135, #131)

**Files:**
- Modify: `packages/web/components/detail/CommentComposer.tsx`

The root cause: `CommentComposer` calls the `addComment` server action successfully, clears the textarea, but never tells the page to re-fetch data. The server action does `revalidateSafely()` which marks the server cache stale, but the client needs an explicit `router.refresh()` to pick up the new data.

- [ ] **Step 1: Write the E2E test for comment visibility**

Create `packages/web/e2e/data-freshness.spec.ts` with boilerplate matching the existing E2E pattern (server spawn on port 3853, `createTestDb`, `waitForServer`, cleanup):

```typescript
import { test, expect } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);

const TEST_PORT = 3853;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";

// ... standard canRun(), createTestDb(), waitForServer() (see existing specs for pattern) ...

test.describe("Data freshness — comment appears immediately (#135)", () => {
  test("comment is visible after posting without manual refresh", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);

    // Navigate to an issue detail page
    await page.goto(`${BASE_URL}/`);
    const issueLink = page.locator('a[href*="/issues/"]').first();
    await expect(issueLink).toBeVisible({ timeout: 15000 });
    await issueLink.click();

    // Wait for the comment composer to load
    const textarea = page.locator('textarea[aria-label="Comment body"]');
    await expect(textarea).toBeVisible({ timeout: 15000 });

    // Post a unique comment
    const commentText = `E2E test comment ${Date.now()}`;
    await textarea.fill(commentText);
    await page.click('button:has-text("comment")');

    // Comment should be visible WITHOUT a manual page refresh
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10000 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/web && npx playwright test e2e/data-freshness.spec.ts --project=chromium`
Expected: The comment visibility test FAILS because `CommentComposer` doesn't refresh the page.

- [ ] **Step 3: Fix CommentComposer — add router.refresh() after success**

In `packages/web/components/detail/CommentComposer.tsx`, add `useRouter` and call `router.refresh()` after a successful comment post:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { addComment } from "@/lib/actions/comments";
import styles from "./CommentComposer.module.css";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
};

export function CommentComposer({ owner, repo, issueNumber }: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (body.trim().length === 0) return;
    setSending(true);
    setError(null);
    try {
      const result = await addComment(owner, repo, issueNumber, body);
      if (!result.success) {
        setError(result.error ?? "Failed to post comment");
      } else {
        setBody("");
        router.refresh();
      }
    } catch {
      setError("Failed to post comment");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className={styles.composer}>
      <div className={styles.label}>add a comment</div>
      <textarea
        className={styles.textarea}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="write a comment..."
        rows={3}
        disabled={sending}
        aria-label="Comment body"
      />
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.footer}>
        <span className={styles.hint}>cmd+enter to send</span>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={sending || body.trim().length === 0}
        >
          {sending ? "sending..." : "comment"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the comment test to verify it passes**

Run: `cd packages/web && npx playwright test e2e/data-freshness.spec.ts -g "comment is visible"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/detail/CommentComposer.tsx packages/web/e2e/data-freshness.spec.ts
git commit -m "fix: refresh page after posting comment so it appears immediately (#135, #131)"
```

### Task A2: Fix createIssue not revalidating dashboard (#128)

**Files:**
- Modify: `packages/web/lib/actions/issues.ts`

The `createIssue` action revalidates `/${owner}/${repo}` but the dashboard lives at `/`. The index page fetches `getUnifiedList` on `/` — so `/` must be revalidated for the new issue to appear.

- [ ] **Step 1: Add E2E test for issue visibility on dashboard after creation**

Append to `packages/web/e2e/data-freshness.spec.ts`:

```typescript
test.describe("Data freshness — new issue visible on dashboard (#128)", () => {
  test("issue appears on index page after creation without manual refresh", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);

    await page.goto(`${BASE_URL}/new`);
    await expect(page.locator('input[type="text"]').first()).toBeVisible({ timeout: 15000 });

    const issueTitle = `E2E freshness test ${Date.now()}`;
    await page.locator('input[type="text"]').first().fill(issueTitle);
    await page.click('button:has-text("Create")');

    // After creation, the app navigates to the issue detail
    await expect(page).toHaveURL(/\/issues\//, { timeout: 15000 });

    // Navigate back to dashboard
    await page.click('a[aria-label="Back"]');
    await page.waitForLoadState("networkidle");

    // The issue should be visible without pulling to refresh
    await expect(page.getByText(issueTitle)).toBeVisible({ timeout: 10000 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/web && npx playwright test e2e/data-freshness.spec.ts -g "issue appears on index"`
Expected: FAIL — the issue is not visible because `/` was never revalidated.

- [ ] **Step 3: Fix createIssue to also revalidate "/"**

In `packages/web/lib/actions/issues.ts`, change line 84:

```typescript
// Before:
const { stale } = revalidateSafely(`/${owner}/${repo}`);

// After:
const { stale } = revalidateSafely("/", `/${owner}/${repo}`);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/web && npx playwright test e2e/data-freshness.spec.ts -g "issue appears on index"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/lib/actions/issues.ts
git commit -m "fix: revalidate dashboard after issue creation so it appears immediately (#128)"
```

### Task A3: Fix back-navigation dropping filters (#129)

**Files:**
- Modify: `packages/web/components/detail/DetailTopBar.tsx`

The root cause: `IssueDetail` hardcodes `backHref="/"` which drops all query params (repo, section, sort). When a user navigates from a filtered dashboard to an issue and back, they land on an unfiltered `/`.

The fix: Use `router.back()` for client-side back navigation, falling back to the hard link when there's no history entry.

- [ ] **Step 1: Add E2E test for filter persistence**

Append to `packages/web/e2e/data-freshness.spec.ts`:

```typescript
test.describe("Data freshness — filters persist on back-nav (#129)", () => {
  test("repo filter preserved when navigating back from issue detail", async ({ page }) => {
    if (skipReason) test.skip(true, skipReason);

    await page.goto(`${BASE_URL}/?repo=${TEST_OWNER}/${TEST_REPO}&section=in_focus`);
    await page.waitForLoadState("networkidle");

    const issueLink = page.locator('a[href*="/issues/"]').first();
    if (await issueLink.isVisible()) {
      await issueLink.click();
      await page.waitForLoadState("networkidle");

      // Click back
      await page.click('a[aria-label="Back"]');
      await page.waitForLoadState("networkidle");

      // URL should still have the repo filter
      expect(page.url()).toContain(`repo=${TEST_OWNER}/${TEST_REPO}`);
    }
  });
});
```

- [ ] **Step 2: Modify DetailTopBar to support client-side back navigation**

In `packages/web/components/detail/DetailTopBar.tsx`:

```typescript
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./DetailTopBar.module.css";

type Props = {
  backHref?: string;
  crumb?: ReactNode;
  menu?: ReactNode;
};

export function DetailTopBar({
  backHref = "/",
  crumb,
  menu,
}: Props) {
  const router = useRouter();

  function handleBack(e: React.MouseEvent) {
    // Use browser history when available so filter state is preserved.
    // Fall back to the hard link when there's no history (e.g. direct URL visit).
    if (window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  }

  return (
    <div className={styles.bar}>
      <Link
        href={backHref}
        className={styles.back}
        aria-label="Back"
        onClick={handleBack}
      >
        ‹
      </Link>
      {crumb && <div className={styles.crumb}>{crumb}</div>}
      {menu && <div className={styles.menu}>{menu}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Run the filter persistence E2E test**

Run: `cd packages/web && npx playwright test e2e/data-freshness.spec.ts -g "repo filter preserved"`
Expected: PASS — `router.back()` preserves the previous URL including query params.

- [ ] **Step 4: Run typecheck to ensure no regressions**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/detail/DetailTopBar.tsx
git commit -m "fix: use browser back navigation to preserve filter state (#129)"
```

---

## Workstream B: Mobile UX — Pull to Refresh & Hamburger (#133, #127)

### Task B1: Implement native-feeling pull-to-refresh (#133)

**Files:**
- Create: `packages/web/components/list/PullToRefresh.tsx`
- Create: `packages/web/components/list/PullToRefresh.module.css`
- Modify: `packages/web/components/list/List.tsx`

The current app has no pull-to-refresh — only a bottom edge-swipe for filters. A native-feeling pull-to-refresh needs: touch-start tracking at top of scroll, visual pull indicator, threshold trigger, and `router.refresh()` on release.

- [ ] **Step 1: Create PullToRefresh component**

Create `packages/web/components/list/PullToRefresh.tsx`:

```typescript
"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import styles from "./PullToRefresh.module.css";

type Props = {
  children: ReactNode;
};

const PULL_THRESHOLD = 80;
const MAX_PULL = 120;

export function PullToRefresh({ children }: Props) {
  const router = useRouter();
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return;
      // Only activate when scrolled to top
      const scrollTop =
        document.documentElement.scrollTop || document.body.scrollTop;
      if (scrollTop > 0) return;
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    },
    [refreshing],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isPulling.current || refreshing) return;
      const deltaY = e.touches[0].clientY - touchStartY.current;
      if (deltaY < 0) {
        isPulling.current = false;
        setPullDistance(0);
        return;
      }
      // Rubber-band effect: diminishing returns past threshold
      const dampened = Math.min(deltaY * 0.5, MAX_PULL);
      setPullDistance(dampened);
    },
    [refreshing],
  );

  const handleTouchEnd = useCallback(() => {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true);
      setPullDistance(PULL_THRESHOLD * 0.5);
      router.refresh();
      // Give the server time to respond, then reset
      setTimeout(() => {
        setRefreshing(false);
        setPullDistance(0);
      }, 1500);
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, router]);

  const indicatorOpacity = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const rotation = refreshing ? undefined : `rotate(${pullDistance * 3}deg)`;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={styles.wrapper}
    >
      <div
        className={styles.indicator}
        style={{
          height: pullDistance,
          opacity: indicatorOpacity,
        }}
        aria-hidden={pullDistance === 0}
      >
        <div
          className={`${styles.spinner} ${refreshing ? styles.spinning : ""}`}
          style={rotation ? { transform: rotation } : undefined}
        >
          ↻
        </div>
      </div>
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
          transition: isPulling.current ? "none" : "transform 0.3s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create PullToRefresh styles**

Create `packages/web/components/list/PullToRefresh.module.css`:

```css
.wrapper {
  position: relative;
  overflow: hidden;
}

.indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: height 0.3s ease, opacity 0.3s ease;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
}

.spinner {
  font-size: var(--paper-fs-xl);
  color: var(--paper-accent);
  line-height: 1;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
```

- [ ] **Step 3: Integrate PullToRefresh into List component**

In `packages/web/components/list/List.tsx`, wrap the main content:

Add import:
```typescript
import { PullToRefresh } from "./PullToRefresh";
```

Wrap the return:
```typescript
return (
  <PullToRefresh>
    <div className={styles.container}>
      {/* ...existing content unchanged... */}
    </div>
  </PullToRefresh>
);
```

- [ ] **Step 4: Write E2E test for pull-to-refresh**

Create `packages/web/e2e/pull-to-refresh.spec.ts` following the same boilerplate pattern (port 3854). Test that:
1. The PullToRefresh wrapper renders on the dashboard
2. A touch-swipe gesture from top triggers the refresh indicator
3. The page still renders correctly after the gesture

- [ ] **Step 5: Run typecheck and tests**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/components/list/PullToRefresh.tsx packages/web/components/list/PullToRefresh.module.css packages/web/components/list/List.tsx packages/web/e2e/pull-to-refresh.spec.ts
git commit -m "feat: add native-feeling pull-to-refresh gesture on mobile (#133)"
```

### Task B2: Mobile-optimize hamburger menu (#127)

**Files:**
- Modify: `packages/web/components/list/List.tsx` (menu button only)
- Modify: `packages/web/components/list/NavDrawerContent.module.css`

The hamburger menu needs: larger touch targets, visual grouping, and a proper hamburger icon instead of `"···"`.

- [ ] **Step 1: Update the menu button to a proper hamburger icon**

In `packages/web/components/list/List.tsx`, replace the `"···"` text in the menu button (line 182) with an SVG hamburger:

```typescript
<button
  className={styles.menuBtn}
  onClick={() => setDrawerOpen(true)}
  aria-label="Open navigation"
>
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
</button>
```

- [ ] **Step 2: Enhance NavDrawerContent with mobile-first styling**

In `packages/web/components/list/NavDrawerContent.module.css`, ensure all items meet 44px min touch targets and have mobile-native feel:

```css
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  min-height: 44px;
  font-size: var(--paper-fs-md);
  color: var(--paper-ink);
  text-decoration: none;
  border-radius: var(--paper-radius-md);
  transition: background-color 0.15s ease;
}

.item:active {
  background-color: var(--paper-ink-10);
}

.sectionLabel {
  padding: 20px 16px 8px;
  font-size: var(--paper-fs-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--paper-ink-faint);
}
```

- [ ] **Step 3: Run mobile E2E tests to verify touch targets**

Run: `cd packages/web && npx playwright test e2e/mobile-ux-patterns.spec.ts --project=mobile`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/list/List.tsx packages/web/components/list/NavDrawerContent.module.css
git commit -m "fix: mobile-optimize hamburger menu with proper icon and touch targets (#127)"
```

---

## Workstream C: Launch Button Relocation (#137)

### Task C1: Move launch button from inline body to action sheet

**Files:**
- Modify: `packages/web/components/detail/IssueActionSheet.tsx`
- Modify: `packages/web/components/detail/LaunchCard.tsx`

The LaunchCard currently renders inline in the issue body area. The user wants the "launch" action moved into the swipe-up action sheet. The active deployment banner should still show inline (it's status, not an action).

- [ ] **Step 1: Add launch action to IssueActionSheet**

In `packages/web/components/detail/IssueActionSheet.tsx`, add a launch button alongside the close button. Import `LaunchModal` and manage its open state:

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  GitHubIssue,
  GitHubComment,
  Deployment,
  WorkspaceMode,
} from "@issuectl/core";
import { Sheet } from "@/components/paper";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FilterEdgeSwipe } from "@/components/list/FilterEdgeSwipe";
import { LaunchModal } from "@/components/launch/LaunchModal";
import { closeIssue } from "@/lib/actions/issues";
import { useToast } from "@/components/ui/ToastProvider";
import styles from "./ActionSheet.module.css";

type Props = {
  owner: string;
  repo: string;
  number: number;
  repoLocalPath: string | null;
  issue: GitHubIssue;
  comments: GitHubComment[];
  deployments: Deployment[];
  referencedFiles: string[];
  initialWorkspaceMode?: WorkspaceMode;
  hasLiveDeployment: boolean;
};

export function IssueActionSheet({
  owner,
  repo,
  number,
  repoLocalPath,
  issue,
  comments,
  deployments,
  referencedFiles,
  initialWorkspaceMode,
  hasLiveDeployment,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLaunchTap() {
    setSheetOpen(false);
    setLaunchOpen(true);
  }

  function handleCloseTap() {
    setSheetOpen(false);
    setConfirmClose(true);
  }

  function handleCloseConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await closeIssue(owner, repo, number);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setConfirmClose(false);
        showToast("Issue closed", "success");
        router.refresh();
      } catch {
        setError("Unable to reach the server.");
      }
    });
  }

  return (
    <>
      <FilterEdgeSwipe onTrigger={() => setSheetOpen(true)} label="Actions" />

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="issue actions">
        {!hasLiveDeployment && (
          <button className={styles.item} onClick={handleLaunchTap}>
            <span className={styles.icon}>&#x25B6;</span>
            Launch with Claude
          </button>
        )}
        <button className={`${styles.item} ${styles.danger}`} onClick={handleCloseTap}>
          <span className={styles.icon}>&bull;</span>
          Close issue
        </button>
      </Sheet>

      {launchOpen && (
        <LaunchModal
          owner={owner}
          repo={repo}
          repoLocalPath={repoLocalPath}
          issue={issue}
          comments={comments}
          deployments={deployments}
          referencedFiles={referencedFiles}
          initialWorkspaceMode={initialWorkspaceMode}
          onClose={() => setLaunchOpen(false)}
        />
      )}

      {confirmClose && (
        <ConfirmDialog
          title="Close Issue"
          message={`Close issue #${number}? This can be reopened later from GitHub.`}
          confirmLabel="Close Issue"
          onConfirm={handleCloseConfirm}
          onCancel={() => setConfirmClose(false)}
          isPending={isPending}
          error={error ?? undefined}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Update LaunchCard to only render the active deployment banner**

Modify `packages/web/components/detail/LaunchCard.tsx` — remove the "Ready to launch" card UI. Only render the `LaunchActiveBanner` when there's a live deployment:

```typescript
"use client";

import type { Deployment } from "@issuectl/core";
import { LaunchActiveBanner } from "@/components/launch/LaunchActiveBanner";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
  deployments: Deployment[];
};

export function LaunchCard({ owner, repo, issueNumber, deployments }: Props) {
  const liveDeployment = deployments.find((d) => d.endedAt === null);
  if (!liveDeployment) return null;

  return (
    <LaunchActiveBanner
      deploymentId={liveDeployment.id}
      branchName={liveDeployment.branchName}
      endedAt={liveDeployment.endedAt}
      owner={owner}
      repo={repo}
      issueNumber={issueNumber}
    />
  );
}
```

- [ ] **Step 3: Thread launch props through IssueDetail to IssueActionSheet**

Update `IssueDetail.tsx` and the issue detail page to pass launch-related data (repoLocalPath, comments, deployments, referencedFiles) through to `IssueActionSheet`. The exact wiring depends on the current `IssueDetailContent` component — read it and update the props chain so `IssueActionSheet` receives what it needs.

Key changes:
- `IssueDetail` props expand to include launch data
- `IssueActionSheet` receives those props
- `LaunchCard` simplifies to banner-only with reduced props

- [ ] **Step 4: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 5: Run mobile E2E to verify the action sheet renders correctly**

Run: `cd packages/web && npx playwright test e2e/mobile-ux-patterns.spec.ts --project=mobile`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/components/detail/IssueActionSheet.tsx packages/web/components/detail/LaunchCard.tsx packages/web/components/detail/IssueDetail.tsx
git commit -m "feat: move launch button from inline body to swipe-up action sheet (#137)"
```

---

## Workstream D: Show Issue Author in List (#130)

### Task D1: Display issue creator in ListRow

**Files:**
- Modify: `packages/web/components/list/ListRow.tsx`
- Modify: `packages/web/components/list/ListRow.module.css`

The `GitHubIssue` type already has `user: GitHubUser | null` with `login` and `avatarUrl`. The `ListRow` component just doesn't render it. The user wants to see when Sentry, Dependabot, etc. created issues.

- [ ] **Step 1: Add author display to ListRow**

In `packages/web/components/list/ListRow.tsx`, in the issue (non-draft) branch, add the author after the age span (around line 115):

```typescript
<span className={styles.sep}>.</span>
<span>{formatAge(issue.updatedAt)}</span>
{issue.user && (
  <>
    <span className={styles.sep}>.</span>
    <span className={styles.author}>{issue.user.login}</span>
  </>
)}
```

- [ ] **Step 2: Add author styles**

In `packages/web/components/list/ListRow.module.css`, add:

```css
.author {
  color: var(--paper-ink-faint);
  font-size: var(--paper-fs-xs);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/list/ListRow.tsx packages/web/components/list/ListRow.module.css
git commit -m "feat: show issue author in list rows (#130)"
```

---

## Workstream E: Labels in Draft Creation (#132)

### Task E1: Improve label discoverability for issue creation

**Files:**
- Modify: `packages/web/components/list/CreateDraftSheet.tsx`
- Modify: `packages/web/app/new/NewIssuePage.tsx`

The NewIssuePage already has a full label picker that fetches repo-specific labels. But:
1. The CreateDraftSheet (FAB quick-create) has no path to labels
2. If repo labels haven't been cached yet, NewIssuePage shows nothing

Fix both: (a) add a "create with labels" link to CreateDraftSheet that opens `/new`, and (b) show standard fallback labels in NewIssuePage when repo labels are unavailable.

- [ ] **Step 1: Read CreateDraftSheet to understand current structure**

Read `packages/web/components/list/CreateDraftSheet.tsx` before modifying.

- [ ] **Step 2: Add "create with labels" link to CreateDraftSheet**

After the draft creation form in CreateDraftSheet, add a link to the full New Issue page:

```typescript
import Link from "next/link";

// Inside the sheet content, below the submit button:
<Link href="/new" className={styles.labelLink} onClick={onClose}>
  or create with labels and repo
</Link>
```

Add corresponding style:
```css
.labelLink {
  display: block;
  text-align: center;
  padding: 8px 0;
  font-size: var(--paper-fs-sm);
  color: var(--paper-ink-faint);
  text-decoration: none;
}
```

- [ ] **Step 3: Add standard fallback labels to NewIssuePage**

In `packages/web/app/new/NewIssuePage.tsx`, if no repo labels are available, show a standard set:

```typescript
const STANDARD_LABELS: GitHubLabel[] = [
  { name: "bug", color: "d73a4a", description: null },
  { name: "enhancement", color: "a2eeef", description: null },
  { name: "documentation", color: "0075ca", description: null },
  { name: "question", color: "d876e3", description: null },
];

// Update the availableLabels memo:
const availableLabels = useMemo(() => {
  const repoLabels = (labelsPerRepo[repoKey] ?? []).filter(
    (l) => !isLifecycleLabel(l.name),
  );
  return repoLabels.length > 0 ? repoLabels : STANDARD_LABELS;
}, [labelsPerRepo, repoKey]);
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/list/CreateDraftSheet.tsx packages/web/app/new/NewIssuePage.tsx
git commit -m "feat: show standard label tags in issue creation (#132)"
```

---

## Workstream F: Safari PWA Fix (#126)

### Task F1: Add Apple-specific PWA meta tags and icon

**Files:**
- Modify: `packages/web/app/layout.tsx`
- Modify: `packages/web/public/manifest.json`
- Create: `packages/web/public/apple-touch-icon.png`

Safari requires specific meta tags for "Add to Home Screen":
- `<meta name="apple-mobile-web-app-capable" content="yes" />`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`
- `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`
- A 180x180px PNG icon (Safari ignores SVG)

- [ ] **Step 1: Read the current layout.tsx**

Read `packages/web/app/layout.tsx` to see existing head/meta structure.

- [ ] **Step 2: Add Apple PWA meta tags to layout.tsx**

In the metadata export or `<head>` section of `layout.tsx`, add:

```typescript
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="issuectl" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

- [ ] **Step 3: Generate 180x180 PNG icon**

Convert existing `icon.svg` to 180x180 PNG for Apple Touch Icon. On macOS:

```bash
cd packages/web/public && sips -s format png --resampleWidth 180 --resampleHeight 180 icon.svg --out apple-touch-icon.png
```

If `sips` doesn't handle SVG, use a canvas-based approach or create a simple solid-color icon matching the theme.

- [ ] **Step 4: Update manifest.json with PNG icon entry**

In `packages/web/public/manifest.json`:

```json
{
  "name": "issuectl",
  "short_name": "issuectl",
  "description": "Cross-repo GitHub issue command center",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f3ecd9",
  "theme_color": "#f3ecd9",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any"
    },
    {
      "src": "/apple-touch-icon.png",
      "sizes": "180x180",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 5: Add E2E test for Apple PWA meta tags**

Append to `packages/web/e2e/pwa-offline.spec.ts`:

```typescript
test("Apple PWA meta tags are present", async ({ page }) => {
  if (skipReason) test.skip(true, skipReason);
  await page.goto(BASE_URL);

  const capable = await page.locator(
    'meta[name="apple-mobile-web-app-capable"]',
  ).getAttribute("content");
  expect(capable).toBe("yes");

  const touchIcon = await page.locator(
    'link[rel="apple-touch-icon"]',
  ).getAttribute("href");
  expect(touchIcon).toBe("/apple-touch-icon.png");
});
```

- [ ] **Step 6: Run typecheck and tests**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/web/app/layout.tsx packages/web/public/manifest.json packages/web/public/apple-touch-icon.png packages/web/e2e/pwa-offline.spec.ts
git commit -m "fix: add Apple-specific meta tags and icon for Safari PWA installation (#126)"
```

---

## Cross-Workstream: Final E2E Verification

After all workstreams merge, run the full E2E suite to catch any interaction between changes:

```bash
cd packages/web && npx playwright test --project=chromium --project=mobile
pnpm turbo typecheck
pnpm turbo build
```

---

## Summary of Excluded Issues (Next Batch)

These issues should be tackled after this batch lands:

1. **#134 — Async Processing Research**: Audit every synchronous blocking operation. Identify candidates for background processing (repo add, issue sync, label fetch). This informs #138 and #139.

2. **#139 — Performance**: After #134 research, profile with Lighthouse and React DevTools. Likely wins: virtual scrolling, request dedup, memoization.

3. **#138 — Offline Mode**: Major feature. Requires: IndexedDB or SQLite-backed mutation queue, visual queue indicators, reconnection sync, conflict resolution. Depends on #134 research and the data-freshness fixes in Workstream A.

4. **#108 / #136 — MacBook Pro Deployment**: Ops task. Document deployment steps, DNS/tunnel setup, Claude Deploy config.

5. **#113 — Claude App Launch Research**: Investigate whether Claude's managed launch system exposes a deep-link or API that issuectl could use.
