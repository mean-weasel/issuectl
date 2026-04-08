# Phase 15: Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add error boundaries, loading skeletons, dashboard SWR revalidation, and toast notifications to complete the polish layer of the issuectl web dashboard.

**Architecture:** Four independent sub-commits, each adding one concern. Error boundaries and 404 pages catch uncaught exceptions. A settings loading skeleton fills the last gap. A client wrapper component on the dashboard auto-triggers revalidation when cache is stale. A React context-based toast system provides mutation feedback across all client components.

**Tech Stack:** Next.js App Router (error.tsx / not-found.tsx conventions), React context + `useTransition`, CSS Modules, existing design tokens from `globals.css`.

---

## File Map

### Task 1 — Error Boundaries + 404s
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/web/app/error.tsx` | Root error boundary — catches uncaught errors, shows message + retry |
| Create | `packages/web/app/error.module.css` | Styles for root error boundary |
| Create | `packages/web/app/not-found.tsx` | Root 404 page — "Page not found" + link to dashboard |
| Create | `packages/web/app/not-found.module.css` | Styles for root 404 page |
| Create | `packages/web/app/[owner]/[repo]/error.tsx` | Repo-level error boundary — same pattern, breadcrumb to dashboard |
| Create | `packages/web/app/[owner]/[repo]/error.module.css` | Styles for repo error boundary |
| Create | `packages/web/app/[owner]/[repo]/not-found.tsx` | Repo 404 — "Repository not found" + link to settings |
| Create | `packages/web/app/[owner]/[repo]/not-found.module.css` | Styles for repo 404 |

### Task 2 — Settings Loading Skeleton
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/web/app/settings/loading.tsx` | Skeleton UI matching settings page layout |
| Create | `packages/web/app/settings/loading.module.css` | Pulse animation styles for settings skeleton |

### Task 3 — Dashboard SWR Revalidation
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/web/components/dashboard/DashboardCacheStatus.tsx` | Client wrapper owning revalidation state, renders CacheBar + triggers refresh |
| Modify | `packages/web/components/dashboard/CacheBar.tsx` | Accept `isRevalidating` prop, show "updating..." state |
| Modify | `packages/web/components/dashboard/CacheBar.module.css` | Add pulsing dot style for revalidating state |
| Modify | `packages/web/app/page.tsx` | Compute `isStale`, render `DashboardCacheStatus` instead of raw `CacheBar` |

### Task 4 — Toast Notifications
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/web/components/ui/Toast.tsx` | ToastProvider context + Toast display component + `useToast` hook |
| Create | `packages/web/components/ui/Toast.module.css` | Toast positioning, slide animation, success/error variants |
| Create | `packages/web/components/ui/ToastProvider.tsx` | Client wrapper that provides toast context to the app |
| Modify | `packages/web/app/layout.tsx` | Wrap authenticated children in `<ToastProvider>` |
| Modify | `packages/web/components/issue/CommentForm.tsx` | Call `showToast` on success |
| Modify | `packages/web/components/issue/CloseIssueButton.tsx` | Call `showToast` on success |
| Modify | `packages/web/components/issue/CreateIssueModal.tsx` | Call `showToast` on success |
| Modify | `packages/web/components/issue/EditIssueForm.tsx` | Call `showToast` on success |
| Modify | `packages/web/components/issue/LabelManager.tsx` | Call `showToast` on success |
| Modify | `packages/web/components/settings/AddRepoForm.tsx` | Call `showToast` on success |

---

## Task 1: Error Boundaries + 404 Pages

**Files:**
- Create: `packages/web/app/error.tsx`
- Create: `packages/web/app/error.module.css`
- Create: `packages/web/app/not-found.tsx`
- Create: `packages/web/app/not-found.module.css`
- Create: `packages/web/app/[owner]/[repo]/error.tsx`
- Create: `packages/web/app/[owner]/[repo]/error.module.css`
- Create: `packages/web/app/[owner]/[repo]/not-found.tsx`
- Create: `packages/web/app/[owner]/[repo]/not-found.module.css`

- [ ] **Step 1: Create root error boundary CSS**

Create `packages/web/app/error.module.css`:

```css
.container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.inner {
  max-width: 480px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.icon {
  width: 56px;
  height: 56px;
  background: var(--red-surface);
  border: 1px solid rgba(248, 81, 73, 0.2);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--red);
  font-weight: 700;
}

.title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.message {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.hint {
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.6;
  font-family: var(--font-mono);
}

.retryButton {
  padding: 10px 24px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.retryButton:hover {
  background: var(--bg-hover);
}
```

- [ ] **Step 2: Create root error boundary component**

Create `packages/web/app/error.tsx`:

```tsx
"use client";

import styles from "./error.module.css";

function getHint(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit")) {
    return "This may be a GitHub rate limit — wait a moment and try again.";
  }
  if (lower.includes("401") || lower.includes("auth") || lower.includes("token")) {
    return "Your GitHub token may have expired — re-run `gh auth login` in your terminal.";
  }
  return null;
}

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: Props) {
  const hint = getHint(error.message);

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.icon}>!</div>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.message}>{error.message}</p>
        {hint && <p className={styles.hint}>{hint}</p>}
        <button className={styles.retryButton} onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create root 404 CSS**

Create `packages/web/app/not-found.module.css`:

```css
.container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.inner {
  max-width: 480px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.icon {
  width: 56px;
  height: 56px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--text-tertiary);
  font-weight: 700;
}

.title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.message {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.link {
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
}

.link:hover {
  text-decoration: underline;
}
```

- [ ] **Step 4: Create root 404 page**

Create `packages/web/app/not-found.tsx`:

```tsx
import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.icon}>?</div>
        <h1 className={styles.title}>Page not found</h1>
        <p className={styles.message}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/" className={styles.link}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create repo-level error boundary CSS**

Create `packages/web/app/[owner]/[repo]/error.module.css`:

```css
.container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.inner {
  max-width: 480px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.icon {
  width: 56px;
  height: 56px;
  background: var(--red-surface);
  border: 1px solid rgba(248, 81, 73, 0.2);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--red);
  font-weight: 700;
}

.title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.message {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.hint {
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.6;
  font-family: var(--font-mono);
}

.actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.retryButton {
  padding: 10px 24px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.retryButton:hover {
  background: var(--bg-hover);
}

.link {
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
}

.link:hover {
  text-decoration: underline;
}
```

- [ ] **Step 6: Create repo-level error boundary component**

Create `packages/web/app/[owner]/[repo]/error.tsx`:

```tsx
"use client";

import Link from "next/link";
import styles from "./error.module.css";

function getHint(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit")) {
    return "This may be a GitHub rate limit — wait a moment and try again.";
  }
  if (lower.includes("401") || lower.includes("auth") || lower.includes("token")) {
    return "Your GitHub token may have expired — re-run `gh auth login` in your terminal.";
  }
  return null;
}

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RepoErrorPage({ error, reset }: Props) {
  const hint = getHint(error.message);

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.icon}>!</div>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.message}>{error.message}</p>
        {hint && <p className={styles.hint}>{hint}</p>}
        <div className={styles.actions}>
          <button className={styles.retryButton} onClick={reset}>
            Try again
          </button>
          <Link href="/" className={styles.link}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create repo-level 404 CSS**

Create `packages/web/app/[owner]/[repo]/not-found.module.css`:

```css
.container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.inner {
  max-width: 480px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.icon {
  width: 56px;
  height: 56px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--text-tertiary);
  font-weight: 700;
}

.title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.message {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.link {
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
}

.link:hover {
  text-decoration: underline;
}
```

- [ ] **Step 8: Create repo-level 404 page**

Create `packages/web/app/[owner]/[repo]/not-found.tsx`:

```tsx
import Link from "next/link";
import styles from "./not-found.module.css";

export default function RepoNotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.icon}>?</div>
        <h1 className={styles.title}>Repository not found</h1>
        <p className={styles.message}>
          This repository isn't tracked by issuectl, or it may have been removed.
        </p>
        <div className={styles.actions}>
          <Link href="/settings" className={styles.link}>
            Check Settings
          </Link>
          <Link href="/" className={styles.link}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Type-check**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 10: Commit**

```bash
git add packages/web/app/error.tsx packages/web/app/error.module.css \
  packages/web/app/not-found.tsx packages/web/app/not-found.module.css \
  packages/web/app/\[owner\]/\[repo\]/error.tsx packages/web/app/\[owner\]/\[repo\]/error.module.css \
  packages/web/app/\[owner\]/\[repo\]/not-found.tsx packages/web/app/\[owner\]/\[repo\]/not-found.module.css
git commit -m "feat: add error boundaries and 404 pages at root and repo level"
```

---

## Task 2: Settings Loading Skeleton

**Files:**
- Create: `packages/web/app/settings/loading.tsx`
- Create: `packages/web/app/settings/loading.module.css`

- [ ] **Step 1: Create settings loading skeleton CSS**

Create `packages/web/app/settings/loading.module.css`:

The settings page has: a `PageHeader` with title "Settings", then a `.content` div (max-width: 720px, padding: 20px 32px 32px) containing 5 sections each with a `.sectionTitle` (16px display font) and content below it. The skeleton should mirror this.

```css
@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.15; }
}

.container {
  display: flex;
  flex-direction: column;
}

.headerSkeleton {
  padding: 24px 32px 0;
  margin-bottom: 16px;
}

.titleBar {
  height: 32px;
  width: 120px;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  animation: pulse 1.8s ease-in-out infinite;
}

.content {
  padding: 20px 32px 32px;
  max-width: 720px;
}

.section {
  margin-bottom: 32px;
}

.sectionTitle {
  width: 180px;
  height: 16px;
  background: var(--bg-elevated);
  border-radius: 4px;
  margin-bottom: 16px;
  animation: pulse 1.8s ease-in-out infinite;
}

.row {
  height: 40px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  animation: pulse 1.8s ease-in-out infinite 0.1s;
}

.rowWide {
  height: 40px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  width: 100%;
  animation: pulse 1.8s ease-in-out infinite 0.2s;
}

.rowShort {
  height: 40px;
  width: 200px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  animation: pulse 1.8s ease-in-out infinite 0.3s;
}
```

- [ ] **Step 2: Create settings loading skeleton component**

Create `packages/web/app/settings/loading.tsx`:

```tsx
import styles from "./loading.module.css";

export default function Loading() {
  return (
    <div className={styles.container}>
      <div className={styles.headerSkeleton}>
        <div className={styles.titleBar} />
      </div>
      <div className={styles.content}>
        {/* Tracked Repositories */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} />
          <div className={styles.row} />
          <div className={styles.row} />
          <div className={styles.row} />
        </div>

        {/* Defaults */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} />
          <div className={styles.rowWide} />
          <div className={styles.rowShort} />
        </div>

        {/* Terminal */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} />
          <div className={styles.rowShort} />
        </div>

        {/* Worktrees */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} />
          <div className={styles.rowWide} />
        </div>

        {/* Authentication */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} />
          <div className={styles.rowShort} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/settings/loading.tsx packages/web/app/settings/loading.module.css
git commit -m "feat: add settings page loading skeleton"
```

---

## Task 3: Dashboard SWR Revalidation

**Files:**
- Create: `packages/web/components/dashboard/DashboardCacheStatus.tsx`
- Modify: `packages/web/components/dashboard/CacheBar.tsx`
- Modify: `packages/web/components/dashboard/CacheBar.module.css`
- Modify: `packages/web/app/page.tsx`

- [ ] **Step 1: Update CacheBar to accept `isRevalidating` prop**

Modify `packages/web/components/dashboard/CacheBar.tsx`. The component currently owns its own `useTransition` for manual refresh. It needs to also accept an `isRevalidating` prop for auto-triggered revalidation and an `onManualRefresh` callback (since the parent will own the refresh action now).

Replace the entire file with:

```tsx
import styles from "./CacheBar.module.css";

type Props = {
  cachedAt: string | null;
  totalIssues: number;
  totalPRs: number;
  isRevalidating: boolean;
  onManualRefresh: () => void;
};

function formatAge(dateStr: string | null): string {
  if (!dateStr) return "not cached";
  const ms = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  return `${minutes} minutes ago`;
}

export function CacheBar({
  cachedAt,
  totalIssues,
  totalPRs,
  isRevalidating,
  onManualRefresh,
}: Props) {
  return (
    <div className={styles.bar}>
      <span className={isRevalidating ? styles.dotPulsing : styles.dot} />
      <span>
        cached {formatAge(cachedAt)} &middot; {totalIssues} issues &middot;{" "}
        {totalPRs} PRs
      </span>
      {isRevalidating ? (
        <span className={styles.updating}>updating...</span>
      ) : (
        <button
          className={styles.refreshLink}
          onClick={onManualRefresh}
        >
          refresh now
        </button>
      )}
    </div>
  );
}
```

Note: `CacheBar` is no longer `"use client"` on its own — it no longer uses hooks. It will be rendered inside the client wrapper `DashboardCacheStatus`.

- [ ] **Step 2: Update CacheBar CSS for revalidating state**

Add to `packages/web/components/dashboard/CacheBar.module.css`, appending after the existing `.refreshLink:disabled` rule:

```css
.dotPulsing {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--yellow);
  animation: dotPulse 1s ease-in-out infinite;
}

@keyframes dotPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.updating {
  margin-left: auto;
  color: var(--text-tertiary);
  font-size: 11px;
  font-family: inherit;
  animation: dotPulse 1s ease-in-out infinite;
}
```

- [ ] **Step 3: Create DashboardCacheStatus client wrapper**

Create `packages/web/components/dashboard/DashboardCacheStatus.tsx`:

```tsx
"use client";

import { useEffect, useTransition } from "react";
import { refreshDashboard } from "@/lib/actions/refresh";
import { CacheBar } from "./CacheBar";

type Props = {
  cachedAt: string | null;
  totalIssues: number;
  totalPRs: number;
  isStale: boolean;
};

export function DashboardCacheStatus({
  cachedAt,
  totalIssues,
  totalPRs,
  isStale,
}: Props) {
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isStale) {
      startTransition(async () => {
        await refreshDashboard();
      });
    }
  }, [isStale]);

  function handleManualRefresh() {
    startTransition(async () => {
      await refreshDashboard();
    });
  }

  return (
    <CacheBar
      cachedAt={cachedAt}
      totalIssues={totalIssues}
      totalPRs={totalPRs}
      isRevalidating={isPending}
      onManualRefresh={handleManualRefresh}
    />
  );
}
```

- [ ] **Step 4: Update dashboard page to use DashboardCacheStatus**

Modify `packages/web/app/page.tsx`. Replace the entire file with:

```tsx
import { getDb, getOctokit, getDashboardData, getCacheTtl, dbExists, listRepos } from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import { RepoGrid } from "@/components/dashboard/RepoGrid";
import { DashboardCacheStatus } from "@/components/dashboard/DashboardCacheStatus";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!dbExists()) {
    return <WelcomeScreen />;
  }

  const db = getDb();

  if (listRepos(db).length === 0) {
    return <WelcomeScreen />;
  }

  let data;

  try {
    const octokit = await getOctokit();
    data = await getDashboardData(db, octokit);
  } catch (err) {
    console.error("[issuectl] Dashboard data fetch failed:", err);
    data = { repos: [], totalIssues: 0, totalPRs: 0, cachedAt: null };
  }

  const cachedAtIso = data.cachedAt?.toISOString() ?? null;
  const ttl = getCacheTtl(db);
  const isStale = data.cachedAt
    ? Date.now() - data.cachedAt.getTime() > ttl * 1000
    : false;

  return (
    <>
      <PageHeader
        title={
          <>
            <span style={{ color: "var(--accent)" }}>{data.repos.length}</span>{" "}
            {data.repos.length === 1 ? "Repository" : "Repositories"}
          </>
        }
      />
      <DashboardCacheStatus
        cachedAt={cachedAtIso}
        totalIssues={data.totalIssues}
        totalPRs={data.totalPRs}
        isStale={isStale}
      />
      <RepoGrid repos={data.repos} />
    </>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web/components/dashboard/DashboardCacheStatus.tsx \
  packages/web/components/dashboard/CacheBar.tsx \
  packages/web/components/dashboard/CacheBar.module.css \
  packages/web/app/page.tsx
git commit -m "feat: add dashboard SWR revalidation with auto-refresh on stale cache"
```

---

## Task 4: Toast Notifications

**Files:**
- Create: `packages/web/components/ui/Toast.tsx`
- Create: `packages/web/components/ui/Toast.module.css`
- Create: `packages/web/components/ui/ToastProvider.tsx`
- Modify: `packages/web/app/layout.tsx`
- Modify: `packages/web/components/issue/CommentForm.tsx`
- Modify: `packages/web/components/issue/CloseIssueButton.tsx`
- Modify: `packages/web/components/issue/CreateIssueModal.tsx`
- Modify: `packages/web/components/issue/EditIssueForm.tsx`
- Modify: `packages/web/components/issue/LabelManager.tsx`
- Modify: `packages/web/components/settings/AddRepoForm.tsx`

- [ ] **Step 1: Create Toast CSS**

Create `packages/web/components/ui/Toast.module.css`:

```css
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  animation: slideIn 0.2s ease-out;
  max-width: 360px;
}

.toast[data-exiting="true"] {
  animation: slideOut 0.15s ease-in forwards;
}

.success {
  border-left: 3px solid var(--green);
}

.error {
  border-left: 3px solid var(--red);
}

.message {
  flex: 1;
}

.dismiss {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 16px;
  padding: 0;
  line-height: 1;
}

.dismiss:hover {
  color: var(--text-secondary);
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOut {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
```

- [ ] **Step 2: Create Toast component**

Create `packages/web/components/ui/Toast.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import styles from "./Toast.module.css";

export type ToastType = "success" | "error";

type ToastData = {
  message: string;
  type: ToastType;
  id: number;
};

type Props = {
  toast: ToastData;
  onDismiss: () => void;
};

export function Toast({ toast, onDismiss }: Props) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 150);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  function handleDismiss() {
    setExiting(true);
    setTimeout(onDismiss, 150);
  }

  return (
    <div
      className={cn(styles.toast, styles[toast.type])}
      data-exiting={exiting ? "true" : undefined}
      role="status"
    >
      <span className={styles.message}>{toast.message}</span>
      <button className={styles.dismiss} onClick={handleDismiss} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
}

export type { ToastData };
```

- [ ] **Step 3: Create ToastProvider**

Create `packages/web/components/ui/ToastProvider.tsx`:

```tsx
"use client";

import { createContext, useContext, useCallback, useState, type ReactNode } from "react";
import { Toast, type ToastType, type ToastData } from "./Toast";

type ToastContextValue = {
  showToast: (message: string, type: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type, id: ++nextId });
  }, []);

  return (
    <ToastContext value={{ showToast }}>
      {children}
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
```

- [ ] **Step 4: Update layout.tsx to wrap with ToastProvider**

Modify `packages/web/app/layout.tsx`. Add the `ToastProvider` import and wrap the authenticated content:

Replace the entire file with:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Karla, Syne, Source_Code_Pro } from "next/font/google";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { AuthErrorScreen } from "@/components/auth/AuthErrorScreen";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { getAuthStatus } from "@/lib/auth";
import "./globals.css";
import styles from "./layout.module.css";

const karla = Karla({
  subsets: ["latin"],
  variable: "--font-karla",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-display",
});

const sourceCodePro = Source_Code_Pro({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "issuectl",
  description: "Cross-repo GitHub issue command center",
};

type Props = {
  children: ReactNode;
};

export default async function RootLayout({ children }: Props) {
  const auth = await getAuthStatus();

  return (
    <html lang="en" className={`${karla.variable} ${syne.variable} ${sourceCodePro.variable}`}>
      <body className={karla.className}>
        {auth.authenticated ? (
          <ToastProvider>
            <div className={styles.app}>
              <Sidebar username={auth.username} />
              <main className={styles.content}>{children}</main>
            </div>
          </ToastProvider>
        ) : (
          <AuthErrorScreen />
        )}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Update CommentForm to use toast**

Modify `packages/web/components/issue/CommentForm.tsx`.

Add import at the top (after existing imports):

```tsx
import { useToast } from "@/components/ui/ToastProvider";
```

Inside the component, add at the top of the function body:

```tsx
const { showToast } = useToast();
```

In `handleSubmit`, after `setBody("")` and `setError(null)`, update the `startTransition` callback:

```tsx
startTransition(async () => {
  const result = await addComment(owner, repo, issueNumber, text);
  if (!result.success) {
    setBody(text);
    setError(result.error ?? "Failed to post comment. Please try again.");
  } else {
    showToast("Comment posted", "success");
  }
});
```

The only change is adding the `else { showToast(...) }` branch.

- [ ] **Step 6: Update CloseIssueButton to use toast**

Modify `packages/web/components/issue/CloseIssueButton.tsx`.

Add import at the top:

```tsx
import { useToast } from "@/components/ui/ToastProvider";
```

Inside the component, add at the top of the function body:

```tsx
const { showToast } = useToast();
```

In `handleClose`, update the `startTransition` callback — add `showToast` after the success path:

```tsx
startTransition(async () => {
  const result = await closeIssue(owner, repo, number);
  if (!result.success) {
    setError(result.error ?? "Failed to close issue. Please try again.");
    return;
  }
  setShowConfirm(false);
  showToast("Issue closed", "success");
});
```

- [ ] **Step 7: Update CreateIssueModal to use toast**

Modify `packages/web/components/issue/CreateIssueModal.tsx`.

Add import at the top:

```tsx
import { useToast } from "@/components/ui/ToastProvider";
```

Inside the component, add at the top of the function body:

```tsx
const { showToast } = useToast();
```

In `handleSubmit`, add `showToast` before the router push:

```tsx
startTransition(async () => {
  const result = await createIssue({
    owner: selectedRepo.owner,
    repo: selectedRepo.repo,
    title,
    body: body || undefined,
    labels: selectedLabels.length > 0 ? selectedLabels : undefined,
  });

  if (!result.success) {
    setError(result.error ?? "Failed to create issue");
    return;
  }

  showToast("Issue created", "success");
  router.push(
    `/${selectedRepo.owner}/${selectedRepo.repo}/issues/${result.issueNumber}`,
  );
  onClose();
});
```

- [ ] **Step 8: Update EditIssueForm to use toast**

Modify `packages/web/components/issue/EditIssueForm.tsx`.

Add import at the top:

```tsx
import { useToast } from "@/components/ui/ToastProvider";
```

Inside the component, add at the top of the function body:

```tsx
const { showToast } = useToast();
```

In `handleSave`, add `showToast` before calling `onDone()`:

```tsx
startTransition(async () => {
  const result = await updateIssue({
    owner,
    repo,
    number: issue.number,
    title: title.trim(),
    body,
  });

  if (!result.success) {
    setError(result.error ?? "Failed to update issue");
    return;
  }

  showToast("Changes saved", "success");
  onDone();
});
```

- [ ] **Step 9: Update LabelManager to use toast**

Modify `packages/web/components/issue/LabelManager.tsx`.

Add import at the top:

```tsx
import { useToast } from "@/components/ui/ToastProvider";
```

Inside the component, add at the top of the function body:

```tsx
const { showToast } = useToast();
```

In `handleToggle`, add a success toast:

```tsx
function handleToggle(label: string) {
  setError(null);
  const action = selectedNames.includes(label) ? "remove" : "add";
  startTransition(async () => {
    const result = await toggleLabel({
      owner,
      repo,
      number: issueNumber,
      label,
      action,
    });
    if (!result.success) {
      setError(result.error ?? "Failed to update label");
    } else {
      showToast("Labels updated", "success");
    }
  });
}
```

- [ ] **Step 10: Update AddRepoForm to use toast**

Modify `packages/web/components/settings/AddRepoForm.tsx`.

Add import at the top:

```tsx
import { useToast } from "@/components/ui/ToastProvider";
```

Inside the component, add at the top of the function body:

```tsx
const { showToast } = useToast();
```

In `handleSubmit`, add a success toast in the success branch. Replace the success handling:

```tsx
startTransition(async () => {
  const result = await addRepo(
    parts[0],
    parts[1],
    localPath.trim() || undefined,
  );
  if (result.success) {
    showToast("Repository added", "success");
    if (result.warning) {
      setWarning(result.warning);
      timerRef.current = setTimeout(() => onClose(), 2000);
    } else {
      onClose();
    }
  } else {
    setError(result.error ?? "Failed to add repo");
  }
});
```

- [ ] **Step 11: Type-check**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 12: Commit**

```bash
git add packages/web/components/ui/Toast.tsx packages/web/components/ui/Toast.module.css \
  packages/web/components/ui/ToastProvider.tsx \
  packages/web/app/layout.tsx \
  packages/web/components/issue/CommentForm.tsx \
  packages/web/components/issue/CloseIssueButton.tsx \
  packages/web/components/issue/CreateIssueModal.tsx \
  packages/web/components/issue/EditIssueForm.tsx \
  packages/web/components/issue/LabelManager.tsx \
  packages/web/components/settings/AddRepoForm.tsx
git commit -m "feat: add toast notifications for mutation feedback"
```
