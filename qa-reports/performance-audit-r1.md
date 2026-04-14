# Performance Audit R1 — issuectl Web Dashboard

**Date:** 2026-04-14
**Target:** `http://localhost:3847` (Next.js dev server, already running — not restarted)
**Method:** Playwright CLI runtime profiling + static scan + 60 s poller trace
**Build mode:** **dev** (`next dev`). Dev TTFB/FCP include on-demand compile; JS transfer is unminified (~2 MB/route). Prod First Load JS from R2 (2026-04-12) was 113–144 KB and has not regressed structurally.

---

## 1. Executive Summary

Every Web Vital that matters (CLS, TBT, LCP≈FCP) is green after warm compile on all 5 in-scope routes. Two of the three PR #49 deferrals have materially improved; code splitting still hasn't. The launch poller (PR #75) is sustainable.

**Top 3 findings:**
1. **P1** `/launch/[owner]/[repo]/[number]/loading.tsx` missing — the only in-scope route still without a skeleton, and the one whose SSR does a GitHub API call. First nav shows the generic root skeleton.
2. **P2** `LaunchProgressPoller` cost is ~8 KB / 77 ms per 5 s tick, **0 long tasks, 0 memory growth** over 60 s. Correctly short-circuits when the deployment has ended. Sustainable for hours.
3. **P2** `rehype-highlight` still eagerly imported in `MarkdownBody.tsx`; R2's 26 KB PR-route bloat persists.

---

## 2. Per-Route Metrics (warm dev pass)

| Route | TTFB | FCP | LCP\* | CLS | TBT | JS xfer (dev) | DOM | Depth | Rating |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 19 | 300 | =FCP | 0 | 0 | 2088 KB | 247 | 10 | Good |
| `/settings` | 27 | 56 | =FCP | 0 | 0 | 2038 KB | 133 | 8 | Good |
| `/parse` | 24 | 292 | =FCP | 0 | 0 | 2010 KB | 60 | 6 | Good |
| `/issues/…/11` | 33 | 64 | =FCP | 0 | 0 | 2118 KB | 92 | 7 | Good |
| `/launch/…/11?id=11` (active) | 29 | 320 | =FCP | 0 | 0 | 1951 KB | 88 | 9 | Good |
| `/launch/…/1?id=9` (idle) | 29 | 356 | =FCP | 0 | 0 | 1951 KB | 88 | 9 | Good |

All times in ms. **Cold first-compile (dev, ref only):** `/` 535/568, `/settings` 1093/1152, `/parse` 1114/1424, `/issues/…/11` 1527/1584, `/launch/…/11` 978/1020 — these are compile costs, not shippable TTFB.

\* Chromium emits no `largest-contentful-paint` entry because the largest element is text laid out at FCP; LCP is treated as =FCP (same as R2). `longtask` buffer was empty on every route.

**Dev JS transfer caveat:** dominated by the 1.76 MB unminified `main-app.js`. R2 prod First Load JS was 113–144 KB; no code landed since then to change that. A fresh prod remeasure is owed once a restart is allowed.

---

## 3. Binary Scorecard — 11 / 12 PASS

| # | Check | Threshold | Result |
|---|---|---|---|
| 1 | FCP < 1.8 s warm | 1800 ms | PASS — max 356 |
| 2 | LCP < 2.5 s | 2500 ms | PASS — max 356 (=FCP) |
| 3 | CLS < 0.1 | 0.1 | PASS — 0 on every route |
| 4 | TBT < 200 ms | 200 ms | PASS — 0 on every route |
| 5 | TTFB < 200 ms warm | 200 ms | PASS — max 33 |
| 6 | DOM nodes < 1500 | 1500 | PASS — max 247 (`/`) |
| 7 | Max DOM depth < 14 | 14 | PASS — max 10 |
| 8 | `loading.tsx` on all in-scope async routes | 5/5 | **FAIL — `/launch` missing** |
| 9 | CLS on sheet / `100dvh` routes | 0 | PASS — PRs #70/#73 non-regressing |
| 10 | Poller memory growth ≤ 10 MB / 60 s | 10 MB | PASS — net −36 MB (GC) |
| 11 | Poller long tasks per tick | 0 | PASS — 0 / 12 ticks |
| 12 | Poller pauses when idle | 0 ticks | PASS — 0 RSC reqs in 30 s |

---

## 4. Deferred-Items Verdict (follow-up to PR #49)

| Deferral | Status | Evidence |
|---|---|---|
| **TTFB optimization** | **Resolved structurally** | `packages/web/lib/auth.ts` caches `getAuthStatus()` with a 60 s TTL (R2 #1 fixed). `packages/web/app/settings/page.tsx` wraps `WorktreeSection` and `AuthSection` in `<Suspense>`, streaming the slow work after shell paint (R2 #2 fixed). Warm dev TTFB ≤ 33 ms on all 5 routes vs R2 prod 328–911 ms. Prod remeasure still owed. |
| **Code splitting** | **Still the bottleneck on PR detail** | `packages/web/components/ui/MarkdownBody.tsx:1-3` still `import`s `react-markdown`, `remark-gfm`, `rehype-highlight` statically. No `next/dynamic`. R2 measured `/pulls/…` First Load JS at 144 KB vs ≤ 118 KB elsewhere; the 26 KB delta ships on every PR view even with no fenced code blocks. |
| **Missing `loading.tsx`** | **3 of 4 fixed; 1 left** | Fixed: `/drafts/[draftId]`, `/issues/[owner]/[repo]/[number]`, `/pulls/[owner]/[repo]/[number]`, `/parse`. Still missing: `packages/web/app/launch/[owner]/[repo]/[number]/loading.tsx` — and that route's SSR does an octokit fetch, so it's exactly where a skeleton matters most. |

---

## 5. Launch Poller Analysis (PR #75)

**Setup:** Loaded `/launch/…/11?deploymentId=11` (deployment 11, `ended_at = NULL` → active). Sampled the `performance.resource` buffer across 60 s and filtered `_rsc` requests. Control: `/launch/…/1?deploymentId=9` (deployment 9, `ended_at = 2026-04-13` → idle).

### Active state — 60 s window

| Metric | Value |
|---|---|
| Poll ticks | **12** (expected 12) |
| Inter-tick gap | **5000 ms**, stddev ~2 ms — no drift |
| Per-tick transfer | ~7.96 KB (7963–7969 B range) |
| Per-tick decoded (RSC payload) | ~30.73 KB |
| Per-tick request duration | ~77 ms (dev — includes server RSC re-render) |
| Long tasks main thread | **0 / 12 ticks** |
| Total transfer over 60 s | 94 KB ≈ 1.57 KB/s ≈ 5.6 MB/hour |
| Memory start → end | 198 → 162 MB (net −36 MB via GC) |
| DOM nodes | 87 → 87 (no leak) |

### Idle state — 30 s window

Zero RSC requests. `LaunchProgressPoller.tsx:21` short-circuits on `!active`. Memory stable.

### Verdict

**Sustainable.** Client cost per tick is effectively free (no long tasks, no layout shift, no heap growth, no DOM churn). Network is negligible for an internal tool. A tab left open for an hour costs ~5.6 MB and a dozen cheap paints.

**One non-blocking concern:** every tick re-runs the SSR path in `packages/web/app/launch/[owner]/[repo]/[number]/page.tsx:50-57`, which calls `getIssueDetail(...)` — another GitHub REST hop — just to compute `commentCount` and `fileCount`. On a 10 minute launch that's ~120 REST calls for data that doesn't change during the launch. See Finding P2-b.

---

## 6. Mobile UX Verification (PRs #70, #73)

No regressions. `100dvh` is used in 13 files; all measured routes including `/launch/…/11` (adjacent to the sheet stack) report `cls: 0`. `LaunchProgressPoller` renders no DOM (`return null`) and its `router.refresh()` path reconciles in place, so no layout thrash. Nothing to flag.

---

## 7. Prioritized Findings

### P0 — none

### P1

**P1-a — `/launch/[owner]/[repo]/[number]/loading.tsx` is missing.**
`packages/web/app/launch/[owner]/[repo]/[number]/` only contains `page.tsx`. Its SSR awaits `getIssueDetail` (octokit). First nav shows the generic root skeleton. All other in-scope routes now ship route-appropriate skeletons.
*Next step:* add `loading.tsx` in that directory modeled after `/pulls/[owner]/[repo]/[number]/loading.tsx`.

### P2

**P2-a — `rehype-highlight` still eagerly imported (carry-over from R2 #7).**
`packages/web/components/ui/MarkdownBody.tsx:3`. Ships on every PR view (+26 KB First Load JS in R2).
*Next step:* wrap `MarkdownBody` in `next/dynamic`, or only attach `rehype-highlight` when the body contains a fenced code block.

**P2-b — Poll loop refetches static `getIssueDetail` every 5 s.**
`packages/web/app/launch/[owner]/[repo]/[number]/page.tsx:50-57` runs inside the RSC tree the poller re-renders. Burns GitHub API quota (~120 calls per 10 min launch) for counts that don't change.
*Next step:* either pass `commentCount`/`fileCount` via a query param from the parent `/issues/…` link, or move the live deployment read into a narrow Server Action so the static counts fall out of the poll loop.

**P2-c — Client-component count drifted 47 → 49.** Tracking-only. Two more `"use client"` files since R2 (`LaunchProgressPoller.tsx` and one other). Still small per-route chunks in prod per R2.
*Next step:* revisit at next audit.

---

## 8. Data & Artifacts

Under `qa-reports/perf-audit-r1-data/`:
- `collect.mjs` cold pass · `collect-warm.mjs` warm pass (used for §2) · `collect-poller.mjs` 30 s active+idle · `collect-poller-detailed.mjs` 60 s active (used for §5)
- `runtime-metrics.json`, `runtime-metrics-warm.json`, `poller-cost.json`, `poller-detailed.json`

Screenshots: `qa-reports/screenshots/perf-r1-{dashboard,settings,parse,issue-detail,launch-active,launch-idle}.png`.

### Delta vs R2 (2026-04-12)

| Item | R2 | R1 | Direction |
|---|---|---|---|
| Auth subprocess each nav | 100–200 ms | cached 60 s TTL | fixed |
| Settings TTFB (prod) | 911 ms | streamed via Suspense; warm dev 27 ms | fixed structurally |
| Missing `loading.tsx` | 4 routes | 1 route (`/launch`) | improved |
| `rehype-highlight` lazy | no | no | unchanged |
| Client components | 47 | 49 | +2 |
| `<a href>` tab bug (R2 #3) | `List.tsx:80,86` | not re-verified this pass | — |
