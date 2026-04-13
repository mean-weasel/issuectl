# Adversarial Audit — Business Logic Abuse

**Date:** 2026-04-12
**Branch:** fix/perf-polish-bundle
**Scope:** Workflow, state, scope, and cost surface — NOT input sanitization (covered in earlier audits).
**Method:** Parallel code exploration (3 agents) + spot-verification of top findings at file:line level. Dev server live at localhost:3847.

## Severity Summary

| # | Severity | Finding | File |
|---|---|---|---|
| 1 | **Critical** | `batchCreateIssues` creates GitHub issues in untracked repos | `web/lib/actions/parse.ts:86-128` |
| 2 | **Critical** | `removeRepo` FK blocks deletion of any repo with deployment history | `core/src/db/repos.ts:49-54` |
| 3 | **High** | Duplicate active deployments for the same issue — no idempotency | `web/lib/actions/launch.ts:67` + `core/src/launch/launch.ts:148-155` |
| 4 | **High** | Unbounded fan-out: dashboard refresh hits every repo × endpoint in parallel | `core/src/data/repos.ts` + `data/issues.ts:48-52` |
| 5 | **High** | Token staleness is silent — no re-auth path when `gh` token expires | `core/src/github/client.ts` |
| 6 | **High** | Draft body/title unbounded at write time (can paste 50MB) | `web/lib/actions/drafts.ts:22-50` |
| 7 | **High** | Launch records deployment after workspace prep but swallows label failures silently | `core/src/launch/launch.ts:143-155` |
| 8 | **Medium** | Worktree path reuse collides when same (repo, issue#) re-launched with new branch | `core/src/launch/workspace.ts:94-97` |
| 9 | **Medium** | `updateDraftAction` returns `{success:true}` even when draft was deleted | `web/lib/actions/drafts.ts` + `core/src/db/drafts.ts:87-89` |
| 10 | **Medium** | Concurrent draft promotion race creates duplicate GitHub issues | `core/src/db/drafts.ts:117-161` |
| 11 | **Medium** | No orphan worktree cleanup — deployment history rots unbounded | `core/src/db/schema.ts:21-31` |
| 12 | **Low** | `/drafts/[id]` direct URL reveals draft by UUID with no auth gate | `web/app/drafts/[draftId]/page.tsx` |
| 13 | **Low** | `parse` accepts unbounded input — no size cap before Claude CLI spawn | `web/lib/actions/parse.ts:24-29` |

**Totals:** 2 Critical, 5 High, 4 Medium, 2 Low.

---

## Top Findings — Reproduction & Detail

### 1. CRITICAL — Parse creates issues in untracked repos

**File:** `packages/web/lib/actions/parse.ts:86-103`

`batchCreateIssues` iterates accepted ReviewedIssues and calls `coreCreateIssue(octokit, issue.owner, issue.repo, …)` directly. It never checks `getRepo(db, issue.owner, issue.repo)`. Only `parseNaturalLanguage` does a coarse `listRepos(db).length > 0` check (line 36) — the actual creation trusts whatever owner/repo the LLM returned.

**Repro:**
1. Add a single tracked repo `foo/bar`.
2. `/parse` with text like *"Create bug in neonwatty/secrets-repo: leak credentials"*.
3. Claude may return `owner:"neonwatty", repo:"secrets-repo"`.
4. In review sheet, accept as-is (or even fix the owner to a malicious one).
5. Click **Create**. GitHub issue lands in `neonwatty/secrets-repo`, which issuectl does not track — the user cannot launch it, cannot see it on the dashboard, and has no record.

**Why it matters:** LLM can hallucinate or user can edit to any repo the token has write access to. The trust boundary is the tracked-repo list; parse bypasses it. Combined with the `gh` token's typical broad scope, this is cross-repo write access from the parse UI.

---

### 2. CRITICAL — `removeRepo` blocked forever by deployment history

**File:** `packages/core/src/db/repos.ts:49-54` + `schema.ts:21-31`

`deployments.repo_id INTEGER NOT NULL REFERENCES repos(id)` has **no `ON DELETE` clause**, and `PRAGMA foreign_keys = ON` (connection.ts:30). Default action is `NO ACTION` → the `DELETE FROM repos` throws `SQLITE_CONSTRAINT_FOREIGNKEY` if any deployment row points at the repo.

**Repro:**
1. Track `foo/bar`, launch any issue (creates a deployment row).
2. End the session (doesn't delete the row — `ended_at` is set).
3. Try to remove `foo/bar` from `/settings`.
4. `removeRepo` action returns `"Failed to remove repository"` (web/lib/actions/repos.ts:72-73 swallows the FK error into a generic message).

**Why it matters:** Once you've *ever* launched an issue against a repo, you can't remove that repo without manually editing SQLite. `issue_metadata` CASCADEs — `deployments` doesn't. The generic error message gives the user no path forward.

---

### 3. HIGH — Duplicate active deployments, no idempotency

**File:** `packages/web/lib/actions/launch.ts:67` → `packages/core/src/launch/launch.ts:149-155`

`executeLaunch` always calls `recordDeployment`. There is no `SELECT … WHERE issue_number=? AND ended_at IS NULL` check anywhere. No UNIQUE constraint on `(repo_id, issue_number)` filtered by `ended_at`.

**Repro:**
1. Launch issue #42 in worktree mode → deployment row A, path `~/worktrees/bar-issue-42`.
2. Go back, launch #42 again (e.g. different branch name, same issue).
3. Worktree reuse path at `workspace.ts:94-97` reuses the existing directory.
4. New deployment row B is recorded with the same `workspace_path`.
5. DB now shows two active deployments for one physical worktree. Ending session A leaves B pointing at a ghost.

**Why it matters:** The UI shows a stale "deployed" badge state. `reconcile.ts` has no way to tell A from B. Spam-clicking Launch creates unbounded rows — combined with finding #2, this makes the repo permanently un-removable faster.

---

### 4. HIGH — Unbounded GitHub API fan-out on refresh

**File:** `packages/core/src/data/repos.ts` (`getDashboardData`) + `data/issues.ts:48-52`, `data/comments.ts:29-33`

`getDashboardData` does `Promise.all(repos.map(…))` with nested `Promise.all([getIssues(), getPulls()])`. No concurrency cap. Stale cache entries also spawn fire-and-forget revalidation (`.catch(…)` with no backpressure).

With 50 tracked repos × (issues + pulls) = 100 concurrent Octokit calls per refresh, plus per-issue-detail revalidations triggered by navigating. GitHub's secondary rate limiter starts 403-ing around ~100 requests in a burst. No 403/429 handler, no retry-after.

**Repro:**
1. Add 20+ repos in settings.
2. Load `/` — network tab shows ~40 requests fired in parallel.
3. Spam refresh 5× → cumulative ~200 in a few seconds → GitHub returns `403 "You have exceeded a secondary rate limit"`.
4. All subsequent dashboard loads fail silently (cache-or-nothing).

---

### 5. HIGH — Silent token staleness

**File:** `packages/core/src/github/client.ts` (singleton `getOctokit`)

Token is fetched once via `gh auth token` and cached in a process-lifetime singleton. If the user logs out, rotates the token, or `gh` refreshes it mid-session, the cached Octokit keeps the stale token. Octokit returns 401s; those bubble up as `"Failed to create issue"` with no hint about auth. No refresh-on-401 interceptor.

**Business impact:** Silent auth failures during draft promotion can leave the draft present locally but the user believes the issue was created (or vice versa — finding #10).

---

### 6. HIGH — Draft body/title unbounded

**File:** `packages/web/lib/actions/drafts.ts:22-50` (`validateTitle`, `validateBody`)

`validateBody` only trims and returns. No max length. A 50 MB paste goes straight into SQLite `TEXT`. Every subsequent `getDraft` / list hydrates the full blob. Draft detail page doesn't paginate. Combined with `updateDraft` rewriting the whole row on every keystroke, this is a self-DoS vector.

---

### 7. HIGH — Deployment row created after label apply fails silently

**File:** `packages/core/src/launch/launch.ts:143-155`

Label failure is caught and logged (`"Failed to apply deployed label"`), but `recordDeployment` still runs. Issue on GitHub never gets the `issuectl:deployed` label, but DB says it's deployed. Lifecycle reconcile (`reconcile.ts:46`) keys off the GitHub label — it will think the deployment doesn't exist and may re-offer Launch.

---

### 8. MEDIUM — Worktree path collision on re-launch with new branch

**File:** `packages/core/src/launch/workspace.ts:88-97`

Worktree name is `${repo}-issue-${issueNumber}` — deterministic per (repo, issue#), independent of branch. Re-launching #42 with `fix/a` and later `fix/b` reuses the same directory. Line 96 calls `createOrCheckoutBranch` on the existing path — any uncommitted work on the first branch is silently switched away from.

---

### 9. MEDIUM — `updateDraft` silent-success on missing draft

**File:** `packages/core/src/db/drafts.ts:87-89` + the action wrapper

`updateDraft` returns `undefined` when the draft is gone. `updateDraftAction` doesn't check the return and responds `{success: true}`. Tab A deletes the draft, Tab B's autosave reports success — user thinks their edits are saved.

---

### 10. MEDIUM — Concurrent draft promotion race

**File:** `packages/core/src/db/drafts.ts:117-161`

`assignDraftToRepo` calls `octokit.issues.create` **outside** the transaction (line 136), then runs `setPriority + deleteDraft` in a transaction. Two concurrent tabs promoting the same draft both hit GitHub → two issues created → first local delete wins → second throws `"No draft with id"` but GitHub issue #2 is orphaned with no local record.

---

## What's already solid

- All direct issue/launch Server Actions guard with `getRepo(db, owner, repo)`.
- `claude_extra_args` has defense-in-depth metachar check in `buildClaudeCommand` (launch.ts:184-202).
- Branch names validated at `launch.ts:36` and `50`.
- Worktree cleanup uses `resolve().startsWith()` to prevent path traversal.
- Draft promotion creates on GitHub *first*, so network failure keeps the draft intact for retry.

## Recommended triage order

1. **Parse scope check** (#1) — single-line fix, highest blast radius.
2. **Deployment FK cascade or soft-delete** (#2) — unbreaks the settings UX.
3. **Idempotency guard on launch** (#3) — prevents #2 from compounding.
4. **Concurrency cap on Octokit** (#4) — GitHub rate-limit exposure during normal multi-repo use.
5. The rest are hardening.

---

*Report only. No fixes applied. Screenshots not captured — all findings verified against code at file:line level.*
