# Paper Reskin Phase 5 Implementation Plan — Launch Flow

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Restyle the existing launch flow (modal + progress) in the Paper aesthetic and wire it into the Phase 4 issue detail view. Replace the `LaunchCardPlaceholder` with a live launch card. Add the new `/launch/[owner]/[repo]/[number]` progress route.

**Architecture:** The launch backend (`executeLaunch`, `launchIssue` server action) is fully functional and stays unchanged. Phase 5 is purely a visual + wiring pass: swap CSS tokens from legacy to `--paper-*`, replace legacy `Button` imports with Paper `Button`, wire the issue detail page to pass real data to the launch card, and add the progress route.

**Scope:** 8 CSS module rewrites + 4 TSX import swaps + 1 new launch card component + 1 new progress route + IssueDetail wiring. No core changes. No new tests (existing launch tests cover the backend).

---

## Tasks

### Task 5.1: Restyle all 8 launch CSS modules to Paper tokens

Batch operation — rewrite all CSS `var(--bg-surface)` / `var(--border)` / `var(--text-*)` / `var(--font-display)` / `var(--radius-*)` / etc. to their `--paper-*` equivalents across all 8 `.module.css` files in `packages/web/components/launch/`.

Token mapping:
| Legacy | Paper |
|---|---|
| `--bg-surface` | `--paper-bg` |
| `--bg-elevated` | `--paper-bg-warm` |
| `--bg-hover` | `--paper-bg-warm` |
| `--border` | `--paper-line` |
| `--border-subtle` | `--paper-line-soft` |
| `--text-primary` | `--paper-ink` |
| `--text-secondary` | `--paper-ink-soft` |
| `--text-tertiary` | `--paper-ink-muted` |
| `--font-display` | `--paper-serif` |
| `--font-mono` | `--paper-mono` |
| `--radius-sm` | `--paper-radius-sm` |
| `--radius-md` | `--paper-radius-md` |
| `--radius-lg` | `--paper-radius-lg` |
| `--green` | `--paper-accent` |
| `--green-surface` | `--paper-accent-soft` |
| `--red` | `--paper-brick` |
| `--red-surface` | `rgba(184, 74, 46, 0.08)` |
| `--accent` (orange) | `--paper-accent` (green) |
| `--accent-hover` | `--paper-accent-dim` |
| `--accent-surface` | `--paper-accent-soft` |

Also add Paper font styling: modal title becomes italic serif, body text in serif, mono for branch names.

### Task 5.2: Swap legacy Button imports to Paper Button

In 4 files, replace `import { Button } from "@/components/ui/Button"` with `import { Button } from "@/components/paper"`. The Paper Button has the same prop interface (children, variant, onClick, disabled) so no call-site changes needed — but verify the variant names match (legacy uses "primary"/"secondary"/"ghost"/"danger"; Paper uses "primary"/"accent"/"ghost"/"destructive"). Swap:
- `variant="secondary"` → `variant="ghost"`
- `variant="danger"` → `variant="destructive"`
- No change for "primary" or "ghost"
- The launch button should use `variant="accent"` (forest green, matching the mockup)

### Task 5.3: Create `LaunchCard` component (replaces placeholder)

New component at `packages/web/components/detail/LaunchCard.tsx` + `.module.css`. Shows "Ready to launch" with the forest-green left bar accent, and a real "launch →" button that opens the existing `LaunchModal` via a state toggle. Props: same as LaunchModal needs (owner, repo, repoLocalPath, issue, comments, deployments, referencedFiles).

### Task 5.4: Wire `IssueDetail` to use `LaunchCard`

Replace `LaunchCardPlaceholder` import with `LaunchCard`. Pass the required props through from the `IssueDetailPage` Server Component. The page already fetches `getIssueDetail` which returns `{ issue, comments, deployments, linkedPRs, referencedFiles }` — pass all of these plus `owner`, `repo`, and `repoLocalPath` (from `getRepo` in the same page).

### Task 5.5: Add `/launch/[owner]/[repo]/[number]` progress route

New Server Component page at `packages/web/app/launch/[owner]/[repo]/[number]/page.tsx`. Takes `?deploymentId=N` from the URL search params. Fetches the deployment from DB, fetches the issue detail for display context, renders `LaunchProgress` (already restyled in Task 5.1) inside a Paper container with the `DetailTopBar`.

### Task 5.6: Update LaunchModal navigation target

The existing `LaunchModal` navigates to `/${owner}/${repo}/issues/${issueNumber}/launch?deploymentId=${id}` on success. Update to navigate to `/launch/${owner}/${repo}/${issueNumber}?deploymentId=${id}` (the new Phase 5 route).

### Task 5.7: Final verification

Full turbo typecheck + build + lint. Eyeball the dev server.
