# UX Audit R2 — issuectl web dashboard

**Date:** 2026-04-12 • **Viewport:** 1440x900 • **Base:** localhost:3847 (dev)
**Prior state:** post-PR #49 (commit 578a6a2)
**Method:** Playwright CLI via `qa-reports/ux-audit-r2-run.mjs` + `ux-audit-r2-sheets2.mjs`; DOM rubric eval
**Screens:** `/`, `/?tab=prs`, create-draft sheet, `/parse`, `/settings`, `/issues/.../11`, `/drafts/<id>`, `/pulls/.../12`, 404
**Raw data:** `qa-reports/ux-audit-r2-data.json` • **Screenshots:** `qa-reports/screenshots/ux-audit-r2-*.png`

## Binary Scorecard

| Category | Wt | Grade | Key metric |
|---|---|---|---|
| Visual Consistency | 1 | **MAJOR** | 8 font sizes on home, 14 size/weight combos, spacing-grid 48–75% (target >90%), 4 font families on settings |
| Component States | 1 | **MAJOR** | Focus ring PASS; hover-gated row actions unreachable by keyboard/touch |
| Copy & Microcopy | 1 | MINOR | Good voice. Placeholder used as label in 3 places. Mixed casing. |
| Accessibility | 2 | **CRITICAL** | No h1 on home or draft detail; 17 contrast fails on home; merged chip 1.93:1; butter warning 1.89:1; 3 unlabeled inputs; breadcrumb link 15px tall |
| Layout & Responsive | 1 | PASS | No h-scroll, scroll depth ≤1.65× |
| Navigation | 1 | MINOR | Nav OK. No `aria-current` on active tab. |
| Forms & Input | 1.5 | **MAJOR** | 3 unlabeled inputs; Button default type unset; no form wrap on Create Draft |
| Feedback | 1 | PASS | Toasts, save indicator, parse disabled-when-empty all present |
| Data Display | 1 | PASS | 11 issues / 2 PRs — under thresholds; "all clear" empty state |
| Visual Complexity | 0.5 | MINOR | Font-size count 8–10 (>6 threshold) |

**Overall: FAIL** — tripped by CRITICAL floor rules on contrast and heading hierarchy; weighted ≈61/95.

Dark mode: no `@media (prefers-color-scheme: dark)` rules; `color-scheme: light` hard-set in `app/globals.css:33`. Same palette in dark OS.

---

## P0 — ship blockers

### 1. Hover-only row actions unreachable by keyboard and touch
Unassigned row's assign/action panel is `display: none` default, shown only on `.item:hover`. `@media (hover: none)` further forces `display: none !important`, and the fallback `.assignBtn` is `display: none` at `min-width: 768px`. **Net: desktop-touch and keyboard users have no way to assign a draft.** Scan: 3 buttons in DOM, 0 reachable.
- `components/list/ListRow.module.css:32-42` — drop default `display: none`; use `opacity: 0` + `:focus-within` transition, or render actions persistently.
- `components/list/ListRow.module.css:80-91` — remove the `@media (hover: none)` kill-switch so touch devices get the in-row `.assignBtn`.

### 2. Merged-PR chip contrast 1.93:1
`rgb(91, 66, 133)` on `rgba(138, 109, 181, 0.15)` wash. The one piece of state distinguishing merged from open PRs is unreadable.
- `components/detail/DetailMeta.module.css:40-43` — darken text or swap background to reach ≥4.5:1.

### 3. Settings "no local path" warning 1.89:1
`--paper-butter` (#d9a54d) on cream. The warning colour is unreadable against the warning it conveys.
- `components/settings/RepoRow.module.css:46-49` — switch to dark amber foreground or fill pill with butter background + ink text.
- Global: `--paper-butter` at `app/globals.css:16` is reused in CI dots, WelcomeScreen, ClonePromptModal, WorktreeCleanup. Add a darker `--paper-butter-ink` token for text usage.

### 4. No `<h1>` on home or draft detail
- Home brand is `<div class={styles.brand}>issuectl·</div>` at `components/list/List.tsx:61-63`. Rubric `h1Count: 0`; only h3 section headings remain.
- Draft detail title is an `<input>` at `components/detail/DraftDetail.tsx:67-73`; 0 headings on the page.
- Fix: wrap brand in `<h1>` (keep styling); on draft detail add an sr-only `<h1>{title || "Untitled draft"}</h1>` above the title input.

### 5. Muted meta text `--paper-ink-faint` (#857a5e) = 3.6:1 — global AA fail
17 contrast failures on home alone: `#11`, counts, dates, `#9`, lifecycle badges — all use this token. Also hits issue-detail, PR-detail, draft list, settings hints.
- `app/globals.css:9` — darken `--paper-ink-faint` to `#6b6040` (≈5.1:1) OR reserve it strictly for ≥18.66px/700 large text and switch body/meta call-sites to `--paper-ink-muted` (#746a50, 4.55:1).
- Propagation: `components/detail/DetailMeta.module.css:13-19`, `list/ListRow.module.css:121-128`, `list/PrListRow.module.css:49-51`, `detail/CommentList.module.css`, `detail/PrDetail.module.css`.

---

## P1 — fix before next launch

### 6. Three unlabeled text inputs (WCAG 1.3.1 / 3.3.2)
- `components/list/CreateDraftSheet.tsx:54-61` — input with placeholder "What needs to be done?" and no `aria-label`.
- `components/parse/ParseInput.tsx` — textarea uses only placeholder.
- `components/detail/CommentComposer.tsx` — "write a comment…" textarea, no `aria-label`.
- `DraftDetail.tsx:72` already uses `aria-label="Draft title"` — replicate pattern.

### 7. WCAG 2.5.8 target-size failures on text links
- Breadcrumb `← dashboard`: 77×15px. `components/ui/PageHeader.module.css:31-47` — add `padding: 8px 0` and min-height 24.
- 404 `Back to Dashboard`: 118×16px. `components/ui/NotFoundState.module.css:51-55` — wrap in a sized pill.

### 8. `<Button>` default `type` unset; Create-draft not in a form
`components/paper/Button.tsx:14-37` never sets `type="button"`. Today it's benign because `CreateDraftSheet` uses a `<div>` wrapper, but any refactor to `<form>` will make "cancel" submit. Also audit shows the disabled-state styling of `cancel` reads heavier than the primary `save draft` during save — inverted affordance.
- `components/paper/Button.tsx:33` — `type={props.type ?? "button"}`.
- `components/list/CreateDraftSheet.tsx:53-74` — wrap in `<form onSubmit={handleSave}>`, mark save `type="submit"`. Cheap win: enables Enter-to-submit.

### 9. Spacing-grid conformance 48–75% (target >90%)
Half-pixel font sizes (10.5 / 12.5 / 15.5 / 11.5) cascade into odd padding values.
- Offenders: `.num { font-size: 10.5px }` in `detail/DetailMeta.module.css`, `list/ListRow.module.css`; `.hint { font-size: 11.5px }` in `list/CreateDraftSheet.module.css:28`; `.error { font-size: 12.5px }` in `detail/DraftDetail.module.css`; `15.5px` in `detail/PrDetail.module.css`.
- Normalize to integer scale: 10/11/12/13/14/15/17/22/26/34.

### 10. Home: 8 font sizes, 14 size/weight combos (rubric caps 6 / 10)
No type-scale tokens; each component defines sizes locally.
- Add `--paper-fs-xs/sm/md/lg/xl/2xl/3xl` in `app/globals.css`; migrate `.num`, `.meta`, `.hint`, `.title`, `.count`, `.sep` classes.

---

## P2 — polish

**11.** Create-draft hint copy duplicates the dialog description above it (`list/CreateDraftSheet.module.css:24-30`). Also add a visible `Title` label.

**12.** Next.js dev error indicator is visible bottom-left on every screen ("2 Issues" / "5 Issues" red pill). Dev-only but signals hydration or React 19 compat errors — fix underlying warnings.

**13.** Desktop FAB (`components/paper/Fab.module.css`) is a mobile pattern; desktop users expect a toolbar button. Keep for mobile; add a `+ draft` inline button on desktop near the tabs row.

**14.** `.state.merged` chip relies on color alone even after contrast fix — add an icon (merge-arrow vs open-circle) to convey state non-visually.

**15.** Settings has a `Save Settings` CTA but no clear success feedback in audit trace — wire a toast via `lib/actions/settings.ts`.

**16.** Settings page shows 4 font families because `monospace` literal leaks through `--paper-mono` fallback (`components/settings/RepoRow.module.css:41`). Verify `--font-mono-paper` is loading.

---

## Cross-screen consistency

- **Focus ring:** `rgb(45, 95, 63) solid 2px` from `app/globals.css:70-74` — consistent everywhere. PASS.
- **Fonts:** Fraunces + Inter + IBM Plex Mono trio consistent. Settings leaks a 4th (`monospace` fallback) — see #16.
- **Back buttons:** two patterns. `DetailTopBar` has a large 22px `<` button (good). `PageHeader` breadcrumb uses 12px text link (fails target-size). Consolidate.
- **Chip system:** `.state.open` passes; `.state.closed` passes; `.state.merged` fails (P0 #2).
- **Empty states:** Home's "all clear" is warm; others (`no description`, `no comments yet`, `no CI checks reported`) are neutral. Inconsistent tone — optional polish.
- **Casing:** mockup uses lowercase button labels throughout; app follows intentionally. OK.

## Suggested fix order

1. P0 #1 + #5 — hover-actions and `ink-faint` global token. Same design-system layer.
2. P0 #2 + #3 — merged chip and butter warning. Local CSS.
3. P0 #4 + P1 #6 — heading hierarchy and unlabeled inputs. One a11y PR.
4. P1 #7 — target-size fixes. Fast follow.
5. P1 #8 — Button default `type`.
6. P1 #9 + #10 — type-scale token refactor.
7. P2 polish.
