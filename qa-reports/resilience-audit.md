# Resilience Audit — issuectl Web

**Date:** 2026-04-12
**Target:** http://localhost:3847 (Next.js App Router monorepo)
**Method:** Static analysis of server actions, core DB/GitHub layers, and subprocess handling, plus Playwright CLI probes against the running dev server. Report-only.
**Scope:** chaos scenarios — partial failures, concurrency, interrupts, offline, DB locks, idempotency.

---

## Severity Table

| # | Severity | Area | Finding |
|---|---|---|---|
| R1 | **Critical** | Idempotency | Server actions have no dedup — timeout + retry creates duplicate GitHub issues, comments, and deployments |
| R2 | **Critical** | Partial failure | `launcher.launch()` throws *after* deployment row is written → orphan "launched" state in UI with no terminal |
| R3 | **High** | Auth / network | `Octokit` cached as module singleton forever; expired `gh` token is never refreshed mid-session |
| R4 | **High** | Partial failure | `assignDraftToRepo` creates GitHub issue then does local DB transaction — DB failure leaves orphan GH issue and intact draft; retry double-creates |
| R5 | **High** | Subprocess | No timeout on `git fetch`/`git clone`/`git worktree` or Ghostty spawn — a hung network call blocks the entire launch Server Action indefinitely |
| R6 | **High** | Error surfacing | Generic `"Failed to create issue"` string returned to UI; 429/401/422/5xx all look identical to the user |
| R7 | **Medium** | State | Non-fatal label failure in launch (launch.ts:143) leaves a deployment the lifecycle reconciler cannot see |
| R8 | **Medium** | Input validation | Issue title, body, comment body, draft content have **no** server-side max length |
| R9 | **Medium** | Concurrency | Worktree cleanup two-phase (git + rm) has no rollback; partial failure leaves orphaned directories |
| R10 | **Medium** | Filesystem | No disk-space / permission pre-flight; temp prompt file at `/tmp/issuectl-parse-prompt-*.txt` can leak on parse timeout kill |
| R11 | **Low** | UX under load | AddRepoForm inputs remain editable while pending; no `<form>` element so Enter key doesn't submit, but rapid double-click window exists before React commits `isPending` |
| R12 | **Low** | Observability | `revalidatePath` errors are swallowed with `console.warn` (launch.ts:78–82, comments.ts, etc.); a user who sees "success" may still be staring at stale data |
| R13 | **Low** | Routing | `/drafts/[draftId]` accepts any string; relies on DB miss → `notFound()`. No path traversal impact (SQLite lookup), but no defensive format check |

All 13 findings were reproduced or confirmed against source; Playwright CLI probes were used for the routing cases. Screenshots saved to `qa-reports/screenshots/resilience-*.png`.

---

## Critical Findings

### R1 — No idempotency on any mutating server action

**Scenario.** User clicks "Create issue" on a slow connection. Browser spinner stalls. User clicks again (or tab reloads, or React recovers from an error, or the user navigates back and hits the button twice). Two issues are created on GitHub with identical title/body.

**Evidence.**
- `packages/web/lib/actions/issues.ts:16-46` — `createIssue` posts via Octokit, no request ID / dedup key.
- `packages/web/lib/actions/comments.ts:6-30` — same pattern; double-click → double comment.
- `packages/web/lib/actions/launch.ts:38-91` — no uniqueness on `(repoId, issueNumber, branchName)` for deployments; resubmission creates a second deployment row (and a second worktree, and a second terminal).
- `packages/web/lib/actions/drafts.ts:102-138` + `packages/core/src/db/drafts.ts:117-161` — `assignDraftToRepo` is partially self-protected (the draft row is deleted after GH create, so a second UI click finds no draft), but an API replay or a retry after a transient 5xx still double-creates.

**Why this matters.** GitHub API timeouts and transient 5xxs happen. Without an idempotency key (or at least a pending-row sentinel) there is no safe retry path. The user-facing error message looks the same whether the issue was created or not.

---

### R2 — Launch writes deployment row *before* terminal opens

**Scenario.** User launches an issue. `executeLaunch` prepares the workspace, applies the label, records a deployment row in SQLite, **then** calls `launcher.launch()`. If Ghostty is missing / crashed / permission-denied, `launcher.launch()` throws. The Server Action returns `{success: false}` and the user sees an error toast — but the deployment row is still in the DB and the UI shows the issue as "deployed" until the reconciler runs (which it only does on a follow-up action that re-reads state).

**Evidence.**
- `packages/core/src/launch/launch.ts:149-155` — `recordDeployment(db, …)` writes before step 9.
- `packages/core/src/launch/launch.ts:165-173` — `launcher.launch()` can throw (see `ghostty.ts:103-111`, which wraps `execFileAsync("open", …)` errors).
- `packages/web/lib/actions/launch.ts:85-89` — action catches and returns error to UI, but never calls `endDeployment` to undo the row.

**Reproduction.** Temporarily rename the Ghostty binary or revoke Accessibility permission, trigger a launch, then inspect `~/.issuectl/issuectl.db` (`SELECT * FROM deployments WHERE ended_at IS NULL;`). You will see a row for a session that never existed.

**Blast radius.** User sees phantom "active" sessions they cannot interact with. Lifecycle labels drift from reality. Reconciler can't compensate because the label step succeeded.

---

## High Findings

### R3 — Octokit singleton never invalidates

**Evidence.** `packages/core/src/github/client.ts:4-10` caches the `Octokit` instance at module scope. `resetOctokit()` exists but no code path ever calls it. If `gh auth refresh` runs (cron, CI rotation, user re-logs in) the Next.js server keeps using the dead token. Every subsequent GitHub call returns 401 and every server action returns a generic `"Failed to …"` error until the web process is restarted.

**Mitigation hint (not to be implemented here):** detect 401, call `resetOctokit()`, retry once.

### R4 — Draft → Issue assign: dual-write without compensation

**Evidence.** `packages/core/src/db/drafts.ts:136-158`. The code comments acknowledge the risk:
> *"If either throws, both roll back and the draft stays intact locally — but the GitHub issue already exists. The caller should surface the error so the user can manually reconcile (the issueNumber is recoverable from the exception context if needed)."*

But `packages/web/lib/actions/drafts.ts:130-137` catches the error and returns the opaque string `"Failed to assign draft to repo"`. The `issueNumber` is *not* surfaced. Users cannot reconcile without opening GitHub in another tab.

### R5 — No timeout on any subprocess

**Evidence.**
- `packages/core/src/launch/workspace.ts:62-76` — `prepareExisting` calls `git fetch` with `.catch(warn)`, no timeout.
- `packages/core/src/launch/workspace.ts:81-123` — `prepareWorktree` / `prepareClone` run `git` without timeout.
- `packages/core/src/launch/terminals/ghostty.ts:99-112` — `open` + Ghostty args, no timeout.

A stalled `git fetch` (offline, DNS failure, slow origin) keeps the Server Action open until Next.js itself kills it. No progress reporting, no user cancel.

### R6 — Error-flattening across every action

Every catch in `packages/web/lib/actions/` follows the pattern `return { success: false, error: "Failed to …" }`. The real Octokit error (rate-limit countdown, 404 repo archived, 422 validation body, token expired) is logged to the server console and lost. A user hitting 429 sees the same message as a user with a typo. No actionable recovery path.

---

## Medium / Low (abbreviated)

- **R7** — `launch.ts:134-146` swallows label failures. The lifecycle reconciler (`packages/core/src/lifecycle/reconcile.ts:36-43`) only considers issues with the `issuectl:deployed` label. If the label step fails silently, the deployment exists in DB but the reconciler never advances its state.
- **R8** — No length caps: `issues.ts:16`, `comments.ts:6`, `drafts.ts:22-50`. Paste a 5 MB body → raw 422 error → opaque "Failed to create issue". Parse input is also unbounded (`packages/core/src/parse/claude-cli.ts`) and buffers into the Claude CLI child process.
- **R9** — `worktrees.ts:127-172` two-phase cleanup: git-worktree-remove failure is warn-suppressed, then `rm -rf` runs unconditionally. If `rm` fails on permission, the worktree dir is orphaned and the git metadata is inconsistent.
- **R10** — `packages/core/src/parse/claude-cli.ts:39-50, 86, 90-93` — temp prompt file is cleaned up in the `close` callback. On a timeout kill, the callback may not fire; the temp file leaks into `/tmp`.
- **R11** — `packages/web/components/settings/AddRepoForm.tsx:62-77` — the two text inputs have no `disabled={isPending}`. Minor double-submit window; React's `useTransition` mostly protects it, but it's the only form in the app without the pattern.
- **R12** — `revalidatePath` is wrapped in try/catch that only `console.warn`s (e.g. `launch.ts:78-82`). The user gets `{success: true}` but their next Server Component render may show pre-mutation data.
- **R13** — `packages/web/app/drafts/[draftId]/page.tsx` — string param flows straight into a SQL parameterised `getDraft` lookup (safe against injection), but the route accepts anything including null-bytes and emoji. Playwright probe `/drafts/%00%00bogus-%2F..` returned a clean 404 — no crash, but no defensive guardrail either.

---

## What is actually solid

`settings.ts` validation is the best in the codebase (enum whitelist, control-char rejection, 500-char cap). Branch name validation in `launch.ts:36` is strict. Markdown uses `react-markdown` with no `dangerouslySetInnerHTML` — no XSS surface. SQLite opens with WAL + foreign keys (`connection.ts:29`). The `assignDraftToRepo` author documented the partial-failure hazard — the fix is to surface it to the UI.

---

## Top 3 to fix first

1. **R2 (launch orphan)** — wrap steps 8–9 in a `try/catch` that calls `endDeployment` (or marks the row failed) on terminal-launch failure. One file, ~10 lines.
2. **R1 (idempotency)** — at minimum, store a pending-sentinel row before the GitHub call and short-circuit duplicates. Start with `createIssue` and `launchIssue` since those have the biggest blast radius.
3. **R3 (Octokit rot)** — detect 401 in a thin wrapper, call `resetOctokit()`, retry once. Five-line change in `client.ts`.

**Screenshots:** `qa-reports/screenshots/resilience-{home,bogus-draft,bad-issue-params,bad-deployment,parse-giant,home-tampered,settings}.png` — all routing probes returned non-5xx.
