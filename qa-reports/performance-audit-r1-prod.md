# Performance Audit R1-prod — issuectl Web Dashboard

**Date:** 2026-04-14
**Target:** `http://localhost:3847` — `next start` on committed `next build` (HEAD `d421279`, PR #79 merged)
**Method:** Playwright CLI (Chromium), fresh-session cold-per-route x3 + 60 s poller window + on-disk chunk inspection

---

## 1. Executive Summary

**Verdict: PR #79 landed its perf claims — yes, one new minor finding.** Prod meets every threshold on every in-scope route after warm-up. R2-prod deferrals closed. Poller SQLite-only path cut per-tick transfer 57% (7.96 → 3.42 KB) and duration 52% (77 → 37 ms). `/pulls` bundle −35 KB on the wire (148 → 113 KB), confirming dead-MarkdownBody cleanup shipped. `/launch` 715 B route chunk real on disk. One new P2: first nav after `next start` boot pays a ~380 ms `gh auth status` subprocess; all subsequent navs 3 ms because the 60 s TTL cache works. No P0, no P1.

---

## 2. Per-Route Metrics (median of 3, fresh session per route)

| Route | TTFB | FCP | LCP\* | CLS | TBT | JS xfer | Total xfer | DOM | Rating |
|---|---|---|---|---|---|---|---|---|---|
| `/` | **3** (357 cold once) | 408 | =FCP | 0 | 0 | 119 KB | 299 KB | 242 | Good |
| `/settings` | **3** | 32 | =FCP | 0 | 0 | 119 KB | 289 KB | 124 | Good |
| `/parse` | **4** | 484 | =FCP | 0 | 0 | 117 KB | 284 KB | 52 | Good |
| `/issues/…/11` | **3** | 48 | =FCP | 0 | 0 | 124 KB | 290 KB | 74 | Good |
| `/launch/…/11?id=11` | **3** | 40 | =FCP | 0 | 0 | 111 KB | 278 KB | 74 | Good |
| `/launch/…/11?id=11&c=3&f=2` | **3** | 40 | =FCP | 0 | 0 | 111 KB | 278 KB | 74 | Good |

All times in ms. `JS xfer` = brotli wire bytes; total includes 163–167 KB CSS. Max DOM depth 10. LCP null on every route (same as R1-dev/R2: no hero image, Chromium treats LCP =FCP). The 357 ms on `/` first-run is the single cold-boot `gh auth status` hit — 18 navs, only 1 paid it (see N1). The `c=3&f=2` variant is byte-for-byte identical to the plain load — 3 text nodes differ, route is network-inert to the new params.

---

## 3. Binary Scorecard — 13 / 13 PASS (prod thresholds)

| # | Check | Threshold | Result |
|---|---|---|---|
| 1 | FCP < 1.8 s | 1800 ms | PASS — max **484** (`/parse`) |
| 2 | LCP < 2.5 s | 2500 ms | PASS — =FCP |
| 3 | CLS < 0.1 | 0.1 | PASS — **0** every route |
| 4 | TBT < 200 ms | 200 ms | PASS — **0** every route |
| 5 | TTFB < 800 ms | 800 ms | PASS — max **4** warm / 384 cold-auth |
| 6 | First Load JS < 170 KB | 170 KB | PASS — max **124 KB** |
| 7 | DOM nodes < 1500 | 1500 | PASS — max 242 |
| 8 | Max DOM depth < 14 | 14 | PASS — max 10 |
| 9 | `loading.tsx` on async routes | 5/5 | PASS — `/launch` skeleton now shipped (612 B) |
| 10 | Long tasks per route load | 0 | PASS — 0 everywhere |
| 11 | Poller memory ≤ 10 MB / 60 s | 10 MB | PASS — +1 MB |
| 12 | Poller long tasks / tick | 0 | PASS — 0 / 12 |
| 13 | Poller pauses when idle | 0 | PASS — 0 RSC reqs in 30 s |

---

## 4. Delta vs R1-dev and R2-prod

| Metric | R2-prod | R1-dev | **R1-prod** | Verdict |
|---|---|---|---|---|
| `/` TTFB | 462 | 19 (compile) | **3** | fixed |
| `/settings` TTFB | **911** | 27 | **3** | **fixed** |
| `/settings` FCP | 1288 | 56 | **32** | fixed |
| `/issues/…` TTFB | 379 | 33 | **3** | fixed |
| `/pulls/…` TTFB | 396 | n/a | **4** | fixed |
| `/pulls/…` First Load JS | **148 KB** | ~2 MB unminified | **113 KB** | **−35 KB** |
| `/launch` route chunk | n/a | n/a | **715 B gzip** | matches PR #79 |
| Poller per-tick xfer | n/a | 7,966 B | **3,416 B** | **−57%** |
| Poller per-tick duration | n/a | 77 ms | **37 ms** | **−52%** |
| Poller 60 s total | n/a | 94 KB | **40 KB** | **−57%** |

CLS / TBT zero everywhere, all passes.

---

## 5. Launch Poller — Prod 60 s Active-State Window

**Setup:** Fresh session, cold-loaded `/launch/…/11?deploymentId=11&c=3&f=2` (deployment 11 has `ended_at = NULL`). Diffed `performance.getEntriesByType('resource')` across 60 s.

| Metric | R1-dev | **R1-prod** | Delta |
|---|---|---|---|
| Ticks in 60 s | 12 | **12** | — |
| Inter-tick gap | 5000 ± 2 ms | **5000 ± 2 ms** | flat |
| Per-tick transfer (wire) | 7,966 B | **3,416 B** | **−57%** |
| Per-tick decoded (RSC payload) | 30,730 B | **11,796 B** | **−62%** |
| Per-tick nav duration | 77 ms | **37 ms** | **−52%** |
| Long tasks main thread | 0 / 12 | **0 / 12** | — |
| Total over 60 s | 94 KB | **40 KB** | **−57%** |
| Heap delta | −36 MB (GC) | **+1 MB** | flat |
| DOM nodes start → end | 87 → 87 | **74 → 74** | −15% baseline |

**Idle state** (deployment 9 ended, 30 s window): **0 RSC requests**, heap flat. Short-circuit still fires.

**Conclusion.** The SQLite-only path from PR #79 (`c3ff0d4`) delivers as claimed. The 18.9 KB per-tick RSC that disappeared is the `getIssueDetail()` blob (issue body + comment tree + referenced files) that no longer re-serializes each tick. Remaining 37 ms is pure RSC render + one local SQLite `SELECT`. Zero GitHub REST calls per tick (previously ~120 over a 10 min launch). Hour-long open tab costs ~2.4 MB (vs R1-dev projected ~5.6 MB). **Sustainable indefinitely.** R1-dev's sustainability conclusion strengthens under prod.

---

## 6. Bundle Verification — Committed vs Measured

`next build` Route table (HEAD): `/` 8.42 kB / **114 kB**, `/issues/…` 13.2 kB / **119 kB**, **`/launch/…` 715 B / 106 kB**, `/parse` 6.42 kB / **112 kB**, `/pulls/…` 2.88 kB / **109 kB**, `/settings` 9.22 kB / **115 kB**. Shared 102 kB.

| Route | Build First Load JS | On-disk route chunk | **Measured wire JS** |
|---|---|---|---|
| `/` | 114 KB | 26,918 B | **119 KB** |
| `/settings` | 115 KB | — | **119 KB** |
| `/parse` | 112 KB | — | **117 KB** |
| `/issues/…` | 119 KB | — | **124 KB** |
| **`/launch/…`** | **106 KB** | **1,450 B** page + **612 B** loading | **111 KB** |
| `/pulls/…` | 109 KB | 8,162 B page | **113 KB** (R2 was 148 KB) |

Measured wire-JS runs ~5 KB over build First Load JS because it includes `framework` / `main` / `main-app` / `polyfills` / `webpack` + per-route page chunk.

**Key verifications:**
- **`/pulls` 148 → 113 KB** confirmed on wire. Commit `fc30295` removed `react-markdown`, `remark-gfm`, `rehype-highlight` — none imported in `packages/web/` now. Closes R1-dev P2-a.
- **`/launch` 715 B route chunk** confirmed: `page-9c2fda85e6fe7437.js` is 1450 B raw → 715 B gzipped. Contains only searchParams parse + `DetailTopBar` + `LaunchProgress` + `LaunchProgressPoller`. No octokit, no `getIssueDetail`.
- **`/launch/…/loading-bf51c07b38c38db8.js` (612 B)** present on disk (commit `af2335a`). Closes R1-dev P1-a.

---

## 7. Findings

### P0 — none
### P1 — none

### P2

**N1 — Cold-boot auth subprocess: ~380 ms once per `next start` boot.** `packages/web/lib/auth.ts:10-37`. Only the first nav after a fresh server boot paid it (357–384 ms); every other nav 3–5 ms. Not a regression — R2's 328–911 ms hit *every* nav because no cache existed. Bounded: user pays once per `issuectl web` restart. `app/loading.tsx` covers any skeleton gap. *Fix (non-blocking):* warm `getAuthStatus()` from `packages/cli/src/commands/web.ts` before `next start`, or overlap with `getOctokit()` init in `layout.tsx`.

**N2 — `/parse` FCP 484 ms (median) is the slow outlier.** `packages/web/app/parse/page.tsx`. 484 ms vs 32–48 ms on other routes — client-boundary parse UI. Still well under 1800 ms. Monitor only.

**N3 — Client-component count unchanged from R1-dev (49).** Tracking only.

---

## 8. Data & Artifacts

`qa-reports/perf-audit-r1-prod-data/`: `collect-cold.mjs`, `collect-cold-x3.mjs`, `collect-poller-detailed.mjs`, `collect-poller-idle.mjs`, `collect-pulls.mjs`, `collect-screens.mjs`. Raw JSON: `runtime-metrics-{cold,x3}.json`, `poller-{detailed,idle}.json`, `pulls-transfer.json`. Screenshots (gitignored): `qa-reports/screenshots/perf-r1-prod-{dashboard,settings,parse,issue-detail,launch-active,launch-active-cf}.png`.

Housekeeping: prod server stopped (`pkill -f "next start"`), port 3847 free. No code/config modified, no git actions taken.
