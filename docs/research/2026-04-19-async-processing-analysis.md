# Async Processing Analysis — Issue #134

**Date:** 2026-04-19
**Status:** Research complete — no implementation yet

## Executive Summary

The app has **7 user-facing flows** where synchronous processing blocks the UI unnecessarily. The worst offenders are **add-repo** (3-8+ GitHub API calls before the screen unlocks), **dashboard load** (N×2 API calls with no streaming), and **natural language parse** (Claude CLI + label fetches). Most can be improved with patterns already available in the stack (React `useOptimistic`, Next.js Suspense streaming, fire-and-forget server-side work).

---

## Blocking Points Found

### 1. Add Repository — HIGH IMPACT

**File:** `packages/web/lib/actions/repos.ts:38-129`
**What blocks:** After the repo is validated and saved to SQLite (fast), the action warm-caches issues, PRs, and labels via 3 parallel GitHub API calls (lines 78-107). Each can paginate. The user stares at a spinner until all three finish.

**Why it blocks:** The warm-cache results aren't needed for the success response — they exist so the dashboard is pre-populated when the user navigates there. The action waits for them anyway.

**Estimated delay:** 1-4 seconds depending on repo size and pagination depth.

**Recommendation:** Return success immediately after the DB write. Fire the warm-cache work in the background (no `await`). The dashboard's existing cache-miss path (`getIssues`/`getPulls` with SWR semantics) will handle the case where the cache isn't warm yet.

---

### 2. Dashboard Page Load — HIGH IMPACT

**File:** `packages/web/app/page.tsx:74-79`
**What blocks:** The page awaits `getUnifiedList()` + `gatherPulls()` before rendering anything. With N repos, this fans out N×2 GitHub API calls (issues + PRs per repo), bounded by the `mapLimit` concurrency of 6. No Suspense boundary wraps the data sections.

**Why it blocks:** Server Components must resolve all `await`s before streaming HTML. Without Suspense, the entire page waits for the slowest repo.

**Estimated delay:** 2-6 seconds with 3-5 repos, worse with more or if cache is cold.

**Recommendation:** Wrap the data-dependent `<List>` in a `<Suspense>` boundary with a skeleton fallback. This lets the shell (nav, filters) stream immediately while data loads. Consider splitting issues and PRs into separate Suspense boundaries so whichever resolves first renders first.

---

### 3. Natural Language Parse — MEDIUM-HIGH IMPACT

**File:** `packages/web/lib/actions/parse.ts:35-93`
**What blocks:** `parseNaturalLanguage()` fetches labels for every tracked repo in parallel, then invokes the Claude CLI to parse free-form text. The Claude CLI call (`parseIssues()`) is the bottleneck — it's an LLM inference call.

**Why it blocks:** Labels must be fetched before calling Claude (they're part of the context prompt). The Claude call itself is inherently slow.

**Estimated delay:** 3-10+ seconds depending on Claude CLI response time.

**Recommendation:** This is already wrapped in `useTransition` with a multi-stage progress UI (good). Further improvements: (a) cache labels in SQLite so the label fetch is instant on repeat calls, (b) consider streaming the Claude response to show partial results. Low priority since the UX already communicates "working."

---

### 4. Worktree Staleness Check — MEDIUM IMPACT

**File:** `packages/web/lib/actions/worktrees.ts:40-128`
**What blocks:** `listWorktrees()` makes one GitHub API call per worktree to check if the associated issue is closed. With 10 worktrees, that's 10 API calls, all awaited before the settings page renders.

**Why it blocks:** Staleness data is computed eagerly on every load. There's no caching — each visit re-checks every worktree.

**Estimated delay:** 1-5 seconds depending on worktree count.

**Recommendation:** This is already inside a Suspense boundary on the settings page (good). To reduce API calls: cache staleness in SQLite with a reasonable TTL (e.g., 5 minutes). An issue doesn't go from open→closed in the time between page visits.

---

### 5. Batch Issue Creation — MEDIUM IMPACT

**File:** `packages/web/lib/actions/parse.ts:95-224`
**What blocks:** `batchCreateIssues()` creates all accepted issues via `Promise.all` — good parallelism — but the caller blocks until every issue is created.

**Why it blocks:** All-or-nothing response. The user can't see which issues succeeded until the entire batch completes.

**Estimated delay:** 1-3 seconds per issue, multiplied by batch size (partially parallelized).

**Recommendation:** Consider a streaming approach: return results as each issue is created so the UI can show checkmarks progressively. Alternatively, accept the batch optimistically and process in the background, with a toast/notification when complete.

---

### 6. Refresh Accessible Repos — LOW-MEDIUM IMPACT

**File:** `packages/web/lib/actions/repos.ts` (calls `refreshAccessibleRepos`)
**What blocks:** When the user clicks "refresh" in the repo picker, it fetches all accessible repos from GitHub API. For users with many org memberships, this can be slow (paginated).

**Estimated delay:** 1-3 seconds.

**Recommendation:** Already used infrequently (manual refresh). Could show stale data immediately and refresh in background, but low priority.

---

### 7. Issue Detail — Comments & Linked PRs — LOW IMPACT (already mitigated)

**File:** `packages/web/app/issues/[owner]/[repo]/[number]/page.tsx`
**What blocks:** `getIssueHeader()` is awaited before Suspense kicks in for `IssueDetailContent`. The header call fetches the issue + deployments. Comments and linked PRs load inside Suspense (good).

**Estimated delay:** 0.5-1 second for the header.

**Recommendation:** Already well-structured with Suspense. Minor improvement: parallelize `getDb()` and `getOctokit()` calls at the top of the page (currently sequential). Low priority.

---

## Patterns NOT Blocking (Already Good)

| Pattern | Why it's fine |
|---------|--------------|
| Draft CRUD | SQLite-only, sub-millisecond |
| Priority set | SQLite-only |
| Settings update | SQLite-only |
| Launch progress | Client-side polling via `router.refresh()` every 5s |
| Issue detail comments | Inside Suspense boundary |
| Settings worktrees/auth | Inside Suspense boundaries |
| `gatherPulls` on dashboard | Uses `Promise.all` per repo (good parallelism) |
| Lifecycle reconciliation | Fire-and-forget `.catch()` — doesn't block response |

---

## Priority Matrix

| # | Area | Impact | Effort | Recommendation |
|---|------|--------|--------|----------------|
| 1 | Add Repo | High | Low | Don't await cache warming — fire and forget |
| 2 | Dashboard streaming | High | Medium | Wrap `<List>` in Suspense boundary |
| 3 | NL Parse labels | Medium | Low | Cache labels in SQLite |
| 4 | Worktree staleness | Medium | Low | Cache staleness in SQLite with TTL |
| 5 | Batch create | Medium | Medium | Stream results progressively |
| 6 | Refresh repos | Low | Low | Show stale + background refresh |
| 7 | Issue detail header | Low | Low | Parallelize getDb/getOctokit |

---

## Implementation Approach Options

### Option A: Tactical Fixes (Recommended First)

Address items 1, 3, 4, and 7 — all are small, isolated changes that don't require architectural shifts. Each is a standalone PR. Combined, they eliminate the most noticeable blocking without introducing new patterns.

### Option B: Suspense Streaming

Address item 2 (dashboard). This is a bigger change — the `<List>` component and its props would need restructuring to support streaming. The payoff is large (dashboard is the most-visited page) but the effort is higher.

### Option C: Background Job Queue

Address items 1 and 5 with a lightweight server-side queue. Mutations return immediately, background workers process the slow work, and the UI polls or subscribes for completion. This is the most robust solution but adds architectural complexity (queue storage, worker lifecycle, failure handling).

**Recommendation:** Start with **Option A** to get quick wins. Then tackle **Option B** for the dashboard. **Option C** is overkill unless we also need it for offline mode (#138) — in which case, design them together.
