# Adversarial Audit Report

**App:** issuectl (cross-repo GitHub issue command center)
**Date:** 2026-04-19
**Scope:** Full audit (all applicable categories for a local developer tool)
**Base URL:** http://localhost:3847

## Executive Summary

**Total findings:** 19
| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 4 |
| Medium | 8 |
| Low | 5 |
| Info | 2 |

**Top 3 findings:**
1. [AC-4-001] Unguarded `endSession` deployment termination — Any local process can end any active deployment by guessing sequential integer IDs
2. [AC-4-002] Orphaned pending deployment blocks future launches — Launch step 9b failure leaves an invisible row that prevents re-launching the same issue
3. [AC-2-001] Uncapped PR fan-out exhausts GitHub rate limit — Dashboard with 20+ repos fires 20+ concurrent paginated API calls with no concurrency limit

**Interactive verification:** Not performed (static analysis only)

**Note on threat model:** issuectl is a localhost-only developer tool with no remote attack surface. The "adversary" in this context is: (1) accidental user behavior that corrupts state, (2) concurrent browser tabs racing on shared SQLite/GitHub state, and (3) resource accumulation patterns that degrade the tool over time. No remote exploitation vectors exist.

## Economic Surface Map

### Cost-Bearing Resources

| Resource | Trigger | Est. Unit Cost | Volume Limit | Enforcement |
|----------|---------|---------------|--------------|-------------|
| GitHub API (authenticated) | Dashboard load, issue detail, launch, refresh | Rate-limited: 5,000 req/hr | 5,000/hr by GitHub | None in app |
| GitHub API (paginated) | `listIssues`, `listPulls`, `getComments`, `listLabels`, `findLinkedPRs` | 1 req per 100 items | Per-page, no cap on pages | None |
| SQLite writes | Cache upserts, deployments, drafts, priority, nonces | Negligible per write | No limit | WAL mode |
| Subprocess spawns | `gh auth token/status`, `git` ops, `osascript`, `claude` CLI | Process overhead | No limit | Partial timeouts |
| Disk (context files) | Every `executeLaunch` | ~1-50 KB per file | No limit | Never cleaned up |
| Disk (clone directories) | "Fresh clone" workspace mode | Full repo size (depth=1) | No limit | Manual cleanup only |
| Disk (SQLite cache) | Background revalidation | Grows with issue/PR count | No TTL pruning | Manual `clearCache` only |

### Unmetered Resources
- GitHub API calls from `gatherPulls` (uncapped `Promise.all` over all repos)
- GitHub API calls from `listWorktrees` staleness checks (uncapped `Promise.all` over all worktrees)
- GitHub API calls from `parseNaturalLanguage` label fetches (uncapped `Promise.all` over all repos)
- Background lifecycle reconciliation (uncapped `Promise.all` over deployed issues)
- Context temp files (never cleaned up)
- Ended deployment rows (never pruned)

## Findings by Category

### 1. Quota & Limit Bypass

---

### [AC-1-001] Pull-to-refresh cache wipe amplifies GitHub API usage

**Severity:** Medium
**Category:** Quota & Limit Bypass
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User has 15 tracked repos, each with 200+ issues and 50+ PRs
2. User pulls to refresh on mobile (or triggers `refreshAction` from any client)
3. `refreshAction` calls `clearCache(db)` — deletes ALL cached data from SQLite
4. The subsequent page reload triggers `getUnifiedList` + `gatherPulls` for all 15 repos
5. Each repo fires paginated `listIssues` (3+ pages) + paginated `listPulls` (1+ page) = ~60+ API calls
6. Background revalidation also fires `reconcileIssueLifecycle` for deployed issues, adding more API calls
7. Rapid pull-to-refresh gestures multiply this (no debounce)

**Impact:** A user can exhaust their 5,000/hr GitHub API rate limit within minutes by repeatedly pulling to refresh with many tracked repos. Once rate-limited, ALL app functionality that depends on GitHub breaks until the window resets.

**Current Protection:** None. No debounce, no rate limiting, no partial cache invalidation.

**Code Location:**
- `packages/web/lib/actions/refresh.ts:11` — `clearCache(db)` deletes entire cache table
- `packages/web/components/PullToRefreshWrapper.tsx` — no debounce on gesture

**Recommended Fix:** Debounce `refreshAction` (e.g., 10-second cooldown). Consider partial invalidation (only clear cache for the visible repo/page) instead of full wipe.

---

### [AC-1-002] `batchCreateIssues` has no array size bound

**Severity:** Medium
**Category:** Quota & Limit Bypass
**Actor:** Power User
**Verification:** Not Tested

**Scenario:**
1. User (or a script) calls the `batchCreateIssues` Server Action with an array of 500 issues
2. The action filters to `accepted` items, then calls `Promise.all` over all of them
3. Each item triggers `createIssue` via `withIdempotency` → `octokit.rest.issues.create` (1 API call per issue)
4. 500 concurrent GitHub API calls fire simultaneously

**Impact:** Exhausts rate limit instantly. Additionally, partial failures leave some issues created and others not, with no transactional rollback.

**Current Protection:** Each item has its own try/catch and idempotency key, so retries are safe. But there's no upper bound on `issues.length`.

**Code Location:**
- `packages/web/lib/actions/parse.ts:95-103` — no bounds check on `issues` array
- `packages/web/lib/actions/parse.ts:108` — `Promise.all(accepted.map(...))`

**Recommended Fix:** Cap `accepted.length` (e.g., 25 issues max). Use `mapLimit` with concurrency cap instead of bare `Promise.all`.

---

### 2. Cost Amplification

---

### [AC-2-001] Dashboard PR fetch with no concurrency cap

**Severity:** High
**Category:** Cost Amplification
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User tracks 20+ repos (each with varying numbers of PRs)
2. Dashboard page loads, `DashboardContent.tsx` calls `gatherPulls`
3. `gatherPulls` uses bare `Promise.all(repos.map(...getPulls...))` with NO concurrency cap
4. 20+ concurrent paginated `listPulls` calls fire simultaneously
5. Meanwhile, `getUnifiedList` for issues is capped at `DEFAULT_REPO_FANOUT = 6` — the PR path has no such cap

**Impact:** Burst of 20+ concurrent API calls on every dashboard load. Combined with issue fetches (capped at 6), a single page load can consume 40+ API calls. Background revalidation doubles this on cache expiry.

**Current Protection:** Issue fetches use `mapLimit(repos, DEFAULT_REPO_FANOUT)` (6 concurrent). PR fetches have NO equivalent cap.

**Code Location:**
- `packages/web/app/DashboardContent.tsx:105` — bare `Promise.all(repos.map(...))`
- `packages/core/src/data/map-limit.ts:3` — `DEFAULT_REPO_FANOUT = 6` (not used for PRs)

**Recommended Fix:** Route PR fetches through `mapLimit` with `DEFAULT_REPO_FANOUT`, matching the issue fetch pattern.

---

### [AC-2-002] `findLinkedPRs` fetches ALL PRs to find linked ones

**Severity:** Medium
**Category:** Cost Amplification
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User views issue detail for an issue in a repo with 500+ PRs (historical)
2. `getIssueContent` calls `findLinkedPRs(octokit, owner, repo, issueNumber)`
3. `findLinkedPRs` calls `listPulls(octokit, owner, repo)` which paginates ALL PRs (`state: "all"`)
4. For 500 PRs, this is 5+ paginated API calls just to find linked PRs
5. This runs on EVERY issue detail cache miss and on every background revalidation

**Impact:** O(total PRs) API consumption per issue detail view. Repos with long PR histories create disproportionate API load.

**Current Protection:** Results are cached in SQLite, but only at the full-result level — the cache key includes the specific issue number, so linked-PR lookups aren't shared across issues.

**Code Location:**
- `packages/core/src/github/pulls.ts:115-123` — `findLinkedPRs` calls `listPulls` with all states
- `packages/core/src/data/issues.ts` — called from `getIssueContent`

**Recommended Fix:** Cache the full PR list per repo (not per issue) so linked-PR lookups share a single paginated fetch. Or use GitHub's timeline API to find linked PRs without listing all PRs.

---

### [AC-2-003] Worktree staleness check fires N uncapped API calls

**Severity:** Low
**Category:** Cost Amplification
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User navigates to worktree management with 30 worktrees
2. `listWorktrees` fires `Promise.all(worktrees.map(... issues.get ...))` — 30 concurrent API calls
3. Each checks if the associated issue is closed

**Impact:** Burst of N API calls proportional to worktree count, with no concurrency cap. Moderate impact since worktree counts are typically small.

**Current Protection:** None. Each call does use `withAuthRetry`.

**Code Location:**
- `packages/web/lib/actions/worktrees.ts:93` — bare `Promise.all` over worktrees

**Recommended Fix:** Use `mapLimit` with concurrency cap (e.g., 6).

---

### [AC-2-004] Background revalidation triggers duplicate reconciliations

**Severity:** Low
**Category:** Cost Amplification
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. Multiple Next.js Suspense boundaries or concurrent navigation renders the same page
2. Each finds a stale cache entry and fires a background `refreshAndReconcile()`
3. Multiple concurrent `reconcileIssueLifecycle` calls run for the same issue
4. Each calls `ensureLifecycleLabels` (up to 6 API calls) and label add/remove operations

**Impact:** Duplicate API calls that waste rate limit budget. Label operations are idempotent, so no data corruption, but the API cost is multiplied.

**Current Protection:** Label operations are idempotent. Cache writes use upsert.

**Code Location:**
- `packages/core/src/data/issues.ts` — fire-and-forget `refreshAndReconcile()`
- `packages/core/src/lifecycle/reconcile.ts:131` — uncapped `Promise.all` over deployed issues

**Recommended Fix:** Add a per-repo deduplication guard (e.g., in-memory `Set` of inflight repo keys) so only one reconciliation runs per repo at a time.

---

### 3. Account & Identity Abuse

No findings — not applicable for a local single-user developer tool.

---

### 4. State Corruption

---

### [AC-4-001] `endSession` can terminate any deployment without validation

**Severity:** High
**Category:** State Corruption
**Actor:** Power User / Bad Actor (local)
**Verification:** Not Tested

**Scenario:**
1. User has two browser tabs open to different issues, each with an active deployment
2. Tab A calls `endSession(1, ...)` — ends deployment ID 1 (correct)
3. Tab B calls `endSession(2, ...)` — ends deployment ID 2 (correct)
4. BUT: a script or DevTools call `endSession(2, "wrong", "repo", 999)` also works
5. The `owner`, `repo`, and `issueNumber` params are only used for cache revalidation paths — they're never checked against the deployment row
6. Deployment IDs are sequential integers starting from 1 — trivially guessable

**Impact:** Any process on localhost can terminate any active deployment session by calling the Server Action with a guessed ID. The `owner`/`repo`/`issueNumber` params are cosmetic — wrong values just skip revalidation for the correct page. Additionally, `endDeployment` doesn't check `ended_at IS NULL`, so already-ended deployments can be "re-ended" (harmlessly overwriting `ended_at`).

**Current Protection:** None. No ownership check, no state guard, no auth check.

**Code Location:**
- `packages/web/lib/actions/launch.ts:125-143` — no validation on any parameter
- `packages/core/src/db/deployments.ts:144-154` — `endDeployment` updates ANY row by ID, no state guard

**Recommended Fix:** Verify that the deployment ID matches the provided `owner/repo/issueNumber` before ending. Add `WHERE ended_at IS NULL` to the UPDATE to prevent double-ending.

---

### [AC-4-002] Launch activation failure orphans pending deployment, blocking re-launch

**Severity:** High
**Category:** State Corruption
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User launches an issue — launch flow reaches step 9 (terminal opens successfully)
2. Step 9b (`activateDeployment`) fails — e.g., the pending row was deleted by a concurrent `endSession`, or a transient DB error
3. The terminal IS running (Claude Code is active), but the deployment row is gone or stuck in `pending`
4. If the row persists as `pending`: the `idx_deployments_live` unique index blocks any future launch for that issue ("duplicate launch" error), but the pending row is invisible to the UI (UI only shows `active` deployments)
5. The user sees "a launch is already active" but has no way to end it through the UI (since `pending` rows aren't shown)

**Impact:** Issue becomes permanently un-launchable until the user manually fixes the SQLite database. The running Claude terminal has no corresponding deployment record visible in the app.

**Current Protection:** The catch block at line 237 handles *terminal* launch failures (rolls back the pending row). But activation failure *after* a successful terminal launch has no rollback path — the `launcher.launch()` call already returned successfully.

**Code Location:**
- `packages/core/src/launch/launch.ts:254` — step 9b `activateDeployment` after terminal open
- `packages/core/src/db/deployments.ts:156-172` — `activateDeployment` requires state=pending

**Recommended Fix:** Wrap steps 9 + 9b in a unified try/catch. If activation fails after terminal opens, either: (a) force-end the deployment row, or (b) activate it anyway with a warning. Also consider a startup cleanup that finds and resolves orphaned `pending` deployments.

---

### [AC-4-003] `reassignIssue` priority migration is non-transactional

**Severity:** Low
**Category:** State Corruption
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User reassigns an issue from repo A to repo B
2. `reassignIssue` calls `setPriority(db, newRepoId, ...)` then `deletePriority(db, oldRepoId, ...)`
3. If `deletePriority` fails (unlikely but possible DB error), priority exists on BOTH repos
4. The old issue is closed on GitHub but its local priority metadata persists

**Impact:** Minor data inconsistency — priority appears on both the old (closed) and new issue. Self-correcting if the old issue is never viewed again (closed issues filtered out).

**Current Protection:** `setPriority` uses UPSERT. The state is recoverable by manually deleting the old metadata.

**Code Location:**
- `packages/core/src/github/issues.ts:230-232` — non-transactional priority migration

**Recommended Fix:** Wrap both operations in a single SQLite transaction.

---

### [AC-4-004] Concurrent tab launches race on deployment insert

**Severity:** Info
**Category:** State Corruption
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User opens two tabs and clicks "Launch" on the same issue simultaneously
2. Both pass the `hasLiveDeploymentForIssue` pre-check (TOCTOU)
3. Both attempt `recordDeployment` — the loser hits `SQLITE_CONSTRAINT_UNIQUE` on `idx_deployments_live`
4. The loser sees "A launch session is already active for this issue"

**Impact:** None — the race is correctly handled by the unique index constraint. The pre-check is an optimization, not a lock, and this is documented in code comments.

**Current Protection:** `idx_deployments_live` partial unique index provides atomic enforcement. Error is mapped to a user-friendly message.

**Code Location:**
- `packages/core/src/launch/launch.ts:189-214` — documented TOCTOU with index-based guard

**Recommended Fix:** None needed — this is a textbook correct TOCTOU mitigation.

---

### 5. Subscription & Billing Gaps

No findings — not applicable for a local tool with no billing.

---

### 6. Resource Exhaustion

---

### [AC-6-001] Context temp files accumulate in /tmp

**Severity:** Medium
**Category:** Resource Exhaustion
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User launches issues repeatedly over days/weeks
2. Each launch writes `issuectl-launch-{number}-{timestamp}.md` to `os.tmpdir()`
3. These files are never cleaned up by the app
4. Over time, hundreds of context files accumulate

**Impact:** Disk space leak in the system temp directory. Each file is small (1-50 KB) but accumulates indefinitely. The files may contain issue content (titles, bodies, comments) that persists on disk after the user expects the session to be over.

**Current Protection:** The OS may eventually clean `/tmp` on reboot (macOS does not aggressively clean `/tmp`). The parse prompt file (`issuectl-parse-prompt-*`) IS correctly cleaned up in a `finally` block — inconsistent treatment.

**Code Location:**
- `packages/core/src/launch/context.ts:57` — `writeContextFile` writes but never schedules cleanup
- `packages/core/src/parse/claude-cli.ts:60` — parse prompt file IS cleaned up (contrasting pattern)

**Recommended Fix:** Clean up context files when `endSession` is called, or add a `finally` cleanup to `executeLaunch`.

---

### [AC-6-002] SQLite cache table grows unboundedly

**Severity:** Medium
**Category:** Resource Exhaustion
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User tracks 10 repos over months, viewing many issues and PRs
2. Each issue detail view creates cache entries for header, content, comments, linked PRs
3. Cache entries for closed/resolved issues are never pruned
4. Cache rows store full JSON-serialized API responses — issues with many comments can be multi-megabyte per row
5. Over months, the cache table grows to tens or hundreds of megabytes

**Impact:** Database file growth slows all SQLite operations. No automatic cleanup mechanism exists — only manual `refreshAction` (which is a full wipe, not selective pruning).

**Current Protection:** `refreshAction` wipes the entire cache (nuclear option). No TTL-based background pruning.

**Code Location:**
- `packages/core/src/db/cache.ts` — `setCached` uses upsert but no pruning
- `packages/core/src/db/schema.ts:35-40` — cache table has no TTL column or cleanup trigger

**Recommended Fix:** Add TTL-based pruning — either a scheduled cleanup that deletes rows older than `cache_ttl * N`, or a LRU eviction policy with a max row count.

---

### [AC-6-003] Deployment history never pruned

**Severity:** Low
**Category:** Resource Exhaustion
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User launches and ends sessions hundreds of times over months
2. Each ended session leaves a row in `deployments` with `ended_at` set
3. These rows are never deleted
4. Queries like `getDeploymentsForIssue` must scan past all historical rows

**Impact:** Slow table growth. Impact is minimal since deployment rows are small and the table has indexes, but it's unbounded.

**Current Protection:** None.

**Code Location:**
- `packages/core/src/db/deployments.ts:144` — `endDeployment` sets `ended_at` but never deletes

**Recommended Fix:** Add periodic pruning of deployments older than N days (e.g., 90 days).

---

### [AC-6-004] Subprocesses with no timeout can block Server Actions indefinitely

**Severity:** Medium
**Category:** Resource Exhaustion
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User's git repository is on a network mount (NFS, SMB) that becomes unresponsive
2. Launch flow calls `git status --porcelain` or `git rev-parse` with NO timeout
3. The subprocess hangs indefinitely, blocking the Server Action
4. Next.js worker thread is occupied — concurrent requests queue behind it
5. Similarly: `osascript` for iTerm2/Terminal.app has no timeout — a hung AppleScript blocks forever

**Impact:** A single hung subprocess can block all Server Actions in the Node.js process. Since SQLite is single-writer in WAL mode, a blocked write path can cascade to other DB-writing actions.

**Current Protection:** Some git operations have timeouts (e.g., `git fetch origin` at 30s, `git clone` at 120s). Others have none (`git status`, `git checkout`, `git rev-parse`, `osascript`, `gh auth token`, `gh auth status`).

**Code Location:**
- `packages/core/src/launch/branch.ts:29,52,55,62,72` — git operations with no timeout
- `packages/core/src/launch/terminals/iterm2.ts:62` — `osascript` with no timeout
- `packages/core/src/launch/terminals/macos-terminal.ts:7` — `osascript` with no timeout
- `packages/core/src/github/auth.ts:9,36` — `gh auth token/status` with no timeout

**Recommended Fix:** Add timeouts to all subprocess calls (e.g., 10s for git status, 15s for osascript, 10s for gh auth).

---

### 7. Unprotected Edge Cases

---

### [AC-7-001] `updateRepo` accepts arbitrary `localPath` without validation

**Severity:** High
**Category:** Unprotected Edge Cases
**Actor:** Power User
**Verification:** Not Tested

**Scenario:**
1. User (or a script calling the Server Action) sets `localPath` to `../../some-other-project`
2. The path is written to SQLite without any validation (only `id > 0` is checked)
3. The launch flow reads this path as the `cwd` for `git fetch origin`, `git checkout`, `git status`
4. Git commands execute against a completely different repository
5. In "existing" workspace mode: the launch flow creates a branch and modifies the wrong repository's state

**Impact:** Git operations (fetch, checkout, branch creation) run against an unintended directory. Could corrupt another project's git state by creating unexpected branches or checking out unexpected refs.

**Current Protection:** `addRepo` validates `localPath` exists via `stat`, but `updateRepo` performs no validation at all.

**Code Location:**
- `packages/web/lib/actions/repos.ts:180-197` — `updateRepo` writes `localPath` to DB without validation
- `packages/core/src/launch/workspace.ts` — uses `localPath` as cwd for git subprocess calls

**Recommended Fix:** Validate `localPath` in `updateRepo`: check it exists, is a directory, and contains a `.git` directory (is a valid git repo). Consider restricting to absolute paths.

---

### [AC-7-002] `setPriorityAction` has no try/catch

**Severity:** Medium
**Category:** Unprotected Edge Cases
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User sets priority on an issue
2. `setPriority(db, ...)` throws a DB error (e.g., DB locked, disk full)
3. The exception propagates unhandled to Next.js
4. User sees a generic 500 error instead of a structured `{ success: false }` response
5. The UI may not handle this gracefully (expecting the structured response shape)

**Impact:** Poor error handling UX. The action is inconsistent with every other Server Action in the app, all of which wrap their DB calls in try/catch and return `{ success: false, error: "..." }`.

**Current Protection:** None.

**Code Location:**
- `packages/web/lib/actions/priority.ts:27-28` — `setPriority(db, ...)` called outside try/catch

**Recommended Fix:** Wrap in try/catch matching the pattern used by all other actions.

---

### [AC-7-003] `getComments` and `parseNaturalLanguage` skip `withAuthRetry`

**Severity:** Medium
**Category:** Unprotected Edge Cases
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User's `gh` token rotates (e.g., via `gh auth refresh` in another terminal)
2. The Octokit singleton still holds the old token
3. User views an issue detail page — `getComments` calls `getOctokit()` directly (not `withAuthRetry`)
4. GitHub returns 401
5. Instead of auto-retrying with a fresh token (which `withAuthRetry` would do), the error propagates
6. User sees a comment loading failure. Same applies to `parseNaturalLanguage`

**Impact:** Token rotation breaks comment loading and NL parsing until the Octokit singleton is reset by a different action that DOES use `withAuthRetry`, or until process restart.

**Current Protection:** Other actions (`createIssue`, `addComment`, etc.) use `withAuthRetry` and would reset the singleton on 401. But if the user hits `getComments` first, it fails without recovery.

**Code Location:**
- `packages/web/lib/actions/comments.ts` — uses `getOctokit()` not `withAuthRetry`
- `packages/web/lib/actions/parse.ts:48` — uses `getOctokit()` not `withAuthRetry`

**Recommended Fix:** Replace `getOctokit()` with `withAuthRetry(octokit => ...)` in both actions.

---

### [AC-7-004] Layout auth gate is display-only — does not block Server Actions

**Severity:** Low
**Category:** Unprotected Edge Cases
**Actor:** Power User
**Verification:** Not Tested

**Scenario:**
1. User's `gh auth` expires or is revoked
2. Layout renders `<AuthErrorScreen>` — user sees "not authenticated"
3. But Server Actions are still callable via direct POST to `/_next/...` endpoints
4. DB-only actions succeed without any auth: `setPriorityAction`, `createDraftAction`, `updateDraftAction`, `deleteDraftAction`, `refreshAction`, `removeRepo`, `updateRepo`, `updateSetting`, `endSession`

**Impact:** Low for a localhost tool — there's no remote attacker. But a confused user running automation scripts could modify local DB state even when the auth gate appears to block the UI.

**Current Protection:** GitHub-calling actions fail naturally because Octokit calls return 401. DB-only actions have no protection.

**Code Location:**
- `packages/web/app/layout.tsx:65-81` — `getAuthStatus()` renders `<AuthErrorScreen>` but doesn't block POST requests

**Recommended Fix:** For a localhost tool, this is acceptable. If the threat model evolves (e.g., networked access), add auth middleware to Server Actions.

---

### [AC-7-005] Service Worker cache serves stale data independently of SQLite cache

**Severity:** Info
**Category:** Unprotected Edge Cases
**Actor:** Confused User
**Verification:** Not Tested

**Scenario:**
1. Service Worker caches network responses in the browser's Cache API
2. User triggers `refreshAction` which clears the SQLite cache
3. Next page load may be served from the SW cache, bypassing the freshly-cleared SQLite cache
4. User sees stale data despite explicitly refreshing

**Impact:** Confusing UX — refresh doesn't always show fresh data due to dual-layer caching. Minimal data integrity risk since both caches converge eventually.

**Current Protection:** SW uses Serwist's `defaultCache` strategy. RSC revalidation partially bypasses the SW.

**Code Location:**
- `packages/web/app/sw.ts` — Service Worker registration

**Recommended Fix:** Consider sending a cache-bust signal to the SW on `refreshAction`, or using a network-first strategy for Server Component data routes.

---

## Recommendations Summary

### Immediate (High severity)
1. **[AC-4-001]** Add ownership verification to `endSession` — check deployment ID matches owner/repo/issueNumber, add `WHERE ended_at IS NULL`
2. **[AC-4-002]** Add recovery path for orphaned pending deployments — startup cleanup + handle activation failure after terminal open
3. **[AC-2-001]** Cap `gatherPulls` concurrency with `mapLimit(repos, DEFAULT_REPO_FANOUT)` matching the issue fetch pattern
4. **[AC-7-001]** Validate `localPath` in `updateRepo` — existence check, is-directory, contains `.git`

### Short-term (Medium severity)
5. **[AC-1-001]** Debounce `refreshAction` (10s cooldown)
6. **[AC-1-002]** Cap `batchCreateIssues` array size (max 25) + use concurrency-limited fetch
7. **[AC-2-002]** Cache full PR list per repo to avoid re-fetching ALL PRs per issue detail
8. **[AC-6-001]** Clean up context temp files on `endSession`
9. **[AC-6-002]** Add TTL-based cache pruning (background or opportunistic)
10. **[AC-6-004]** Add timeouts to all subprocess calls lacking them
11. **[AC-7-002]** Add try/catch to `setPriorityAction`
12. **[AC-7-003]** Switch `getComments`/`parseNaturalLanguage` to use `withAuthRetry`

### Defense-in-Depth (Low + Info)
13. **[AC-2-003]** Cap worktree staleness API calls with `mapLimit`
14. **[AC-2-004]** Deduplicate concurrent background reconciliations per repo
15. **[AC-4-003]** Wrap `reassignIssue` priority migration in a transaction
16. **[AC-6-003]** Add periodic pruning for ended deployments
17. **[AC-7-004]** Document localhost-only threat model; consider auth middleware if network access added
18. **[AC-7-005]** Consider network-first SW strategy for data routes

### Positive Findings (What's Working Well)
- **Idempotency system** (`withIdempotency` + `action_nonces`) is well-designed with atomic claims, TTL pruning, and duplicate-inflight detection
- **Shell injection defense** (`validateClaudeArgs` + `buildClaudeCommand` metachar check) provides defense-in-depth
- **Path traversal guard** in `cleanupWorktree` correctly resolves and bounds paths
- **Concurrent launch guard** via `idx_deployments_live` partial unique index is textbook correct TOCTOU mitigation
- **WAL mode** for SQLite is the right choice for concurrent read/write workloads
- **`withAuthRetry`** provides automatic token rotation recovery (where it's used)
- **Input validation** on issue/draft/comment creation is thorough with consistent length bounds
