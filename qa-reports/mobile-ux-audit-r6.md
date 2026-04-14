# Mobile UX Audit — R6

**Viewport:** 393×852. Same 10 × 63-check rubric as R3/R4/R5. Scope: the same five "uncovered" routes from R5 — verifying the PR #73 fix bundle (live in working tree on `fix/mobile-r5-new-routes`).

R5 reachable: **150 / 189**. R6 reachable: **164 / 189** (**+14**). Static-only routes (Draft, Error boundary) and one new live blocker (Merge button) are addressed at source.

> **Arithmetic note:** R6 totals are computed from the per-category cells in §3. R5's authored `not-found` total of **48 / 63** was a pre-existing typo — its own cells sum to **54 / 63** — so this report's R5 baseline for not-found uses the cell-derived value (54), not the typo. R5's PR-detail (51) and launch-progress (45) totals match their cells and are unchanged. The R5 reachable subtotal is restated as 51 + 45 + 54 = **150** for internal consistency with R6 deltas. R5 itself is left as-published (this is a verification report, not an R5 amendment).

---

## 1. Headline delta

| Route | R5 | R6 | Δ | Reach |
|---|---|---|---|---|
| `/pulls/.../{10,12}` | 51 / 63 | **54 / 63** | **+3** | live (both PRs now merged upstream — see note) |
| `/launch/.../11?deploymentId=11` | 45 / 63 | **52 / 63** | **+7** | live |
| `/this-route-does-not-exist-xyz` | 54 / 63 † | **58 / 63** | **+4** | live |
| `/drafts/[draftId]` | unreachable | unreachable | static | drafts table empty |
| `app/error.tsx` | unreachable | unreachable | static | non-destructive impossible |
| **Reachable subtotal** | **150** | **164** | **+14** | |

† R5 published `48 / 63` for not-found; recomputed from R5 cells = 54 / 63. See arithmetic note above.

> **PR detail reach note:** R5 audited PR #10 in the **open** state. Between R5 and R6, PR #10 was merged upstream (verified `gh pr list` → both #10 and #12 `MERGED`). Live `MergeButton` UI does not render. Every R5 baseline tied to merge UI is verified statically against the working tree. Hard rule "do NOT click merge" honored.

---

## 2. Pinned-number delta tables

### 2.1 PR detail — `/pulls/mean-weasel/issuectl-test-repo/10`

| R5 baseline | R6 target | R6 measured | Pass? |
|---|---|---|---|
| `MergeButton` height: **42 px** | 44+ | `min-height: 44px` (`PrDetail.module.css:34`); live-unreachable | **PASS (static)** |
| Confirm row buttons (~37 px) | 44+ | `min-height: 44px` + `inline-flex` on `.confirmBtn` (`:79`) and `.cancelBtn` (`:99`) | **PASS (static)** |
| Back ‹: 44×44 (hold) | 44×44 | **44×44** measured live | **PASS (held)** |
| Text < 16 px | hold (editorial) | 14 / 16 — same density (more nodes due to merged-state pill) | hold |

Confirm-row click path required PR #10 open; merged-upstream environment makes it unreachable. Static fix is dead-simple to trace (no class overrides, no specificity tricks).

### 2.2 Launch progress — `/launch/.../11?deploymentId=11`

| R5 baseline | R6 target | R6 measured | Pass? |
|---|---|---|---|
| Bottom "‹ back to issue": **80×16** | 44+ OR removed | **0 matches** for "back to issue" anchors (link removed) | **PASS (removed)** |
| `.numActive` spinner (single color) | distinct contrast | `border-top: rgb(45,95,63)` (paper-accent) vs `border-(left/right/bottom): rgb(220,232,222)` (paper-accent-soft) — clearly distinct, rotation visible | **PASS** |
| Polling: **none** | none (deferred) | none — `LaunchProgress` still SC-only | **n/a (deferred)** |
| `prefers-reduced-motion` gate on `@keyframes spin`: missing | present | `(prefers-reduced-motion: reduce) { .LaunchProgress_numActive___sExj { animation: ... none; } }` confirmed in computed cascade | **PASS** |
| `aria-live` on `.steps`: missing | present | `<div class="steps" role="status" aria-live="polite">` measured live | **PASS** |

### 2.3 not-found — `/this-route-does-not-exist-xyz`

| R5 baseline | R6 target | R6 measured | Pass? |
|---|---|---|---|
| `.link` height: **32 px** | 44+ | **141.6 × 44** (`min-height: 44px`, `padding: 0 12px`, `inline-flex`) | **PASS** |
| `.container` min-height: **60vh** | 60dvh | computed `511.2px` = 60% of 852 dvh ✅ | **PASS** |
| Icon `?` `aria-hidden`: missing | present | `aria-hidden="true"` | **PASS** |

### 2.4 Error boundary (static — non-destructively unreachable)

| R5 baseline | R6 target | R6 measured | Pass? |
|---|---|---|---|
| `ErrorState .link` padding: **0** | min-height 44 + padding | `ErrorState.module.css:64-65` → `min-height: 44px; padding: 0 12px;` | **PASS (grep)** |
| `Button.module.css .btn` padding 8×14 | min-height 44 | `Button.module.css:6` → `min-height: 44px;` (cascades via `composes: btn` → `.secondary` → `<Button variant="secondary">Try again</Button>`) | **PASS (grep)** |
| `ErrorState .container`: **60vh** | 60dvh | `ErrorState.module.css:6` → `min-height: 60dvh;` | **PASS (grep)** |
| Icon `!` `aria-hidden`: missing | present | `ErrorState.tsx:19` → `aria-hidden="true"` | **PASS (grep)** |

### 2.5 Draft detail (static — drafts table still 0 rows)

| R5 baseline | R6 target | R6 measured | Pass? |
|---|---|---|---|
| `titleInput` form attrs: missing | present | `DraftDetail.tsx:82-86` → `autoComplete="off" autoCapitalize="sentences" spellCheck={true} enterKeyHint="done"` | **PASS (grep)** |
| `textarea` form attrs: missing | present | `DraftDetail.tsx:107-109` → same trio (sans `enterKeyHint`) | **PASS (grep)** |
| `savedIndicator` role: none | `role="status"`+`aria-live="polite"` | `DraftDetail.tsx:113-115` → both present; `saveError:121` → `role="alert"` | **PASS (grep)** |

---

## 3. Per-route mini-scorecards (R5 → R6)

| Cat | PR detail | Launch progress | not-found |
|---|---|---|---|
| 1 Touch | 5→6 (+1) | 4→6 (+2) | 6→7 (+1) |
| 2 iOS Safari | 5→5 | 5→5 | 4→5 (+1) |
| 3 iOS Native | 6→6 | 6→6 | 6→6 |
| 4 Responsive | 7→7 | 7→7 | 7→7 |
| 5 Typography | 4→4 | 3→3 | 7→7 |
| 6 Form UX | 8→8 (n/a) | 8→8 (n/a) | 8→8 (n/a) |
| 7 Overlays | 4→4 | 4→4 | 4→4 |
| 8 A11y | 5→6 (+1) | 3→6 (+3) | 4→6 (+2) |
| 9 Gestures | 4→4 | 2→2 | 4→4 |
| 10 Motion | 3→4 (+1) | 3→5 (+2) | 4→4 |
| **Total** | **51→54 (+3)** | **45→52 (+7)** | **54→58 (+4)** † |

Touch wins came from `.mergeBtn` 44+ (PR), 80×16 bottom link removed (Launch), `.link` 142×44 (404). A11y wins came from `MergeButton` `role="status"`/`alert`, `.steps` `aria-live`, `.numActive` reduced-motion gate, and `.icon aria-hidden`. Motion wins came from spinner contrast + announce wiring. Typography stays editorial-dense per R3 stance.

**Draft / Error boundary** — both unreachable non-destructively (R5 reasons hold). All P1 statics addressed in working tree (§2.4 / §2.5). No live mini-scorecards possible.

---

## 4. Cross-route checks

1. **`Button.module.css .btn` cascade into `ErrorState` "Try again":** verified.
   - `Button.tsx:16` → `cn(styles[variant], className)` with `variant="secondary"`
   - `Button.module.css:18-23` → `.secondary { composes: btn; ... }`
   - `Button.module.css:1-16` → `.btn { min-height: 44px; ... }`
   - `ErrorState.tsx:24` → `<Button variant="secondary">Try again</Button>`
   - The 44 px floor cascades end-to-end. Highest-leverage change in the bundle — one CSS-Modules edit unlocks every state-component touch target.

2. **`MergeButton` merged-banner / error a11y:** verified.
   - `MergeButton.tsx:36-38` → `role="status" aria-live="polite"` on merged banner
   - `MergeButton.tsx:75` → `role="alert"` on `.mergeError`

---

## 5. Regressions

**None.** Every R5 baseline improved or held. The only "degradation" is reach state: PR #10 moved open → merged upstream between R5 and R6, blocking live merge-button verification. This is environmental, not code.

---

## 6. Still-open

1. **Launch progress polling / streaming** (R5 P1 #3) — `force-dynamic` SC-only, no client refresh. Architectural; deliberately out of PR #73 scope. Page is still inert for long sessions. → R7 hook.
2. **PR detail h1 LH 1.2** — 26 px Fraunces × 1.2 = 31.2 px. WCAG 1.4.12 minimum 1.5. Editorial choice.
3. **PR detail editorial typography density** — 14 / 16 sub-16. R3-confirmed Paper aesthetic.
4. **Draft detail title-input LH 1.2** — only catches when DraftDetail becomes reachable.
5. **Force-throw fixture for `app/error.tsx`** — add sandboxed route so the boundary is live-verifiable.

---

## 7. R6 → R7 delta hooks

**PR detail (live)**
- Reach blocker: open-state PR does not exist in test repo. **R7 setup:** create fresh fixture PR (`gh pr create --draft`) so `MergeButton` renders.
- `MergeButton` height (live): 44+ target — currently static-only.
- Confirm row buttons (live): 44+ target — currently static-only.
- h1 line-height: 1.2 → consider 1.3.

**Launch progress**
- Polling interval: none → `router.refresh()` 5 s or streaming.
- Spinner contrast: paper-accent vs paper-accent-soft (hold).
- `aria-live` on `.steps` (hold). Reduced-motion gate (hold).

**not-found** — all three (link 142×44, container 60dvh, icon `aria-hidden`) hold.

**Draft detail (still static)**
- **R7 setup:** pre-seed draft row (`sqlite3 ~/.issuectl/issuectl.db "INSERT INTO drafts (id,title,priority,updated_at) VALUES ('test-uuid','Test','medium',unixepoch());"`).
- Live `flashSaved()` SR announce — verify it actually reads "saved" on blur.

**Error boundary (still static)**
- **R7 setup:** add `app/error-fixture/page.tsx` that throws.

**Globals (held from R5):** `100dvh` (PR detail container 852 px), `prefers-reduced-motion` (now also LaunchProgress), `safe-area-inset`, DetailTopBar back 44×44.

---

## 8. Screenshots

- `qa-reports/screenshots/mobile-r6-pr-detail-merged.png` — PR #10 merged
- `qa-reports/screenshots/mobile-r6-launch-progress.png` — deployment #11 with restored spinner contrast, no bottom back-link
- `qa-reports/screenshots/mobile-r6-not-found.png` — 404 with 142×44 link

Draft detail and error boundary remain unreachable non-destructively — statics verified by file read.

---

**R5 → R6 summary:** +14 reachable points across three live routes (cell-derived; see §1 arithmetic note for the R5 not-found typo correction). Every R5 P0 addressed (5 PASS live, 2 PASS static); every R5 P1 addressed at source; zero regressions; 1 deferred item (LaunchProgress polling) explicitly out of PR #73 scope.
