# issuectl — Todo-List Reskin (Paper Edition)

**Date:** 2026-04-10
**Status:** Draft (for review)
**Supersedes:** Visual layer of `docs/specs/2026-04-06-issuectl-design.md`. Monorepo structure, launch flow backend, Octokit integration, `gh auth` reliance, and SQLite cache are preserved.
**Mockups:** `docs/mockups/paper-reskin.html` — open directly in a browser. Flow anchors `#flow1` through `#flow12` correspond to the numbered sections below.

---

## Overview

Reskin `issuectl` from a GitHub-browser aesthetic (dashboard with repo grid + per-repo issue tables) into a **cross-repo personal todo list**: a single flat list of issues across every tracked repo, mobile-first, in a distinctive "Paper" visual language. Introduce **local draft issues** — author an issue inside the app without a target repo, then assign it to a repo later, at which point it syncs to GitHub as a real issue. Introduce **local priority** (high / normal / low) that drives list ordering within each section.

The change is primarily visual and informational. The data model grows (drafts, priority) but the launch flow backend, Octokit calls, `gh auth` reliance, SQLite cache, and Claude CLI parse pipeline all remain intact. The old dashboard, per-repo pages, and sidebar are removed.

---

## Goals

1. **Single cross-repo list** as the primary (and nearly only) view. No repo grid, no per-repo drill-down.
2. **Mobile-first responsive layout.** Same web app, same local server, different viewport widths. Phones reach the app via the LAN IP (same network) or the user's own VPN (remote).
3. **Distinctive "Paper" visual language** — warm cream background, deep ink text, forest green accent, italic Fraunces serif display, Inter body, IBM Plex Mono identifiers. Intentional and non-generic.
4. **Local draft issues** — create an issue inside the app without a target repo. Persisted to local SQLite. Assigning to a repo pushes it to GitHub as a real issue.
5. **Local priority** drives list ordering. Three levels (high / normal / low), default normal. Within a section: high first, then normal by updated-at, then low.
6. **Swipe-from-right to assign** on mobile (signature interaction). Desktop equivalent: hover on a row reveals quick-action buttons.
7. **LAN-bound server.** Next.js binds to the machine's LAN interface by default so phones on the same network can reach it directly.

## Non-goals

- Native mobile app (we're a web app running on the user's PC/Mac).
- Auth shim, login flow, or per-device approval — trust the LAN / VPN in v1.
- Deployed / hosted / multi-tenant mode.
- Keyboard shortcuts in the web UI.
- Manual drag-to-reorder (priority handles ordering).
- Preserving the old dashboard or per-repo pages.
- Offline mode — still online-first with SQLite-backed read cache.
- Dark mode — Paper *is* the theme.
- Multi-user coordination, feature flagging, or gradual rollout — `issuectl` is a single-user tool (the author); we ship in one go.

---

## Vocabulary

The reskin uses **"issue"** everywhere, never "task." Additional terms:

- **Draft** — a local issue that has not yet been pushed to GitHub. Has a title, body, and priority; no repo assignment.
- **Assigned** — a draft after it's been pushed to a repo. Becomes a normal GitHub issue with a number.
- **Launched** — an issue that has had a Claude Code session opened for it. The session can be active or ended.
- **In flight** — an issue with an active launch.
- **Shipped** — an issue that is closed or has a merged linked PR.
- **Sections** — fixed for v1: `unassigned` / `in focus` / `in flight` / `shipped`.

---

## Information architecture

### Routes

| Route | Purpose |
|---|---|
| `/` | Main list (Issues tab, cross-repo). `?tab=prs` switches to Pull requests. |
| `/settings` | Settings page. |
| `/create` | Quick Create natural-language parse flow. |
| `/drafts/[draftId]` | Local draft detail (pre-assignment). |
| `/issues/[owner]/[repo]/[number]` | Issue detail. |
| `/pulls/[owner]/[repo]/[number]` | PR detail. |
| `/launch/[owner]/[repo]/[number]` | Launch progress view (shown while the server provisions and opens Ghostty). |

All old routes under `/[owner]/[repo]/...` are removed.

### Navigation

- **Desktop**: a top tab bar inside the main list header — `Issues / Pull requests / Quick Create / Settings`. A `+ new issue` button sits to the right of the date. (The Flow 01 desktop mockup shows three tabs for visual compactness; the Quick Create tab is in scope.)
- **Mobile**: the main list top bar has a `···` menu icon in the top right. Tapping it slides a drawer in from the right with `All issues` (active), `Pull requests`, `Quick Create`, `Settings`. The drawer footer shows auth status (`gh ✓`), version, and the LAN-bound address so the user can tell someone else the URL.
- **Detail → list**: a `‹` back arrow on mobile, a `back to list` text link on desktop.

---

## Visual language

All tokens live in `packages/web/app/globals.css` as CSS custom properties. Component styles use CSS Modules referencing those tokens. The `frontend-design` skill handles the actual CSS authoring during implementation.

### Color tokens

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#f3ecd9` | Primary background — warm cream. |
| `--bg-warm` | `#ede5cf` | Slightly recessed surface (launch card, modal card). |
| `--bg-warmer` | `#e6dec4` | Repo chip background, tag surfaces. |
| `--ink` | `#1a1712` | Primary text — deep warm near-black. |
| `--ink-soft` | `#3a342a` | Body text. |
| `--ink-muted` | `#8a7f63` | Secondary text, labels. |
| `--ink-faint` | `#b5a88a` | Tertiary text, placeholders, hints. |
| `--line` | `#e0d6bc` | Borders, section dividers. |
| `--line-soft` | `#e9dfc6` | Row dividers (subtler). |
| `--accent` | `#2d5f3f` | Forest green — primary action, done state, active tab underline. |
| `--accent-soft` | `#dce8de` | Green-tinted chip surface. |
| `--brick` | `#b84a2e` | Error, destructive actions, bug label, CI failure. |
| `--butter` | `#d9a54d` | Feature label, CI pending / building state. |

A subtle paper-noise SVG overlay at 18% opacity + `mix-blend-mode: multiply` sits under all content on `.paper` surfaces. Not kitschy — just enough texture to keep the cream from feeling flat.

### Typography

| Family | Use |
|---|---|
| **Fraunces** (variable serif, italic + roman, 400–700) | Brand, display titles, section headers, tabs, row titles, body text, italic italic italic — the signature voice. |
| **Inter** (400–600) | Meta rows, dates, small UI text. |
| **IBM Plex Mono** (400–600) | Repo names, issue numbers, file paths, counts, any identifier. |

Key sizes: 34px mobile brand (40px desktop), 26px mobile detail title (36px desktop), 17px row title, 13–14px meta, 11–12px labels. Generous leading everywhere.

### Spacing & radii

Base 4px. Common paddings: 22–24px top bar, 24px list horizontal, 16px row vertical, 12–14px card inner. Radii: 3px tags, 6px buttons, 8px inputs, 10–14px cards, 40px phone frame, 50% avatars.

### Accent usage rules

- **Forest green** only for *action* or *progress*: launch buttons, assign reveal, checkbox fills, "in flight" pulse, active tab underline, `gh ✓` authenticated indicator.
- **Brick red** only for *error* or *destructive*: bug label, close-issue button, CI failure dot, auth error icon.
- **Butter yellow** only for *pending*: feature label, CI building dot.
- **Ink** for *neutral primary* buttons (save, edit, send) and the FAB.
- Everything else is the ink → muted → faint grayscale on cream.

---

## Data model changes

### New table: `drafts`

```sql
CREATE TABLE drafts (
  id          TEXT PRIMARY KEY,                      -- uuid v4
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  priority    TEXT NOT NULL DEFAULT 'normal'
              CHECK (priority IN ('low', 'normal', 'high')),
  created_at  INTEGER NOT NULL,                      -- unix seconds
  updated_at  INTEGER NOT NULL
);
```

A draft has no `repo_id` — the absence is what makes it a draft. On assignment, the draft is pushed to the chosen repo via Octokit, the returned GitHub issue is cached, and the draft row is deleted.

### New table: `issue_metadata`

```sql
CREATE TABLE issue_metadata (
  repo_id       INTEGER NOT NULL,
  issue_number  INTEGER NOT NULL,
  priority      TEXT NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low', 'normal', 'high')),
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (repo_id, issue_number),
  FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE
);
```

Local-only metadata keyed to a GitHub issue. Never synced. A row exists only when a non-default priority has been set (absence means `normal`).

### Section assignment (computed, not stored)

Sections are derived at query time, not stored:

| Section | Rule |
|---|---|
| `unassigned` | Rows from the `drafts` table. |
| `in focus` | Open GitHub issues that are NOT "in flight" and NOT recently shipped. |
| `in flight` | Open GitHub issues with an active launch (row in `deployments` with `ended_at IS NULL`). |
| `shipped` | Issues that are closed OR have a merged linked PR (via `linked_pr` in the cache). |

Within each section, order is `priority DESC, updated_at DESC`. Priority for issues with no `issue_metadata` row is `normal`. Draft priority comes from `drafts.priority`.

### Existing tables

Unchanged: `repos`, `settings`, `deployments`, `cache_*`. The `claude_aliases` table was already dropped in the pre-reskin work (replaced by `claude_extra_args`). Schema version bumps from v4 → v5 with the new tables.

---

## Flows

Each flow references a named anchor in the mockup file `paper-all.html`.

### Flow 01 — Main list (the home) — `#flow1`

The landing page. Cross-repo flat list grouped into sections, with tabs for Issues and Pull requests.

- **Mobile**: single column. Top bar has brand + date + `···` menu icon. Below: Issues / PRs tabs (with mono counts). Below that: an italic-serif search input. Then the list. A floating `+` button (FAB, ink circle) anchors the bottom right for creating a new draft.
- **Desktop**: centered column (max ~900px), no sidebar. Top bar has brand + version + date + `+ new issue` button. Tabs include `Settings`. Hover on a row reveals quick-action buttons (`assign` / `reassign` / `launch`) flush-right.
- **Sections**: `unassigned` (only shown when drafts exist) / `in focus` / `in flight` / `shipped` (only shown when there's anything shipped).
- **Row anatomy**: checkbox (4 states: open, in-flight pulsing, done, draft) · Fraunces 17px title (strikethrough in accent green when done) · meta row with repo chip (or dashed italic "no repo") · mono `#num` · label (brick for bug, butter for feature) · relative age.

### Flow 02 — Issue detail — `#flow2`

- **Mobile**: full-screen. Top bar: `‹` back · `owner/`**repo** breadcrumb · `···` menu. Body: title · meta · launch card · body text · comments · sticky composer pinned to the bottom.
- **Desktop**: centered 820px column with a right side column (240px) holding the launch card + metadata blocks (assignee, milestone, labels, referenced files).
- **Launch card**: forest-green left bar, "Ready to launch" heading, one-line description mentioning the would-be worktree path, `launch →` primary and `configure` ghost button.
- **Comments**: threaded, monogram avatar, author name, relative time, body. All Fraunces, warm card surfaces.
- **Composer**: a sticky italic input anchored to the bottom on mobile; an inline textarea on desktop.

### Flow 03 — New issue creation (drafts) — `#flow3`

Tapping the FAB (mobile) or `+ new issue` (desktop) opens a full-screen form on mobile or a 640px modal on desktop. The title input is the hero: 26px Fraunces with an italic placeholder that fades as you type. Body is a multi-line version of the same. Below a divider: `repo` field (defaults to italic green dashed "unassigned"), `labels` field (disabled with "assign a repo first" until a repo is picked), `priority` field (defaults to normal, tap opens the picker). Two save paths: `save draft` (quiet, stays local) and `assign & save` (opens the assign sheet, then pushes to GitHub).

### Flow 04 — Claude Code launch — `#flow4`

- **Mobile**: full-screen launch form. Top bar has `‹` back · `Launch` · `launch →` in accent green. An issue reference block (with forest-green left bar) sits at the top. Form fields below: workspace (`new worktree` / `existing clone`), branch, preamble, context toggles (comments, referenced files, linked PRs), claude extra args.
- **Desktop**: centered 580px modal with the same fields, `save as default` ghost and `launch →` accent button at the bottom.
- **Mobile and desktop behave identically on submit**: the request hits the local server running on the user's Mac, which spawns Ghostty on the Mac. Mobile is just a narrower viewport of the same local app.

### Flow 05 — First run & empty states — `#flow5`

- **Welcome screen** (first open, no repos yet): huge italic brand, functional tagline *"every issue, every repo. launch any of them with Claude Code."*, a green `gh ✓ authenticated` pill, `add your first repo` CTA, hint to create a draft without a repo.
- **All-clear empty list**: `❧` hedera ornament in accent green, "all clear" heading, hint line *"breathe, or draft the next one."*

### Flow 06 — Settings — `#flow6`

One settings surface with four sections and a footer:

1. **Tracked repos** — list with colored dot, name, local path, edit. `+ add a repo` row at the bottom opens the repo add modal (Flow 11).
2. **Defaults** — branch pattern, cache TTL, terminal (`Ghostty · v1`, read-only with a v2 hint).
3. **Claude config** — extra args, default preamble template.
4. **Worktree cleanup** — list of stale worktrees (linked to merged/closed issues) with per-row remove and a `remove all stale` bulk action.
5. **About** (footer block) — auth status (green ✓), version, data file path + size, network-bound address.

No global "save" button — fields commit on blur with a subtle "saved" flash on the field itself.

### Flow 07 — Quick Create — `#flow7`

The existing 3-step natural-language parse flow, restyled. Input → Review → Results, with a three-dot stepper at the top of each step. Backend is unchanged (still uses the Claude CLI).

### Flow 08 — PR detail — `#flow8`

Sibling of the issue detail. CI check list replaces the launch card. Files changed diff list replaces the referenced-files sidebar block. Merge button (accent green) sits where the launch button would be, shown only when CI is green. Same top bar, same composer, same side-column pattern.

### Flow 09 — Launch progress — `#flow9`

Shown at `/launch/[owner]/[repo]/[number]` after the launch form submits. A stepped checklist of what the server is doing:

1. Assembled context (with count of comments + files)
2. Created worktree (with path)
3. Checked out branch (with branch name)
4. Opening Ghostty…
5. Apply "launched" label

Active step pulses its inner dot in accent green. Completed steps fill and show a check. Pending steps stay faint. A calm footer message reminds the user the Ghostty window appears on their Mac, not in the browser. On error, the active step turns brick red and shows a `retry` / `open logs` action.

### Flow 10 — Auth error — `#flow10`

Shown on app load if `gh` CLI is missing or unauthenticated. Full-screen Paper page: brick-red dashed circle with `!` glyph, "GitHub CLI not ready" heading, three numbered remediation steps with mono `code` spans, `retry →` button. Blocks the app until auth is fixed.

The same layout pattern applies to other fatal startup errors (SQLite inaccessible, port in use) with different glyphs and copy.

### Flow 11 — Modal anthology — `#flow11`

Five small overlays that share one pattern: warm paper card on a darker paper scrim, monospace eyebrow label, italic serif title, muted explanation, action row at bottom right. Button hierarchy: ghost for cancel, ink for neutral primary (save), accent green for primary (apply, clone), brick red for destructive (close).

1. **Close issue confirmation** — destructive, brick red button.
2. **Edit issue** — reuses new-issue form shape with existing values pre-filled; `save changes` ink button.
3. **Label manager** — checkbox list scoped to the target repo's available labels with color dots; `apply` accent button.
4. **Add a repo** — owner/name, local path (optional), branch pattern override; `add repo` ink button.
5. **Clone prompt** — warning card shown when launching an issue in a repo with no local path; choices: `cancel` / `set path manually` / `clone & launch →`.

On mobile, all five collapse to full-screen sheets with the same button row sticky at the bottom.

### Flow 12 — Supplements — `#flow12`

- **Mobile nav drawer** — the `···` top-right icon opens a right-side drawer with `All issues` (on), `Pull requests`, `Quick Create`, `Settings`. Footer shows auth + version + LAN-bound address.
- **PR tab variant of the main list** — `Pull requests` tab active, PR-specific row anatomy: status dot replaces the checkbox (✓ passing / × failing / pulsing butter building / purple merged). Sections rename to `ready to merge / in review / shipped`.
- **Priority picker** — bottom sheet triggered from the detail page meta row or the new-issue form. Three options (high / normal / low), current selection marked, short italic descriptions. On the detail meta row, a high-priority issue gets a small `↑` glyph before "high priority." Normal and low have no glyph on the detail page. The **list rows show no priority glyph at all** — position within the section is the signal.

---

## What's being removed

| File / component | Disposition |
|---|---|
| `app/page.tsx` (dashboard repo grid) | Rewritten to the flat list. |
| `app/[owner]/[repo]/page.tsx` | Deleted; replaced by the flat list. |
| `app/[owner]/[repo]/issues/[number]/page.tsx` | Moved to `/issues/[owner]/[repo]/[number]`. |
| `app/[owner]/[repo]/pulls/[number]/page.tsx` | Moved to `/pulls/[owner]/[repo]/[number]`. |
| `components/dashboard/RepoGrid.tsx` | Deleted. |
| `components/dashboard/RepoCard.tsx` | Deleted. |
| `components/dashboard/DashboardCacheStatus.tsx` | Deleted. Cache/auth status moves into the Settings "about" block. |
| `components/dashboard/CacheBar.tsx` | Deleted. |
| `components/repo/RepoHeader.tsx` | Deleted. |
| `components/repo/IssuesTable.tsx` | Replaced by the new cross-repo list component. |
| `components/repo/PullsTable.tsx` | Replaced by the PR variant of the same list. |
| `components/repo/TabBar.tsx` | Replaced by the new top tabs inside the list header. |
| `components/sidebar/Sidebar.tsx` | Replaced by mobile nav drawer + desktop top tabs. |

## What's being added

- **Cross-repo list component suite** under `components/list/` — `List.tsx`, `ListSection.tsx`, `ListRow.tsx`, `PrRow.tsx`, `RowActions.tsx`.
- **Assign sheet** (`components/list/AssignSheet.tsx`) — bottom sheet reused for assign and reassign.
- **Priority picker sheet** (`components/list/PrioritySheet.tsx`).
- **Nav drawer** (`components/nav/NavDrawer.tsx`).
- **Draft store** in core (`packages/core/src/db/drafts.ts`): `createDraft`, `listDrafts`, `getDraft`, `updateDraft`, `deleteDraft`, `assignDraftToRepo`.
- **Priority store** in core (`packages/core/src/db/priority.ts`): `setPriority`, `getPriority`, `deletePriority`.
- **DB migration** — schema version v4 → v5 adding `drafts` and `issue_metadata` tables.
- **LAN binding** — the `issuectl web` command binds Next.js to the machine's LAN interface by default, with a `--host` override and a `--local-only` flag to revert to loopback. Prints the bound URL at startup.
- **Paper CSS tokens** — all color / type / spacing values in `app/globals.css` as custom properties.
- **Swipe gesture handler** — a small touch-event utility for list rows (threshold-based reveal + trigger).
- **`/launch/[owner]/[repo]/[number]` route** — the launch progress view with streaming step updates.
- **`/drafts/[draftId]` route** — local draft detail view.
- **Loading, 404, error boundary** — Paper-styled `loading.tsx`, `not-found.tsx`, `error.tsx` at the root and at each relevant nested level.

## What stays (backend mostly unchanged)

- **Launch flow backend** — context building (`core/launch/context.ts`), branch creation, Ghostty spawning. The new `/launch/` route wraps it with step-by-step progress streaming but the logic is unchanged.
- **Octokit integration** — all GitHub calls remain. One new server action: `createIssueFromDraft(draft, targetRepo)` wraps `octokit.issues.create`.
- **`gh auth token` integration** — unchanged.
- **SQLite cache** — unchanged; new tables are purely additive.
- **Claude CLI parse flow** — unchanged backend, restyled UI.
- **Settings backend** — `claude_extra_args`, `cache_ttl`, `branch_pattern`, `terminal` stay in the `settings` table.

---

## Network & auth

### Server binding

The Next.js server currently binds to `127.0.0.1`. Change `issuectl web` to:

1. Detect the primary LAN interface (e.g., via `os.networkInterfaces()`).
2. Bind Next.js to `0.0.0.0` so it accepts connections from any interface.
3. Print both the LAN URL and the loopback URL at startup. Example:
   ```
   issuectl web
     →  http://192.168.1.42:3847  (LAN — reachable from phones on this network)
     →  http://localhost:3847     (loopback)
   ```
4. Accept a `--host` flag to override the bound address.
5. Accept a `--local-only` flag to force loopback-only binding for untrusted networks.

The Settings → About → "network" field shows the currently-bound address so the user can copy it to their phone.

### Auth

No auth shim in v1. The user is responsible for network access control:

- **Same network** → direct LAN URL works.
- **Remote** → user's own VPN.
- **Untrusted network (coffee shop)** → use `--local-only` or disconnect from that network.

This is documented in the startup banner and in Settings → About. A v2 could add a token-in-URL or per-device approval.

### Security considerations

- The `gh auth token` used by the server is **never exposed to the client.** All GitHub API calls run server-side via Server Actions.
- Cached issue / PR data in SQLite contains no secrets — only body text and GitHub metadata.
- Launching Claude Code triggers a shell command on the server (`open -na Ghostty ...`). This is reachable via any client that can hit the bound server. Relies on the LAN/VPN trust model.
- `gh` command execution from the server uses argv-array invocation (not shell interpolation) — already the case in the existing code.

---

## Error handling

| Situation | Handling |
|---|---|
| `gh` CLI missing or unauthenticated | Flow 10 screen blocks the app. |
| GitHub API network error on list fetch | Show cached data with a small "updated N ago" indicator; retry button in the top bar. |
| Launch step failure | Flow 09's active step turns brick red, shows error text + `retry` / `open logs` actions. |
| Draft assign failure (GitHub push error) | Toast + keep the draft in its unassigned state with an error flag; user can retry from the detail page. |
| 404 | Paper-styled `not-found.tsx` with link back to the list. |
| Uncaught error | `app/error.tsx` in Paper vocabulary; shows error message in development only. |

Toast notifications use a small bottom-center sheet pattern (not mocked in Flow 11's anthology; will be designed inline with implementation). The design vocabulary is: ink card with forest green check for success, brick red `!` for error, ~4s auto-dismiss, tap to dismiss.

---

## Testing

No test framework is currently set up. When adding one (Vitest is the intended choice), prioritize:

1. **Draft lifecycle** — `createDraft` → `assignDraftToRepo` → verify the GitHub issue was created with the expected title/body and the draft row was deleted.
2. **Priority ordering** — verify `listIssues` returns rows sorted by `priority DESC, updated_at DESC` within each section.
3. **Section assignment rules** — unit test the logic that groups issues into `unassigned / in focus / in flight / shipped`.
4. **Swipe gesture handler** — unit test threshold detection and reveal/trigger states.
5. **Launch progress streaming** — integration test that `/launch/...` emits the five steps in order for a happy path, and that an error on any step transitions that step to the error state.

Visual regression tests are out of scope for v1.

---

## Rollout

This is a breaking UI change. No backwards-compat mode, no feature flag: `issuectl` is a single-user tool (the author), so there's no coordination required and no other users to protect. We ship in one go.

1. The DB migration to v5 runs automatically on first start after the update, adding `drafts` and `issue_metadata`.
2. Old routes and components are deleted in the same PRs that add their replacements.
3. Existing repos, settings, deployments, and cached issues/PRs are preserved — the new UI reads from the same underlying tables.

The implementation plan should still decompose this into phases — not for continuous availability, but for **reviewability**. Smaller PRs are easier to review, revert, and bisect when something goes wrong. A reasonable decomposition:

1. **Data layer** — `drafts` and `issue_metadata` tables, core CRUD functions, priority-aware query helpers, schema migration to v5. No UI changes.
2. **Paper design tokens + shared primitives** — `globals.css` Paper tokens; reusable primitives like `Chip`, `Row`, `Sheet`, `Drawer`, button variants. Can coexist with the old UI.
3. **Main list** — replace `app/page.tsx` with the flat cross-repo list, its swipe handler, and its section/priority logic. At this point the old dashboard is gone.
4. **Issue + PR detail** — add `/issues/[owner]/[repo]/[number]` and `/pulls/[owner]/[repo]/[number]` routes with the new Paper detail views.
5. **Launch flow UI** — new `/launch/...` progress route; update the launch form to Paper; wire the new progress streaming.
6. **Settings + Quick Create + Auth error + empty states** — restyle these surfaces; backend unchanged.
7. **Mobile nav drawer + PR tab variant + priority picker sheet** — the supplementary flows from `#flow12`.
8. **Cleanup** — delete the old `components/dashboard/`, `components/repo/`, `components/sidebar/` directories and the orphaned `[owner]/[repo]/...` routes.

The app may be in a partly-broken state between phases 3 and 8 — that's acceptable since there's only one user.

---

## Open questions / future work

- **Drag-to-reorder** — deferred. Priority is the v1 answer.
- **Native mobile app** — deferred. Web at LAN/VPN is v1.
- **Keyboard shortcuts** — non-goal for v1.
- **Toast pattern visual design** — described above; will be designed inline during implementation.
- **Priority beyond 3 levels** — unlikely; stay at low/normal/high.
- **Labels on drafts** — disabled until assignment in v1. A v2 could pre-suggest labels based on the target repo.
- **PR section naming** — `ready to merge / in review / shipped` is a guess. If it feels wrong in use, revisit.
- **Launched labels beyond "issuectl:launched"** — the existing lifecycle label system (`issuectl:launched`, `issuectl:deployed`) is preserved unchanged.

---

## Mockup reference

The full mockup file is committed at `docs/mockups/paper-reskin.html`. Open it directly in a browser — no server needed. The flows anchor at `#flow1` through `#flow12`, matching the numbered flow sections above.

The mockup is the visual reference for implementation. The `frontend-design` skill should be invoked during the UI implementation phase to author the actual CSS Modules and component code from these tokens and frames.
