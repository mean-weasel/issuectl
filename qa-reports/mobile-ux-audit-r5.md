# Mobile UX Audit — R5

**Viewport:** 393×852. Same 10 × 63-check rubric as R3/R4. Scope: routes R3/R4 did NOT cover. Paper-aesthetic grading — small serif meta is editorial.

Global wins verified since R3: `100dvh`, `prefers-reduced-motion`, `safe-area-inset` now in cascade. Settings back-link 85×44 (was 85×31). DetailTopBar back button 44×44 (was 27×42).

---

## Route summary

| Route | Pass / 63 | P0 | P1 | Vibes (10 words) |
|---|---|---|---|---|
| `/pulls/[owner]/[repo]/[number]` | **51 / 63** | **1** | 5 | solid read-only; merge button 2 px short, dense meta |
| `/drafts/[draftId]` | unreachable | — | 4 | no drafts in DB; static audit flags form-UX gaps |
| `/launch/.../[n]?deploymentId=N` | **45 / 63** | **2** | 4 | tiny back link, invisible spinner, no polling |
| not-found | **48 / 63** | **1** | 2 | clean layout but only CTA is 142×32 |
| error boundary | unreachable | — | 3 | same CTA pattern as 404, shared Button primitive |

Reachable total: **144 / 189**. Do not compare to R3/R4 — different surfaces.

---

## 1. PR detail — `/pulls/mean-weasel/issuectl-test-repo/{10,12}`

**Reached via:** dashboard → `?tab=prs` → row click. Audited merged (#12) and open (#10). Screenshots `mobile-r5-pr-detail-open.png`, `mobile-r5-pr-detail.png`.

| Cat | Pass/Total | Note |
|---|---|---|
| 1 Touch | 5 / 7 | back ‹ 44×44 ✅, merge btn 345×**42** ❌ |
| 2 iOS Safari | 5 / 5 | `100dvh`, safe-area, no overflow |
| 3 iOS Native | 6 / 6 | editorial |
| 4 Responsive | 7 / 7 | clean 393/320 |
| 5 Typography | 4 / 10 | **9 of 12 nodes < 16 px**, h1 line-height 1.2 |
| 6 Form UX | 8 / 8 (n/a) | no form |
| 7 Overlays | 4 / 4 | none |
| 8 A11y | 5 / 6 | no `aria-live` on merge state |
| 9 Gestures | 4 / 5 | no skeleton during SC load |
| 10 Motion | 3 / 5 | only 0.15 s opacity transition — no state feedback |
| **Total** | **51 / 63** | |

### P0
1. **`PrDetail.module.css:32-46`** — `.mergeBtn` `padding: 12px; font-size: 14px` → **345×42**. Only destructive mutation entry point. Fix: `min-height: 44px`.

### P1
2. **`PrDetail.module.css:75-102`** — `.confirmBtn`/`.cancelBtn` (`padding: 8px 14px; font-size: 13px` → static-predicted ~37 px). Did not render live (clicking merge is destructive). R6 flag.
3. **`PrDetail.module.css:15`** — h1 `line-height: 1.2` on 26 px Fraunces — WCAG 1.4.12.
4. Meta chips at **11–12 px** (R3 editorial pattern).
5. **No `aria-live` on `MergeButton`** — `merged successfully` banner (`:117-125`) and error state (`:109-115`) not announced to VoiceOver.

### P2
No loading state on in-flight merge. `files changed` H2 is 14 px.

---

## 2. Draft detail — `/drafts/[draftId]` (static-only)

**Reachability:** NOT reachable. `app/drafts/[draftId]/page.tsx:15` gates on UUID + `getDraft(db, draftId)` → `notFound()`. `drafts` table has **0 rows** (verified via sqlite3). Dashboard "drafts" are GitHub issues linking to `/issues/...`, not local draft rows. Only way to create one is the FAB sheet → `createDraftAction` (a DB mutation).

### P1 (static)
1. **`DraftDetail.tsx:75-82`** — `.titleInput` missing `autocomplete`/`enterkeyhint`/`inputmode`. Same class as R3's settings inputs.
2. **`DraftDetail.tsx:95-103`** — `.textarea` missing `enterkeyhint`/`inputmode`.
3. **`DraftDetail.module.css:11-27`** — title input 26 px line-height 1.2 (WCAG 1.4.12).
4. **`DraftDetail.tsx:104-106`** — `savedIndicator` no `role="status"`/`aria-live`. R3's settings flash rides the global `ToastPortal`; draft detail does not. Needs runtime verification.

Positives: textarea 16 px (no iOS zoom), `100dvh` ✅. **R6:** pre-seed a draft row.

---

## 3. Launch progress — `/launch/mean-weasel/issuectl-test-repo/11?deploymentId=11`

**Reached via:** direct URL. Page requires `?deploymentId=<id>` (`page.tsx:34-37`); without it, notFound. Used deployment #11 from DB (active session matches R3's active-session banner). Read-only render of existing state. Screenshot `mobile-r5-launch-progress.png`.

| Cat | Pass/Total | Note |
|---|---|---|
| 1 Touch | 4 / 7 | back ‹ 44×44 ✅, "‹ back to issue" **80×16** ❌ |
| 2 iOS Safari | 5 / 5 | `100dvh` inline, safe-area inherited |
| 3 iOS Native | 6 / 6 | subtle-but-on-brand |
| 4 Responsive | 7 / 7 | clean at 393 |
| 5 Typography | 3 / 10 | **13 of 15 nodes < 16 px**, labels 13 px, details 12 px mono |
| 6 Form UX | 8 / 8 (n/a) | no inputs |
| 7 Overlays | 4 / 4 | none |
| 8 A11y | 3 / 6 | spinner not gated on `prefers-reduced-motion`, no `aria-live` |
| 9 Gestures | 2 / 5 | **no polling** — state frozen at SSR |
| 10 Motion | 3 / 5 | spinner rotates but is visually **static** (single color) |
| **Total** | **45 / 63** | |

### P0
1. **`app/launch/[owner]/[repo]/[number]/page.tsx:107-118`** — bottom "‹ back to issue" is inline-styled `<a>` (`fontSize: 13`, no padding) → **80×16**. Inline-styled, slipped past the DetailTopBar fix. Bump to 44 tall or remove (top bar already covers escape).
2. **`LaunchProgress.module.css:33-41`** — `.numActive` sets `border: 2px solid var(--paper-accent)` AND `border-top-color: var(--paper-accent)` — same color, rotation is **invisible**. Users see a static circle next to "Claude Code running" with zero motion signal. Combined with no-polling (P1 #3), the page is fully inert for long sessions. Fix: `border-top-color: transparent` or a lighter accent.

### P1
3. **`app/launch/.../page.tsx`** — **no polling / streaming / revalidate**. Force-dynamic SSR renders once and freezes. User must manually refresh to see `Session ended`. Recommend `router.refresh()` every 5 s.
4. **`LaunchProgress.module.css:43-47`** — `@keyframes spin` not gated on `prefers-reduced-motion`.
5. **No `aria-live` on `.steps`** (`LaunchProgress.tsx:51`).
6. Typography extreme: every info element 12–13 px except h1. Worktree path at 12 px mono borderline.

### P2
No step timestamps.

---

## 4. not-found — `/this-route-does-not-exist-xyz`

**Reached via:** direct URL. Also lands here from `/drafts`, invalid UUIDs, unknown issue numbers. Load-bearing. Screenshot `mobile-r5-not-found.png`.

| Cat | Pass/Total | Note |
|---|---|---|
| 1 Touch | 6 / 7 | "Back to Dashboard" **142×32** ❌ |
| 2 iOS Safari | 4 / 5 | `min-height: 60vh` (not `dvh`) |
| 3 iOS Native | 6 / 6 | editorial icon, warm cream |
| 4 Responsive | 7 / 7 | centers cleanly |
| 5 Typography | 7 / 10 | h1 24 px ✅, message 14 px × **1.7** ✅ — healthiest LH in R5 |
| 6 Form UX | 8 / 8 (n/a) | none |
| 7 Overlays | 4 / 4 | none |
| 8 A11y | 4 / 6 | icon `?` lacks `aria-hidden` |
| 9 Gestures | 4 / 5 | native back works |
| 10 Motion | 4 / 5 | clean |
| **Total** | **48 / 63** | |

### P0
1. **`components/ui/NotFoundState.module.css:51-56`** — `.link` is `padding: 8px 12px; font-size: 13px` → **142×32**. Only action on the page. Trivial fix: `padding: 14px 20px` (or convert to shared Button — but Button primitive has the same disease, see cross-route #1).

### P1
2. **`NotFoundState.module.css:6`** — `min-height: 60vh` → use `60dvh`.
3. Icon `?` glyph in `NotFoundState.tsx` — no `aria-hidden="true"`. SR reads "question mark Page not found…".

---

## 5. error boundary — `app/error.tsx` (static-only)

NOT reachable non-destructively. Invalid repo URLs land in 404. R2 reached it via deliberate state corruption — cannot reproduce read-only.

### P1 (static)
1. **`ErrorState.module.css:58-62`** — `.link` has **no padding** + `font-size: 13px`. Inline text ~13×80 — fails touch target harder than 404.
2. **`ErrorState.module.css:6`** — `min-height: 60vh` — same slip as NotFoundState.
3. **`ErrorState.tsx:24-26`** — `<Button variant="secondary">Try again</Button>` uses shared `Button.module.css:5` (`padding: 8px 14px; font-size: 13px` → ~30 px). Shared primitive fails 44 — fix at primitive level.

**R6:** add a sandboxed force-throw route fixture.

---

## Cross-route patterns

R5 reveals the R3 DetailTopBar fix did **not** ripple through `ui/` state components or the shared Button primitive.

1. **Shared `.link` and `Button` primitives are all sub-44 px.** `NotFoundState.module.css`, `ErrorState.module.css`, and `ui/Button.module.css:5` all render 29–32 px tall. Fixing `Button.module.css` (`min-height: 44px`) cascades to 404, error, and future state components.
2. **Inline styles on `app/launch/.../page.tsx` sidestepped the cascade.** The broken "‹ back to issue" is inline-styled, not in a module. Promote to a module class.
3. **`vh` vs `dvh` slipped through in state components.** Big surfaces all pass `100dvh` ✅, but `NotFoundState.module.css:6` and `ErrorState.module.css:6` still use `60vh`. Failure-state components didn't get caught in happy-path sweeps.
4. **Typography density is universal.** Every R5 route shows 9/12, 13/15 sub-16-px nodes. Affirming R3's stance.
5. **No `aria-live` on any async state transition.** MergeButton, LaunchProgress, DraftDetail saved flash all mutate visible text with no `role="status"`.
6. **Polling / streaming gap.** `LaunchProgress` is the first inherently async surface audited. Zero client-side refresh — R3/R4 didn't hit this because they audited static pages.

---

## Route-reachability notes

- **PR detail** — reachable (merged + open). Audited fully.
- **Draft detail** — NOT reachable. Drafts table empty, creation is a mutation. R6: pre-seed a draft fixture.
- **Launch progress** — reachable only with `?deploymentId=<id>`. Used existing deployment #11.
- **not-found** — reachable. Audited fully.
- **error boundary** — NOT reachable non-destructively. R6: add a force-throw route fixture.

---

## Delta hooks for R6

Pin these so R6 can diff cleanly.

**PR detail (`/pulls/mean-weasel/issuectl-test-repo/10`)**
- `MergeButton` height: **42 px** → target 44+.
- Back ‹: **44×44** (hold).
- Text nodes < 16 px: **9 / 12** (expected to stay high).
- Merge confirm row (static-predicted): **~37 px** → measure live in R6.

**Launch progress (`/launch/.../11?deploymentId=11`)**
- Bottom "‹ back to issue": **80×16** → target 44+.
- `.numActive` spinner visible rotation: **0** (single color) → target measurable contrast delta.
- Polling interval: **none** → target auto-refresh or streaming.
- `prefers-reduced-motion` gate on `@keyframes spin`: **missing** → target present.
- Text nodes < 16 px: **13 / 15**.

**not-found**
- `.link` height: **32 px** → target 44+.
- `.container` min-height: **60vh** → target `60dvh`.
- Message paragraph line-height: **1.7** — hold.

**error boundary (static)**
- `ErrorState .link` padding: **0** → target ≥ 14×20, font-size 14+.
- Shared `Button.module.css .btn` padding: **8×14** → target `min-height: 44px`.
- `ErrorState .container` min-height: **60vh** → target `60dvh`.
- Add force-throw route fixture in R6.

**Draft detail (static)**
- `titleInput` / `textarea`: missing `autocomplete` / `enterkeyhint` / `inputmode` → target present.
- `savedIndicator`: no role → target `role="status"` + `aria-live="polite"`.
- Add pre-seeded draft fixture in R6.

**Global wins verified in R5**
- `100dvh` in cascade: **true** ✅ (was false in R3).
- `prefers-reduced-motion` rule in cascade: **true** ✅ — but NOT adopted by `LaunchProgress.module.css`.
- `safe-area-inset`: **true** ✅.
- Settings back-link: **85×44** ✅ (was 85×31).
- DetailTopBar back button: **44×44** ✅ (was 27×42).

---

## Screenshots

- `qa-reports/screenshots/mobile-r5-pr-detail.png` — PR #12 merged
- `qa-reports/screenshots/mobile-r5-pr-detail-open.png` — PR #10 open, merge button visible
- `qa-reports/screenshots/mobile-r5-launch-progress.png` — active deployment #11
- `qa-reports/screenshots/mobile-r5-not-found.png` — 404 with sub-44 link

Draft detail and error boundary are unreachable non-destructively — no screenshots.
