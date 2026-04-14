# Mobile UX Audit — R7

**Viewport:** 393×852. Scope: same five "uncovered" routes as R5/R6. Primary: verify PR #75 `LaunchProgressPoller` polls and pauses on hidden. Secondary: re-verify R6 baselines.

---

## 1. Headline

**Poller verified empirically — 5.00 s RSC cadence, 0 requests while hidden, clean resume on visible. All R6 baselines hold. One new dev-mode observation (loading.css preload warning, non-blocking).**

---

## 2. Poller verification (primary mission)

Method 1 (network via `performance.getEntriesByType('resource')`) produced decisive evidence. All three sub-checks passed.

### 2.1 Active polling — 5 s cadence

Navigated to `/launch/mean-weasel/issuectl-test-repo/11?deploymentId=11`. State: `endedAt === null`, h1 = "launching…", `.numActive` present, so `<LaunchProgressPoller active={true} />` is mounted. Observed RSC requests (`?_rsc=…`, which Next emits for `router.refresh()`):

| # | t (ms) | Δ | | # | t (ms) | Δ |
|---|---|---|---|---|---|---|
| 1 | 5401 | — | | 6 | 30400 | 5000 |
| 2 | 10400 | 4999 | | 7 | 35400 | 5000 |
| 3 | 15400 | 5000 | | 8 | 40400 | 5000 |
| 4 | 20399 | 4999 | | 9 | 45401 | 5001 |
| 5 | 25400 | 5001 | | | | |

**9 requests / 40 s / mean Δ 5000 ms / variance ±1 ms.** Matches `POLL_INTERVAL_MS = 5000` (`LaunchProgressPoller.tsx:6`) exactly. Sample URL: `…/launch/mean-weasel/issuectl-test-repo/11?deploymentId=11&_rsc=yu0xk` → 200. Parallel MutationObserver on `document.body`: 14 mutations over ~35 s (low but non-zero — most HTML is stable between polls; mutations come from React reconciling the streamed RSC).

### 2.2 Hidden-tab pause

Simulated `document.hidden = true` via `Object.defineProperty` + `dispatchEvent(new Event('visibilitychange'))` at t = 56224 ms. Hidden window ran until the visible flip at t = 83441 ms — **27.2 s of zero RSC**.

```
afterHiddenMark: 0    hidden: true    visibilityState: hidden
```

**Zero RSC in 27 s hidden.** The handler at `LaunchProgressPoller.tsx:39-42` correctly `clearInterval`s the timer. No tooling caveat — Playwright chromium accepts the defineProperty + dispatch technique cleanly.

### 2.3 Resume on visible

Flipped `document.hidden = false` + dispatched `visibilitychange` at t = 83441 ms. New RSC: t = 88447, 93448, 98445 — deltas 5001 / 4997 ms across a **15.0 s observation window**. First request at t + 5006 ms (the `setInterval` fires once after 5 s, not immediately — expected given `LaunchProgressPoller.tsx:25-30`).

### 2.4 Summary

| Phase | Duration | RSC | Expected | Pass |
|---|---|---|---|---|
| Visible | 40 s | 9 | ~8 | **PASS** |
| Hidden | 27 s | 0 | 0 | **PASS** |
| Resumed | 15 s | 3 | ~3 | **PASS** |

**Verdict: poller verified live. PR #75 delivers exactly what the commit claims.**

---

## 3. R6 → R7 delta tables

### 3.1 Launch progress

| Cell | R6 | R7 | Δ |
|---|---|---|---|
| Back ‹ | 44×44 | 44×44 | hold |
| Bottom "back to issue" | removed | removed | hold |
| `.numActive` borders | rgb(45,95,63) vs rgb(220,232,222) | identical | hold |
| `prefers-reduced-motion` on `.numActive` | present | present (confirmed via CSSMediaRule walk → `animation: none`) | hold |
| `.steps` `role="status"` + `aria-live="polite"` | present | present | hold |
| Outer `minHeight: 100dvh` | 852 px | 852 px | hold |
| **Poll cadence** | **none (deferred)** | **5000 ms ±1 ms** | **+ verified** |
| **Hidden-tab pause** | n/a | 0 req in 27 s | **+ verified** |

### 3.2 not-found

| Cell | R6 | R7 | Δ |
|---|---|---|---|
| `.link` rect | 141.6×44 | 142×44 (1 px rounding) | hold |
| `.container` min-h | 511.2 px = 60 dvh | 511.2 px | hold |
| Icon `?` `aria-hidden` | true | true | hold |

### 3.3 PR detail — /pulls/.../10

| Cell | R6 | R7 | Δ |
|---|---|---|---|
| Back ‹ | 44×44 | 44×44 | hold |
| h1 font/LH | 26 / 31.2 (LH 1.2) | 26 / 31.2 | hold (editorial, §4) |
| `MergeButton` live | unreachable (merged) | still unreachable | hold |
| `PrDetail.module.css:34,79,99` | 44 px | 44 px | hold (static) |
| `MergeButton.tsx:37-38,75` aria | status/polite/alert | identical | hold (static) |

No regressions. Live merge UI still blocked by upstream merged state — environmental, same as R6.

### 3.4 Draft detail (static)

Drafts table still empty. Grep of `DraftDetail.tsx`: `:82-85` titleInput form attrs hold; `:107-109` textarea trio hold; `:114` savedIndicator `role="status"` hold; `:121` saveError `role="alert"` hold. `Button.module.css:6` 44 px floor still cascading.

### 3.5 Error boundary (static)

Non-destructively unreachable. `ErrorState.module.css` 60dvh + `.link` min-h 44 hold; `Button.module.css` cascade to `<Button variant="secondary">Try again</Button>` hold. No regression.

---

## 4. New findings

### 4.1 `loading.css` preload warning on every poll (NEW — dev-mode only, low severity)

Every `router.refresh()` on the launch route emits a fresh versioned preload:

```
<link rel="preload" href="/_next/static/css/app/loading.css?v={epoch}" as="style">
```

Browser then warns: *"The resource … was preloaded using link preload but not used within a few seconds from the window's load event."* Accumulation: ~1 warning per 5 s poll = ~12/min. The `v=` query is fresh each cycle, so the browser never de-dupes.

**Analysis:** known Next App Router dev-mode behavior around `loading.tsx` skeleton CSS. **Not present in production** (stable version query, preload consumed once). No UX/a11y/rendering impact. Category: `[H] Minor`. R6 couldn't observe this because it wasn't polling. No fix recommended.

### 4.2 Poller binds `active` to live state (design note)

`page.tsx:107` passes `active={deployment.endedAt === null}`. Once the deployment completes the `useEffect` bail-out fires and the interval never starts — correct, but the poller also won't retry a completed-then-stale deployment. Design awareness, not a finding.

---

## 5. Still-open (R6 items unchanged by PR #75)

1. **PR detail h1 LH 1.2** — 31.2 px, below WCAG 1.4.12 1.5. Editorial Paper choice.
2. **PR detail sub-16 editorial density** — 14/16 px metadata. R3-confirmed stance.
3. **Draft detail title-input LH 1.2** — same constraint, only live once Draft is reachable.
4. **Force-throw fixture for `app/error.tsx`.**
5. **PR detail live `MergeButton` rect** — needs fresh open-state fixture PR.

PR #75 **closes** R6 still-open #1 ("Launch polling / streaming"). Four remain.

---

## 6. R7 → R8 delta hooks

**Launch progress**
- Poll interval: **5000 ms ±1 ms** (watch for drift if `setInterval` is replaced)
- Hidden window: **0 requests in ≥27 s**
- Resume latency: **≤5100 ms from visibilitychange to first RSC**
- Dev `loading.css` preload warning: **≤1 per poll** (watch for escalation)
- `.numActive` borders: `rgb(45,95,63)` top, `rgb(220,232,222)` sides (hold)

**PR detail** — create fresh open fixture PR before R8 so MergeButton live rect is measurable. Targets: 44×44 confirm row, 44 merge button. h1 LH 1.2 → consider 1.3.

**not-found** — 142×44 link, 511.2 px container (60 dvh at 852 h), icon `aria-hidden` — hold.

**Draft / Error** — seed draft row + error-fixture route before R8.

**Globals** — 100dvh holds, no 100vh in source, reduced-motion gate holds on `.numActive`, Button.module.css 44 px floor holds.

---

## 7. Screenshots

- `qa-reports/screenshots/mobile-r7-launch-progress.png` — launch page mid-poll, active spinner
- `qa-reports/screenshots/mobile-r7-not-found.png` — 404 with 142×44 link
- `qa-reports/screenshots/mobile-r7-pr-detail-merged.png` — PR #10 merged (same env as R6)

---

**Summary:** R6 deferred item "Launch polling" empirically verified — 5.00 s cadence, clean hidden pause, clean resume. Zero R6 regressions. One dev-mode-only loading.css warning surfaced (~12/min, prod-unaffected). Four static-blocker items carry to R8.
