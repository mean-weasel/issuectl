# Performance Audit R2 -- issuectl Web Dashboard

**Date:** 2026-04-12  
**Target:** http://localhost:3847 (dev), http://localhost:3848 (prod build, cold cache)  
**Method:** Playwright CLI runtime profiling + static analysis  
**Build:** Next.js 15.5.14 production build  

---

## Scorecard: 8/12 Pass (67%)

| #  | Metric/Check                      | Result   | Notes                                                  |
|----|-----------------------------------|----------|--------------------------------------------------------|
| 1  | FCP < 1.8s all routes (prod)      | PASS     | Best 400ms, worst 1288ms (settings)                    |
| 2  | LCP < 2.5s all routes (prod)      | PASS     | All routes <= 1288ms                                   |
| 3  | CLS < 0.1 all routes              | PASS     | 0 on all routes                                        |
| 4  | TBT < 200ms all routes            | PASS     | 0ms on all routes                                      |
| 5  | TTFB < 200ms all routes (prod)    | **FAIL** | Range 328-911ms; settings 911ms, PR 774ms              |
| 6  | First Load JS < 170kB all routes  | PASS     | Worst: /pulls at 144KB                                 |
| 7  | DOM nodes < 1500 all routes       | PASS     | Max 251 (home)                                         |
| 8  | No full-reload `<a>` navigation   | **FAIL** | List.tsx:80,86 uses raw `<a href>` for tab switching   |
| 9  | loading.tsx on all async routes    | **FAIL** | Missing on /drafts/[id], /issues/..., /pulls/..., /parse |
| 10 | No root-layout blocking async     | **FAIL** | layout.tsx:47 shells out `gh auth status` every nav    |
| 11 | No N+1 data fetches               | PASS*    | Home uses Promise.all; *settings worktrees has N+1 but behind empty-state guard |
| 12 | Code-split heavy deps             | PASS*    | react-markdown tree-shaken to shared chunk; *rehype-highlight not lazy-loaded  |

---

## Per-Route Metrics (Prod Build, Cold Cache)

| Route              | TTFB   | FCP    | LCP    | CLS  | TBT  | JS (KB) | CSS (KB) | DOM  | Rating      |
|--------------------|--------|--------|--------|------|------|---------|----------|------|-------------|
| `/`                | 462ms  | 888ms  | 888ms  | 0    | 0ms  | 118     | 173      | 251  | Needs Work  |
| `/settings`        | 911ms  | 1288ms | 1288ms | 0    | 0ms  | 119     | 174      | 133  | Poor (TTFB) |
| `/issues/.../9`    | 379ms  | 432ms  | 432ms  | 0    | 0ms  | 122     | 175      | 73   | Good        |
| `/drafts/[id]`     | 354ms  | 400ms  | 400ms  | 0    | 0ms  | 114     | 173      | 53   | Good        |
| `/pulls/.../12`    | 396ms  | 420ms  | 420ms  | 0    | 0ms  | 148     | 173      | 66   | Good (TTFB) |

**JS/CSS are full First Load transfer sizes (cold cache, gzipped over localhost).**  
LCP = FCP on all routes because there are no images/hero elements; the largest paint is text.

---

## Findings

### P0 -- High Impact

**1. Root layout shells out `gh auth status` on every page load**  
`packages/web/app/layout.tsx:47` -- `getAuthStatus()` calls `checkGhAuth()` which spawns a subprocess (`gh auth status`) on every SSR request. This adds 100-200ms of TTFB to every single navigation. The Octokit singleton already caches `gh auth token`, but the layout runs a separate subprocess for username display.  
**Fix:** Cache the auth result in a module-level variable with a TTL (e.g. 60s), or pass the username from `getOctokit()` initialization instead of a separate subprocess.

**2. Settings page TTFB 911ms -- subprocess + worktree staleness checks**  
`packages/web/app/settings/page.tsx:47-53` -- `getAuthStatus()` (subprocess) + `listWorktrees()` run via `Promise.all`, but `listWorktrees` at `packages/web/lib/actions/worktrees.ts:84-120` calls `getOctokit()` (another subprocess on first call) and then does **one GitHub API call per worktree** to check staleness. With N worktrees, this is an O(N) waterfall against the GitHub API, all blocking the settings page SSR.  
**Fix:** Move staleness checks to a client-side "check now" button, or batch them into a single GraphQL query, or cache results.

**3. Tab switching uses `<a href>` instead of `<Link>` -- triggers full page reload**  
`packages/web/components/list/List.tsx:80,86` -- Issues/PRs tabs use raw `<a href="/">` and `<a href="/?tab=prs">`, causing a full browser navigation (new SSR, new JS parse, new GitHub API calls) instead of a client-side transition. The Next.js build already warns about this.  
**Fix:** Replace with `<Link href="/" ...>` and `<Link href="/?tab=prs" ...>`.

### P1 -- Medium Impact

**4. Missing loading.tsx on 4 dynamic routes**  
The following routes lack route-specific loading skeletons:
- `app/drafts/[draftId]/` -- no loading.tsx
- `app/issues/[owner]/[repo]/[number]/` -- no loading.tsx
- `app/pulls/[owner]/[repo]/[number]/` -- no loading.tsx
- `app/parse/` -- no loading.tsx

The root `app/loading.tsx` catches these, but users navigating from home via client-side Link will see the generic skeleton instead of a route-appropriate one. With GitHub API latency, the blank period can be noticeable (350-780ms TTFB in prod).

**5. Home page fires 10 RSC prefetches on load**  
The home route lists issues/drafts with `<Link>` components, triggering Next.js to prefetch RSC payloads for each linked route. With 10 items visible, this fires 10 `_rsc` requests immediately after FCP. On localhost this adds ~24ms total, but on a real network this could cause contention. The current behavior is acceptable but worth monitoring as the issue list grows.

**6. 3 Google Fonts with 12+ subsets = 28 font files (548KB on disk)**  
`layout.tsx:9-29` loads Fraunces (serif, 4 weights + italic), Inter (sans, 4 weights), and IBM Plex Mono (mono, 3 weights) from Google Fonts. Next.js self-hosts these and generates `@font-face` CSS. The 173KB CSS per route is largely font declarations. Only the `display: "swap"` subsetting prevents blocking render.  
**Fix:** Audit which weights are actually used; Fraunces italic and many weights may be unused. Reducing to 2 fonts and fewer weights would cut CSS substantially.

### P2 -- Low Impact

**7. react-markdown + rehype-highlight not lazy-loaded on PR route**  
`packages/web/components/ui/MarkdownBody.tsx` imports `rehype-highlight` statically. This pulls highlight.js core + language definitions into shared chunk `86-*.js` (113KB raw / 34KB gzipped). The chunk is only needed on routes showing syntax-highlighted markdown (PR detail), but because `PrDetail` is a Client Component importing `BodyText` (which uses `ReactMarkdown`), the chunk loads for PRs.  
**Fix:** Use `next/dynamic` to lazy-load `MarkdownBody` so the rehype-highlight chunk only loads when markdown content is actually rendered.

**8. `PrDetail` is a full Client Component**  
`packages/web/components/detail/PrDetail.tsx:1` -- the entire PR detail (148 lines) is `"use client"`. This means the PR page ships 37.9KB of route-specific JS vs ~3-12KB for other routes. If the interactive parts (e.g., action buttons) were extracted into small Client Components, the rest could remain Server Components, reducing the client bundle.

**9. 47 Client Components total**  
While most are small interactive widgets (sheets, modals, forms), the high count means the client-side React tree is substantial. No immediate action needed, but worth tracking as complexity grows.

---

## Build Output Summary

```
Route                               Size    First Load JS
/                                 7.44 kB      113 kB
/settings                        8.87 kB      115 kB
/issues/[owner]/[repo]/[number]  11.8 kB      117 kB
/drafts/[draftId]                 3.4 kB      109 kB
/pulls/[owner]/[repo]/[number]   37.9 kB      144 kB     <-- outlier
/parse                           5.92 kB      112 kB

Shared JS:                       102 kB (all routes)
Shared CSS:                       ~87 kB (all fonts + modules)
```

---

## Status of Prior Known Issues

| Issue | Status | Detail |
|-------|--------|--------|
| TTFB optimization deferred | **Still an issue** | Settings 911ms, home 462ms. Root cause: subprocess calls in layout + settings page. |
| Code splitting deferred | **Partially addressed** | Next.js auto-splits route chunks well (3-12KB per route). But rehype-highlight (34KB gz) not lazy-loaded. |
| Missing loading states | **Partially addressed** | Root and settings have loading.tsx. 4 dynamic routes still missing. |
