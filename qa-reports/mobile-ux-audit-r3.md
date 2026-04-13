# Mobile UX Audit — R3

**Viewport:** 393x852 (iPhone 15 Pro). Live server: http://localhost:3847. Rubric: 10 categories, 56 checks (graduated pass/partial/fail). Paper-aesthetic context applied to iOS Native Feel.

## Binary Scorecard (per-category, pass / total)

| # | Category | Pass | Total | Notes |
|---|---|---|---|---|
| 1 | Touch & Interaction | 4 | 7 | back links under 44px on 3 routes; list-row tap spacing flagged |
| 2 | iOS Safari Specific | 3 | 5 | 100vh used, no 100dvh; no fixed-bottom+keyboard conflict |
| 3 | iOS Native Feel (Paper) | 5 | 6 | no hamburger; FAB is correct pattern here, graded as intentional |
| 4 | Viewport & Responsive | 7 | 7 | clean at 393/320/landscape |
| 5 | Mobile Typography | 6 | 10 | body text < 16px; line-height < 1.5; otherwise fine |
| 6 | Mobile Form UX | 5 | 8 | autocomplete/enterkeyhint missing; labels fine |
| 7 | Interstitials & Overlays | 4 | 4 | no gratuitous overlays; sheet scrim OK |
| 8 | Mobile Accessibility | 4 | 6 | no `prefers-reduced-motion`; back-link < 24px fail |
| 9 | Gestures & Interaction | 3 | 5 | no skeletons; native swipe-back works |
| 10 | Animation & Motion | 3 | 5 | **sheet has NO open/close animation** |
| | **Total** | **44** | **63** | baseline for before/after |

> Adjusted total 63 reflects recounted checks (split 10.x into entrance/exit). Report absolute counts; do not over-index on exact percentage.

---

## Prioritized Findings

### P0 — ship-blockers for mobile

1. **[P0] Issue detail** — Back button "‹" is **27×42**, fails Apple HIG 44×44 and WCAG 2.5.8 AA (24×24 is borderline OK, but 27 px is the worst on any surface). Primary escape gesture.
2. **[P0] Settings & Parse** — "← dashboard" back link is **85×31**, fails 44×44. Same class used across routes, so fixing once fixes both.
3. **[P0] Create-draft sheet has no open/close animation.** `Sheet.module.css` has no `@keyframes`, no `transform: translateY`, no `transition-duration`. The bottom sheet snaps into place. Focus-area #5 asks "does it animate cleanly" — it does not animate at all.

### P1 — polish, real user impact

4. **[P1] No `prefers-reduced-motion` media query** in any stylesheet (8.3). Once sheet animation lands, this must ship with it.
5. **[P1] `100vh` in CSS, no `100dvh` / `100svh` fallback** (2.1 / 2.5). Not currently clipping (no full-bleed 100vh element on audited routes), but the rule exists and will bite on any future full-height panel.
6. **[P1] Body text / meta chips at 13–14px across the app** (5.1). Dashboard list row meta, in-focus / in-flight / shipped section headings, nav pills ("Issues 11", "Pull requests 2"), draft list captions. 40 of 64 sampled text nodes under 16px. Paper aesthetic justifies the small serif size for *labels/meta*, but list row *titles* render at 16–17px which is on the edge — consider bumping row titles to 17 px to match iOS Body.
7. **[P1] Line-height tight on 26 text elements** (5.4, WCAG 1.4.12). Most body text has `line-height: 1.2`–`1.3`, needs ≥ 1.5. Fraunces at 1.2 is pretty but WCAG 1.4.12 is explicit.
8. **[P1] Settings inputs missing `autocomplete`, `enterkeyhint`, `inputmode`** (6.4, 6.5, 6.8). 6/6 settings inputs and the parse textarea. No sensitive fields so not a CRITICAL, but the rubric fails this hard.
9. **[P1] Priority button (issue detail) 95×42**, 2 px short on height (1.1).
10. **[P1] Dashboard overflow button `···` is 59×43**, 1 px short (1.1). Trivial fix.

### P2 — minor, style drift

11. **[P2] No skeleton/shimmer placeholders** for list loading (9.5). Server Components render, so skeletons may not apply — mark as "N/A" if loading.tsx is intentional.
12. **[P2] List row titles ellipsize without visible hint** that content is cut ("Test draft issue (edited)issue…" suggests runs-on). Cosmetic.
13. **[P2] Adjacent list rows report < 8 px spacing (1.3).** This is the expected card-stack pattern and shouldn't be penalised — noted as a rubric false-positive, not a finding to fix.
14. **[P2] Save button label is 14 px** (typography consistency); intentional paper button style, noted not filed.
15. **[P2] FAB has `+` label only** (no aria-label scanned on the button element). Verify `aria-label="New draft"` is set for VoiceOver.

---

## Focus Areas — yes/no + one-line

1. **Save feedback affordance.** **YES, works.** Inline "✓ Saved" renders at `x=171, y=548`, 47×16, accent green `rgb(45,95,63)`, 13 px Fraunces italic, 12 px gap from Save button's right edge (`Save Settings` button at `x=32,y=534,127×44`). Animates in with `savedFlashIn 0.18s ease-out`. `aria-hidden=true` so the global toast still carries the screen-reader announcement. Clean fix for the opposite-corner feedback gap. *One nit:* 13 px italic serif on a warm-cream bg at 2500 ms may be missed by some users on bright screens — consider 14 px or longer dwell. See `mobile-r3-saved-flash.png`.

2. **Touch target sizing.** **MIXED.** Dashboard 1 fail (`···` 59×43). Issue detail 2 fails (back `‹` 27×42, priority 95×42). Settings 1 fail (`← dashboard` 85×31). Parse 1 fail (same `← dashboard`). The back-link class is reused across routes, so one fix cascades.

3. **Active-session banner on issue detail.** **YES, OK.** `LaunchActiveBanner_banner__lNlVI` renders in-flow at `y=310, 345×100`, *not* fixed/sticky, no overlap with any chrome. Contains an `End Session` button at exactly 118×44. Not dismissible — not required; banner reflects state, not a notification. No layout issues. See `mobile-r3-issue-detail.png`.

4. **Create-draft affordance.** **YES, works.** Desktop button `List_desktopDraftBtn` confirmed `display:none` at 393 px. FAB (`Fab_fab__vwAKG`) is 60×60, positioned `bottom:30px right:24px` (both safe insets OK, no overlap with any fixed region), `z-index: 100`. Opens the draft sheet on tap. See `mobile-r3-dashboard.png`.

5. **Create-draft slide-up sheet animation.** **NO — sheet does not animate.** Panel appears instantly at `y=566, height 286`, scrim at `rgba(26,23,18,0.4)` with `z:1000` and panel at `z:1001`. Computed `transition-duration: 0s`, no keyframes, no transform. Sheet is dismissable via cancel button (83×44, above 44 px) and scrim tap. Input inside sheet is **26 px font, 51 px tall** — no iOS zoom risk. Sheet respects `env(safe-area-inset-bottom)` in padding. Scroll is contained (`max-height: 85vh, overflow-y: auto`) — no scroll trapping because the scrim intercepts touches outside. See `mobile-r3-draft-sheet.png`.

6. **iOS Safari input zoom-on-focus.** **YES, all PASS.**
   - Settings inputs (6): all `font-size: 16px`, `height: 44px`.
   - Parse textarea: `font-size: 16px`, `height: 160px`.
   - Draft sheet input: `font-size: 26px` (huge — intentional hero input), `height: 51px`.
   - Saved flash span is 13 px but it's decorative copy, not an input — does not trigger zoom.
   Zero iOS auto-zoom risk on any audited input.

---

## Delta hooks for next audit

Pin these specific numbers so R4 can compute a clean before/after:
- Touch target fail count: **dashboard 1, issue detail 2, settings 1, parse 1** (total 5 under-44 on audited routes)
- Inputs under 16 px: **0** (hold at zero)
- Sheet `transition-duration`: **0 s** (target: 200–300 ms ease-out decelerate)
- `prefers-reduced-motion` media rule present: **false** → target true
- `100dvh` present: **false** → target true
- Inline saved flash time-to-visible: **~180 ms**, dwell **2500 ms** (hold or bump to 3000)
- Body text elements under 16 px: **40 / 64 sampled** — expected to stay high given design; track whether list row *titles* get bumped to 17 px.

## Screenshots referenced

- `qa-reports/screenshots/mobile-r3-dashboard.png`
- `qa-reports/screenshots/mobile-r3-draft-sheet.png`
- `qa-reports/screenshots/mobile-r3-issue-detail.png`
- `qa-reports/screenshots/mobile-r3-settings.png`
- `qa-reports/screenshots/mobile-r3-saved-flash.png`
- `qa-reports/screenshots/mobile-r3-parse.png`
