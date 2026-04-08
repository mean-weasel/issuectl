# Phase 15: Polish — SWR UX, Loading States, Error Handling

## Overview

Complete the dashboard user experience with error boundaries, loading skeletons for the remaining page, stale-while-revalidate on the dashboard, and toast notifications for mutation feedback.

## 1. Error Boundaries + 404s

### Root error boundary (`app/error.tsx`)

- Client component (required by Next.js)
- Receives `error` and `reset` from Next.js
- Renders an error card centered on the page: icon, error message, "Try again" button that calls `reset()`
- If the error message contains "rate limit" or "401"/"auth", shows a contextual hint line below the message (e.g., "This may be a rate limit — wait a moment and try again" or "Your GitHub token may have expired — re-run `gh auth login`")
- Styled with CSS Module, uses existing design tokens

### Root 404 (`app/not-found.tsx`)

- "Page not found" message with a link back to the dashboard
- Simple centered card, same visual style as the error boundary

### Repo-level error boundary (`app/[owner]/[repo]/error.tsx`)

- Same pattern as root error boundary
- Adds a breadcrumb link back to the dashboard

### Repo-level 404 (`app/[owner]/[repo]/not-found.tsx`)

- "Repository not found" message
- Suggests checking the Settings page to verify the repo is tracked
- Link back to dashboard

## 2. Settings Loading Skeleton

### `app/settings/loading.tsx` + `loading.module.css`

- Skeleton for the settings page: form field placeholders, repo list row placeholders
- Uses the same `pulse` animation keyframes as existing loading skeletons
- This is the only missing loading skeleton — dashboard, repo detail, issue detail, and PR detail already have them

## 3. SWR Revalidation (Dashboard Only)

Scope: automatic background revalidation on the dashboard page only. Sub-pages (repo detail, issue detail, PR detail) keep their current behavior — fresh fetch on navigation, manual refresh via existing CacheBar button.

### `components/dashboard/Revalidator.tsx`

- Client component (`"use client"`)
- Props: `isStale: boolean`
- On mount: if `isStale` is true, calls `refreshDashboard()` Server Action (which already exists in `lib/actions/refresh.ts` — it force-refreshes data and calls `revalidatePath("/")`)
- No visible UI — this is a side-effect-only component
- Uses `useTransition` to track pending state, passes `isPending` up via a callback prop or context so CacheBar can show "updating..."

### Approach: shared pending state

`Revalidator` and `CacheBar` need to share the "is revalidating" state. Two options considered:

- **Callback prop**: `Revalidator` accepts an `onRevalidating(isPending)` callback, parent manages state → requires parent to be a client component, which conflicts with the Server Component dashboard page.
- **Wrapper client component**: A small `DashboardClient` wrapper that owns the state and renders both `CacheBar` and `Revalidator` → keeps the page as a Server Component, isolates client state.

**Decision: wrapper client component.** A `DashboardCacheStatus` (or similar) client component wraps `CacheBar` display and `Revalidator` logic. The Server Component page passes `cachedAt`, `isStale`, `totalIssues`, `totalPRs` as props.

### CacheBar update

- Accepts an `isRevalidating` prop (or gets it from the wrapper)
- When revalidating: shows "cached Xm ago — updating..." instead of "refresh now"
- The manual "refresh now" button is hidden/disabled during auto-revalidation

### Dashboard page update (`app/page.tsx`)

- After fetching data, compute `isStale` by comparing `cachedAt` against `getCacheTtl(db)`
- Pass `isStale`, `cachedAt`, `totalIssues`, `totalPRs` to the new `DashboardCacheStatus` wrapper
- Import `getCacheTtl` from `@issuectl/core`

## 4. Toast Notifications

### `components/ui/Toast.tsx` + `Toast.module.css`

- `ToastProvider`: React context provider, manages toast state
- `useToast()` hook: returns `{ showToast(message: string, type: 'success' | 'error'): void }`
- `Toast` component: renders the current toast if any
  - Positioned bottom-right, fixed
  - CSS slide-in from right, slide-out on dismiss
  - Auto-dismiss after 4 seconds
  - Small dismiss "x" button
  - Success type: green accent border/icon
  - Error type: red accent border/icon
  - One toast at a time (new toast replaces previous)

### Layout update (`app/layout.tsx`)

- Wrap the authenticated app content in `<ToastProvider>`
- `ToastProvider` needs `"use client"` — extract the app shell (sidebar + main + toast) into a client component wrapper, or make `ToastProvider` wrap only `{children}`

### Mutation component updates

Update these client components to call `showToast()` after their Server Action completes:

| Component | Success message | Error message |
|---|---|---|
| `CommentForm` | "Comment posted" | "Failed to post comment" |
| `CloseIssueButton` | "Issue closed" / "Issue reopened" | "Failed to update issue" |
| `CreateIssueModal` | "Issue created" | "Failed to create issue" |
| `EditIssueForm` | "Changes saved" | "Failed to save changes" |
| `LabelManager` | "Labels updated" | "Failed to update labels" |
| `AddRepoForm` | "Repository added" | "Failed to add repository" |

Server Actions already return success/error indicators or throw. Each component checks the result and calls `showToast` accordingly.

## 5. Improved Page Error Handling

Light-touch improvements to existing catch blocks in page Server Components:

- Better error messages when the error looks like an auth failure or rate limit
- No new abstractions — just improved string messages in the existing inline error divs
- Pages affected: `app/page.tsx`, `app/[owner]/[repo]/page.tsx`, PR detail page, issue detail page

## Sub-commit Plan

1. **Error boundaries + 404s** — 4 new files (error.tsx x2, not-found.tsx x2) + CSS modules
2. **Settings loading skeleton** — 1 new loading.tsx + CSS module
3. **SWR revalidation (dashboard)** — Revalidator + DashboardCacheStatus wrapper, update CacheBar + page.tsx
4. **Toast notifications** — Toast + ToastProvider, update layout.tsx, update 6 mutation components

## Non-goals

- SWR on sub-pages (repo detail, issue detail, PR detail) — not in scope
- Classified error UI per error type — single generic error boundary with contextual hints
- Global error boundary (`global-error.tsx`) — root `error.tsx` is sufficient; global-error is for errors in the root layout itself, which is unlikely given the simple layout structure
