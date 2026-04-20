# Resilience Audit Report

**App:** issuectl (Next.js App Router dashboard)
**Date:** 2026-04-19
**Scope:** Full audit (all 8 categories)
**Base URL:** http://localhost:3847
**Auditor:** Claude Code resilience-audit skill

## Executive Summary

**Total findings:** 19

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 4 |
| Medium | 8 |
| Low | 4 |
| Info | 2 |

**Top 3 findings:**
1. [RF-3-001] No beforeunload warning on draft editor — user loses work on tab close/navigation
2. [RF-5-002] Launch preamble has zero validation — arbitrary text passed to subprocess
3. [RF-2-001] Multi-repo create loop is non-atomic — partial failure creates orphaned GitHub issues

**Interactive verification:** Completed
- Verified: 2
- Handled gracefully: 7
- Not reproducible: 0
- Not tested: 10

## Flow-State Map Summary

### Multi-Step Flows Audited

| Flow | Steps | State Dependencies | Entry Points | Issues Found |
|------|-------|-------------------|--------------|-------------|
| New Issue Creation | 3 | Repos, labels, auth | `/new` | 0 |
| Quick Create (Parse) | 3 | Claude CLI, repos | `/parse` | 0 |
| Draft Create (inline) | 2-3 | Repos, default repo | FAB on `/` | 1 (RF-2-001) |
| Draft → Issue Assignment | 2 | Draft, repos, auth | `/drafts/[id]` action sheet | 0 |
| Launch with Claude | 4 | Issue, comments, repo path, auth | Issue detail action sheet | 2 (RF-3-002, RF-5-002) |
| Close Issue | 2 | Active deployment, auth | Issue detail action sheet | 0 |
| Re-assign Issue | 3 | Repos, auth | Issue detail action sheet | 0 |
| Delete Draft | 2 | Draft | Draft detail action sheet | 0 |

### State Inventory

| State | Location | Lifecycle | Sync Method | Issues Found |
|-------|----------|-----------|-------------|-------------|
| Draft content | SQLite `drafts` table | Until deleted | Autosave on blur | 2 (RF-3-001, RF-2-002) |
| Issue/PR cache | SQLite `cache` table | 300s TTL | Pull-to-refresh, mutation invalidation | 1 (RF-6-002) |
| Offline queue | IndexedDB `issuectl-offline` | Until synced/discarded | Replay on reconnect | 2 (RF-4-001, RF-8-001) |
| Online/offline | `navigator.onLine` | Browser uptime | `useSyncExternalStore` | 1 (RF-2-003) |
| Auth token | Module singleton | Process lifetime | `withAuthRetry` on 401 | 1 (RF-4-002) |
| Launch modal config | React local state | Modal mount | None | 1 (RF-3-002) |
| Comment composer | React local state | Component mount | None | 1 (RF-3-003) |
| URL filter state | Search params | Navigation | Link hrefs | 1 (RF-1-002) |

## Findings by Category

---

### 1. Navigation & Flow Dead Ends

#### [RF-1-001] Back button after issue close shows stale cached data

**Severity:** Medium
**Category:** Navigation & Flow Dead Ends
**User Type:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User views issue detail at `/issues/owner/repo/42`
2. User closes the issue via action sheet
3. App navigates to `/?section=shipped`
4. User hits browser Back button
5. Browser restores the cached issue detail page showing the issue as open
6. User sees stale data — issue appears open when it's actually closed

**Expected Behavior:**
After navigating back, the page should show updated state (issue marked closed), or trigger a re-fetch to reflect the current state.

**Actual Behavior:**
Next.js client-side router cache may serve the stale pre-close version. The issue appears open until the user manually refreshes or the cache TTL (300s) expires.

**Impact:**
User confusion — they just closed the issue but it appears open. May attempt to close it again, producing an error.

**Code Location:**
- `packages/web/components/detail/IssueActionSheet.tsx:145` — navigates to `/?section=shipped` after close
- `packages/web/app/issues/[owner]/[repo]/[number]/page.tsx` — server component that reads cached data

**Recommended Fix:**
Call `router.refresh()` before navigating, or use `router.replace()` instead of `router.push()` for destructive actions so the stale page doesn't remain in history. Alternatively, add `revalidatePath` for the specific issue route in the `closeIssue` action.

---

#### [RF-1-002] Stale repo key in URL filter shows empty list with no explanation

**Severity:** Low
**Category:** Navigation & Flow Dead Ends
**User Type:** Confused User
**Verification:** Handled Gracefully

**Scenario:**
1. User bookmarks `/?repo=owner/old-repo` while `old-repo` is tracked
2. User later removes `old-repo` from tracked repos in settings
3. User opens the bookmark
4. Dashboard shows empty list — no issues displayed, no error message

**Expected Behavior:**
Show a message: "Repository 'owner/old-repo' is no longer tracked. [Clear filter] or [Add it back in Settings]."

**Actual Behavior:**
`resolveActiveRepo()` returns `null` when the repo isn't found, effectively clearing the filter. The page renders all repos' issues. The URL retains the stale `?repo=` param but the app ignores it.

**Impact:**
Minimal — the app degrades gracefully by showing all issues. The user may be briefly confused about why their filter didn't apply.

**Code Location:**
- `packages/web/lib/page-filters.ts` — `resolveActiveRepo()` silently returns `null` for unknown repos

**Recommended Fix:**
No action needed — current behavior is acceptable. Optionally, add a subtle toast: "Filter cleared — 'old-repo' is no longer tracked."

---

### 2. Race Conditions & Double Actions

#### [RF-2-001] Multi-repo create loop is non-atomic — partial failure creates orphaned GitHub issues

**Severity:** High
**Category:** Race Conditions & Double Actions
**User Type:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User opens CreateDraftSheet, types a title, selects 3 repos
2. Clicks "create 3 issues"
3. The loop creates draft+issue for repo 1 (success), repo 2 (success), repo 3 (GitHub API error — rate limit, network issue)
4. User sees error: "Failed on repo 3 of 3: ..."
5. Two GitHub issues already exist on repos 1 and 2 with no way to undo them
6. User retries — creates duplicates on repos 1 and 2 (new idempotency keys generated per retry)

**Expected Behavior:**
Either: (a) all-or-nothing transaction (create all or none), or (b) show partial success with links to the created issues so the user can manage them.

**Actual Behavior:**
Loop stops on first error. Previously created issues are orphaned. Retry creates duplicates because each attempt generates fresh idempotency keys.

**Impact:**
Duplicate GitHub issues across repos. User must manually find and close orphaned issues.

**Code Location:**
- `packages/web/components/list/CreateDraftSheet.tsx:148-175` — sequential loop with early return on error
- `packages/web/components/list/CreateDraftSheet.tsx:159` — `newIdempotencyKey()` called fresh per iteration

**Recommended Fix:**
1. Pre-generate all idempotency keys before the loop starts (one per repo) and reuse them on retry
2. On partial failure, show which repos succeeded with links: "Created 2/3 issues. Repo 3 failed: [error]. [Retry repo 3 only]"
3. Store the multi-create state so retries only attempt the remaining repos

---

#### [RF-2-002] Cross-tab draft edit + delete race — autosave targets deleted draft

**Severity:** Medium
**Category:** Race Conditions & Double Actions
**User Type:** Power User
**Verification:** Not Tested

**Scenario:**
1. User opens draft editor in Tab A: `/drafts/abc-123`
2. User opens dashboard in Tab B, deletes draft `abc-123`
3. User returns to Tab A, edits title, clicks away (triggering blur autosave)
4. `updateDraftAction` called for deleted draft — returns error: "Draft no longer exists"
5. User sees error but has already lost the content they typed

**Expected Behavior:**
Offer to recover: "This draft was deleted. [Save as new draft] [Discard changes]"

**Actual Behavior:**
Error message displayed. User's edits are in local React state but there's no recovery path — can't save as a new draft, can only manually copy the text.

**Impact:**
Lost work in a cross-tab scenario. User must re-create the draft manually.

**Code Location:**
- `packages/web/components/detail/DraftDetail.tsx` — blur handler calls `updateDraftAction`
- `packages/web/lib/actions/drafts.ts:139-145` — returns error when draft doesn't exist

**Recommended Fix:**
When `updateDraftAction` returns "Draft no longer exists", offer a "Save as new draft" button that calls `createDraftAction` with the current title/body from local state.

---

#### [RF-2-003] Rapid online/offline toggles can trigger concurrent sync replays

**Severity:** Low
**Category:** Race Conditions & Double Actions
**User Type:** Chaotic Scenario
**Verification:** Not Tested

**Scenario:**
1. User is in an area with flaky connectivity (elevator, train)
2. Browser fires `online` event, `useSyncOnReconnect` starts replay
3. Connection drops immediately — `offline` event fires
4. Connection restores — another `online` event fires before first replay completes
5. `syncingRef.current` gate prevents concurrent replay (good), but the timing window exists

**Expected Behavior:**
Only one replay should execute at a time, and the gate should be bulletproof.

**Actual Behavior:**
The `syncingRef` gate works correctly — `if (syncingRef.current) return;` prevents concurrent replays. This is properly implemented.

**Impact:**
Minimal — the gate works. The theoretical risk is if `syncingRef` is reset prematurely in the `finally` block while the network is still unstable, but this is low-probability.

**Code Location:**
- `packages/web/hooks/useSyncOnReconnect.ts:55` — `syncingRef` gate
- `packages/web/hooks/useSyncOnReconnect.ts:99` — `finally` block resets gate

**Recommended Fix:**
No immediate action needed. The existing gate is sound. For extra safety, add a cooldown period (e.g., 2 seconds) after replay completes before allowing another, using a timestamp check.

---

### 3. Interrupted Operations

#### [RF-3-001] No beforeunload warning — draft edits lost on tab close/navigation

**Severity:** Critical
**Category:** Interrupted Operations
**User Type:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User opens draft editor at `/drafts/abc-123`
2. User edits the title and body extensively (5+ minutes of work)
3. User has NOT clicked away from the textarea (blur hasn't fired → no autosave)
4. User accidentally closes the tab, navigates away via a link, or refreshes the page
5. All unsaved edits are lost with no warning

**Expected Behavior:**
Browser should show a "You have unsaved changes. Leave anyway?" confirmation dialog via `beforeunload`. Alternatively, implement periodic autosave (every 30s while dirty).

**Actual Behavior:**
No `beforeunload` handler exists anywhere in the web package. No periodic autosave timer. Edits only persist on blur. Tab close = instant data loss.

**Impact:**
Data loss. User loses potentially minutes of writing with no recovery path.

**Code Location:**
- `packages/web/components/detail/DraftDetail.tsx` — autosave only on blur, no `beforeunload`
- Confirmed via grep: no `beforeunload` handler in the entire web package

**Recommended Fix:**
1. Add a `beforeunload` handler when draft content differs from the last saved version:
   ```tsx
   useEffect(() => {
     const handler = (e: BeforeUnloadEvent) => {
       if (isDirty) { e.preventDefault(); }
     };
     window.addEventListener("beforeunload", handler);
     return () => window.removeEventListener("beforeunload", handler);
   }, [isDirty]);
   ```
2. Add a periodic autosave (every 30s while dirty) in addition to blur-based saves
3. Consider using `next/router` events to warn on in-app navigation

---

#### [RF-3-002] Launch modal config not persisted — closing modal loses all settings

**Severity:** Medium
**Category:** Interrupted Operations
**User Type:** Power User
**Verification:** Not Tested

**Scenario:**
1. User opens Launch modal on an issue
2. Configures branch name, workspace mode, selects specific comments, writes a preamble
3. Accidentally clicks the overlay backdrop or presses Escape
4. Modal closes — all configuration is lost
5. User must re-open modal and reconfigure everything from scratch

**Expected Behavior:**
Either: (a) confirm before closing if config has been modified, or (b) persist launch config in sessionStorage so it survives modal close/reopen.

**Actual Behavior:**
All state is React local state (`useState`). Modal unmount destroys it. No confirmation dialog on close. No persistence.

**Impact:**
Lost effort reconfiguring launch settings, especially frustrating when the user carefully selected specific comments and wrote a detailed preamble.

**Code Location:**
- `packages/web/components/launch/LaunchModal.tsx:56-66` — all state initialized fresh on mount
- `packages/web/components/launch/LaunchModal.tsx:131` — overlay click calls `onClose` without confirmation

**Recommended Fix:**
1. Add a "close confirmation" when any field has been modified: "Discard launch configuration?"
2. Optionally persist config to sessionStorage keyed by `${owner}/${repo}#${issueNumber}` so it survives modal close

---

#### [RF-3-003] Comment composer text lost on page refresh

**Severity:** Medium
**Category:** Interrupted Operations
**User Type:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User writes a long comment in the composer textarea
2. User accidentally refreshes the page (Cmd+R, pull-to-refresh, or link click)
3. Page reloads — comment textarea is empty
4. User's draft comment is gone

**Expected Behavior:**
Persist comment draft to sessionStorage or localStorage, keyed by `${owner}/${repo}#${issueNumber}`. Restore on component mount.

**Actual Behavior:**
Comment text lives in `useState` only. Page refresh destroys it.

**Impact:**
Lost work — user must re-type the comment. Especially painful for long, detailed comments.

**Code Location:**
- `packages/web/components/detail/CommentComposer.tsx:25` — `useState("")` for body

**Recommended Fix:**
Add localStorage-based draft persistence:
```tsx
const storageKey = `comment-draft:${owner}/${repo}#${issueNumber}`;
const [body, setBody] = useState(() => localStorage.getItem(storageKey) ?? "");
useEffect(() => {
  if (body) localStorage.setItem(storageKey, body);
  else localStorage.removeItem(storageKey);
}, [body, storageKey]);
```
Clear the key on successful comment submission.

---

### 4. Cross-Device & Cross-Session

#### [RF-4-001] Multiple browser tabs have separate offline queues with no cross-tab coordination

**Severity:** Low
**Category:** Cross-Device & Cross-Session
**User Type:** Power User
**Verification:** Not Tested

**Scenario:**
1. User has Tab A and Tab B both open on the dashboard
2. User goes offline
3. In Tab A: assigns a draft to a repo (queued)
4. In Tab B: adds a comment to an issue (queued)
5. User goes back online
6. Both tabs fire `online` event → both attempt to replay their own queues
7. Since IDB is shared, Tab A replays Tab B's operation too (or vice versa), potentially causing double execution

**Expected Behavior:**
Only one tab should replay the queue, or operations should be claimed atomically to prevent double execution.

**Actual Behavior:**
The `syncingRef` gate is local to each tab's React instance. Both tabs will see `syncingRef.current === false` and start replaying. However, idempotency keys protect against duplicate execution for most operations.

**Impact:**
Low — idempotency keys prevent actual duplication. The risk is wasted API calls and potentially confusing toast notifications in multiple tabs.

**Code Location:**
- `packages/web/hooks/useSyncOnReconnect.ts:55` — `syncingRef` is per-component, not cross-tab
- `packages/web/lib/offline-queue.ts` — IDB is shared across tabs

**Recommended Fix:**
Use the `BroadcastChannel` API to coordinate: one tab claims "sync leader" role, others defer. Or use IDB transactions to atomically claim operations (set status to "syncing" within a transaction, skip if already "syncing").

---

#### [RF-4-002] Auth token not refreshed proactively — mid-session expiry shows cryptic errors

**Severity:** Medium
**Category:** Cross-Device & Cross-Session
**User Type:** Power User
**Verification:** Not Tested

**Scenario:**
1. User starts using the app — `gh auth token` returns a valid token
2. Token is stored in module singleton (`getOctokit()` cache)
3. User's GitHub token is rotated/revoked (e.g., `gh auth logout` in another terminal)
4. User performs an action (close issue, add comment)
5. Octokit call fails with 401
6. `withAuthRetry` resets singleton, re-reads token, retries once
7. If `gh auth token` also fails, user sees generic "Failed to close issue" error
8. No indication that the root cause is an expired token

**Expected Behavior:**
Show a specific error: "GitHub authentication expired. Run `gh auth login` to re-authenticate." Or better: detect the 401 pattern and show a dedicated auth-expired banner.

**Actual Behavior:**
Generic error message from `formatErrorForUser(err)`. User has no idea the problem is auth-related.

**Impact:**
User confusion — they may retry the action repeatedly, not realizing they need to re-authenticate.

**Code Location:**
- `packages/core/src/github/client.ts` — `withAuthRetry` wrapper
- `packages/core/src/github/client.ts` — `formatErrorForUser` doesn't distinguish auth errors

**Recommended Fix:**
1. In `formatErrorForUser`, detect 401/403 status and return: "GitHub token expired or revoked. Run `gh auth login` to re-authenticate."
2. Optionally add a periodic auth health check (every 5 minutes) that shows a persistent banner when auth is failing

---

### 5. Input & Data Edge Cases

#### [RF-5-001] Comment composer textarea missing maxLength attribute

**Severity:** High
**Category:** Input & Data Edge Cases
**User Type:** Power User
**Verification:** **Verified**

**Scenario:**
1. User opens an issue detail page
2. In the comment composer, pastes a very long text (e.g., a log dump, 100KB+)
3. No client-side feedback — text is accepted without limit
4. User clicks "comment"
5. Server action enforces 65536 character limit → returns error
6. User sees error after waiting for the network round-trip

**Expected Behavior:**
Textarea should have `maxLength={65536}` and/or a character counter showing remaining characters. Prevent submission of over-limit text.

**Actual Behavior:**
No `maxLength` attribute. No character counter. Server silently rejects over-limit text after submission.

**Impact:**
Poor UX — user types or pastes a long comment, waits for submission, then gets rejected. Must manually truncate.

**Code Location:**
- `packages/web/components/detail/CommentComposer.tsx:98-107` — textarea has no `maxLength`
- `packages/web/lib/actions/comments.ts` — server enforces 65536 limit

**Recommended Fix:**
Add `maxLength={65536}` to the textarea element. Optionally add a character counter near the submit button.

---

#### [RF-5-002] Launch preamble has zero validation — arbitrary text passed to subprocess

**Severity:** High
**Category:** Input & Data Edge Cases
**User Type:** Power User / Chaotic Scenario
**Verification:** Not Tested

**Scenario:**
1. User opens Launch modal
2. In the preamble field, enters extremely long text (100KB+) or content designed to manipulate Claude's behavior
3. Clicks "Launch"
4. Server action passes preamble directly to `executeLaunch()` with no validation
5. Preamble is included verbatim in the Claude Code launch context

**Expected Behavior:**
Preamble should have a length limit (e.g., 10,000 characters) and optionally basic content validation.

**Actual Behavior:**
No validation whatsoever — no length limit on client or server. Text passed verbatim to subprocess.

**Impact:**
Potential for extremely large payloads slowing down launch. The preamble is passed to Claude Code as context, so while Claude has its own safeguards, there's no size bound.

**Code Location:**
- `packages/web/components/launch/PreambleInput.tsx` — textarea with no validation
- `packages/web/lib/actions/launch.ts:103` — `preamble: formData.preamble || undefined` (no validation)
- `packages/core/src/launch/launch.ts` — preamble passed to subprocess

**Recommended Fix:**
1. Add `maxLength={10000}` to the PreambleInput textarea
2. Add server-side validation in `launchIssue()`: reject if preamble exceeds 10,000 characters
3. Consider adding a character counter in the UI

---

#### [RF-5-003] Branch name input lacks client-side regex validation

**Severity:** Medium
**Category:** Input & Data Edge Cases
**User Type:** Confused User
**Verification:** **Verified**

**Scenario:**
1. User opens Launch modal
2. Clears the auto-generated branch name and types `@my-branch!`
3. No validation feedback — input accepts the text
4. User clicks "Launch"
5. Server rejects with "Branch name contains invalid characters"
6. User must guess which characters are invalid

**Expected Behavior:**
Client-side validation matching the server regex (`/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/`). Show inline error as user types.

**Actual Behavior:**
Client only checks for empty string. Server enforces the regex. User gets a poor feedback loop.

**Impact:**
Frustrating UX — round-trip to server just to discover invalid characters. Especially confusing because the error doesn't specify which characters are invalid.

**Code Location:**
- `packages/web/components/launch/BranchInput.tsx` — no `pattern` attribute, no onChange validation
- `packages/web/lib/actions/launch.ts:51` — `VALID_BRANCH_RE` enforced server-side only

**Recommended Fix:**
Add inline validation to `BranchInput` that matches the server regex. Show an error message below the input when the regex fails: "Branch names must start with a letter or number, and can only contain letters, numbers, dots, underscores, hyphens, and slashes."

---

#### [RF-5-004] Selected file paths in launch have no server-side validation

**Severity:** Medium
**Category:** Input & Data Edge Cases
**User Type:** Power User
**Verification:** Not Tested

**Scenario:**
1. User opens Launch modal
2. File paths are populated from `referencedFiles` prop (extracted from issue body)
3. A malicious or corrupted issue body contains crafted file paths (e.g., `../../etc/passwd`)
4. User launches — paths passed directly to `executeLaunch()` without validation

**Expected Behavior:**
Server should validate that file paths are relative, don't contain path traversal sequences, and exist within the repository.

**Actual Behavior:**
`launchIssue()` in `launch.ts` validates most fields but passes `selectedFilePaths` through without any checks.

**Impact:**
Low in practice (paths are used as Claude context, not directly accessed), but violates defense-in-depth principles.

**Code Location:**
- `packages/web/lib/actions/launch.ts:71-73` — validates comments but not files
- `packages/core/src/launch/launch.ts` — receives paths without validation

**Recommended Fix:**
Add basic path validation in `launchIssue()`: reject paths containing `..`, absolute paths, or null bytes. Validate paths are relative to the repo root.

---

### 6. State & Timing

#### [RF-6-001] Stale tab submission — user acts on outdated cached data

**Severity:** Medium
**Category:** State & Timing
**User Type:** Power User
**Verification:** Not Tested

**Scenario:**
1. User opens issue detail for issue #42 at 10:00 AM
2. A collaborator closes issue #42 on GitHub at 10:30 AM
3. User returns to the stale tab at 11:00 AM (cache TTL long expired)
4. User clicks "Close issue" — issue is already closed
5. Server action may succeed (GitHub close is idempotent) or fail with a confusing error

**Expected Behavior:**
When user returns to a stale tab after extended absence, the page should re-fetch on focus or show a "data may be stale" indicator.

**Actual Behavior:**
Page renders from the initial server response. No visibility handler to detect tab focus after long absence. No staleness indicator per-page (only global CacheAge in the dashboard header).

**Impact:**
User confusion — acting on outdated data. Usually not harmful (most GitHub actions are idempotent), but can lead to confusing error messages.

**Code Location:**
- `packages/web/app/issues/[owner]/[repo]/[number]/page.tsx` — server component renders once, no client-side freshness check
- No `visibilitychange` handler in the app

**Recommended Fix:**
Add a `visibilitychange` listener that triggers `router.refresh()` if the tab has been hidden for more than the cache TTL (300s). Or show a "page may be stale" banner with a refresh button.

---

#### [RF-6-002] Cache inconsistency window — external changes invisible for up to 300s

**Severity:** Low
**Category:** State & Timing
**User Type:** Power User
**Verification:** Not Tested

**Scenario:**
1. User A closes an issue on GitHub directly (not through issuectl)
2. User B is viewing the issuectl dashboard
3. The SQLite cache still has the old issue state
4. User B sees the issue as "open" for up to 300 seconds until the cache expires

**Expected Behavior:**
Acceptable for a local-only tool with explicit cache TTL. Users understand data has a freshness window.

**Actual Behavior:**
Cache TTL of 300s means up to 5 minutes of stale data. Pull-to-refresh and manual refresh are available.

**Impact:**
Minor — this is expected behavior for a cached dashboard. The CacheAge indicator shows when data was last fetched.

**Code Location:**
- `packages/core/src/db/cache.ts` — 300s default TTL
- `packages/web/components/ui/CacheAge.tsx` — shows cache age

**Recommended Fix:**
No action needed for v1. The CacheAge indicator and pull-to-refresh provide adequate user control. For future: consider WebSocket or polling for real-time updates.

---

### 7. Error Recovery & Empty States

#### [RF-7-001] DashboardContent error fallback has no retry button

**Severity:** Medium
**Category:** Error Recovery & Empty States
**User Type:** Confused User
**Verification:** Not Tested

**Scenario:**
1. Dashboard loads but `DashboardContent` throws (GitHub API timeout, SQLite locked, auth failure)
2. Try/catch renders inline error: "failed to load dashboard" with the error message
3. User sees the error but has no way to retry without a full page refresh
4. No retry button, no "try again" link, no auto-retry

**Expected Behavior:**
Error fallback should include a "Try Again" button that re-fetches data, and/or auto-retry after a delay.

**Actual Behavior:**
Static error message with no interactive recovery path. User must manually refresh the entire page.

**Impact:**
User frustration — transient errors (network blip, API timeout) require a full page refresh to recover from.

**Code Location:**
- `packages/web/app/DashboardContent.tsx:84-97` — catch block renders static div with error message

**Recommended Fix:**
Convert the error fallback to a client component with a retry button:
```tsx
<ErrorFallback message={message} onRetry={() => router.refresh()} />
```
Or use Next.js `error.tsx` boundary (which already exists at the root) to provide a `reset()` callback.

---

#### [RF-7-002] No distinction between network errors and auth errors in user-facing messages

**Severity:** Info
**Category:** Error Recovery & Empty States
**User Type:** Confused User
**Verification:** Not Tested

**Scenario:**
1. User performs an action (comment, close, launch)
2. Action fails — could be network error, auth error, GitHub rate limit, or validation error
3. Error message is often generic: "Failed to post comment", "Unable to reach the server"
4. User can't tell if they need to: check their internet, re-authenticate, wait for rate limits, or fix their input

**Expected Behavior:**
Error messages should be specific to the failure type:
- Network: "Connection lost. Check your internet and try again."
- Auth: "GitHub token expired. Run `gh auth login` to re-authenticate."
- Rate limit: "GitHub API rate limit reached. Try again in X minutes."
- Validation: "[specific field] is invalid: [reason]."

**Actual Behavior:**
Most errors pass through `formatErrorForUser()` which provides some specificity, but many catch blocks use generic messages.

**Impact:**
User confusion — can't self-diagnose the problem.

**Code Location:**
- `packages/core/src/github/client.ts` — `formatErrorForUser()` function
- Various catch blocks in components and server actions

**Recommended Fix:**
Enhance `formatErrorForUser()` to classify errors by type (network, auth, rate limit, validation, server) and return actionable messages for each.

---

### 8. Unintended Usage Patterns

#### [RF-8-001] IndexedDB offline queue can be manipulated via DevTools to inject operations

**Severity:** Info
**Category:** Unintended Usage Patterns
**User Type:** Power User
**Verification:** Not Tested

**Scenario:**
1. User opens DevTools → Application → IndexedDB → `issuectl-offline` → `queued-ops`
2. User manually inserts a QueuedOperation record with crafted `action` and `params`
3. When the app goes online, `useSyncOnReconnect` replays the injected operation
4. Operation executes against the server action (e.g., `addComment` with arbitrary body)

**Expected Behavior:**
Server actions should validate all inputs regardless of source. Injected operations should fail validation.

**Actual Behavior:**
Server actions DO validate inputs (type checks, auth checks, etc.), so injected operations would fail if malformed. However, well-formed injected operations would execute normally — which is equivalent to calling the server action directly.

**Impact:**
Minimal — server-side validation prevents malformed operations. This is equivalent to calling the Next.js server action endpoint directly, which is already possible. No privilege escalation.

**Code Location:**
- `packages/web/lib/offline-queue.ts` — IDB is user-writable
- `packages/web/hooks/useSyncOnReconnect.ts:13-40` — `executeOperation` dispatches by action type

**Recommended Fix:**
No action needed. Server-side validation is the correct defense. IDB manipulation is no more dangerous than calling the API directly. This is an inherent property of client-side storage.

---

## Recommendations Summary

### Immediate (Critical + High)
1. **RF-3-001** — Add `beforeunload` handler and periodic autosave to draft editor
2. **RF-5-001** — Add `maxLength={65536}` to comment composer textarea
3. **RF-5-002** — Add length limit (10,000 chars) and basic validation to launch preamble
4. **RF-2-001** — Pre-generate idempotency keys for multi-repo create loop; show partial success on failure

### Short-term (Medium)
5. **RF-5-003** — Add client-side branch name regex validation matching server rules
6. **RF-5-004** — Add file path validation in `launchIssue()` (reject path traversal)
7. **RF-3-002** — Add close confirmation to Launch modal when config has been modified
8. **RF-3-003** — Persist comment drafts to localStorage
9. **RF-7-001** — Add retry button to DashboardContent error fallback
10. **RF-4-002** — Distinguish auth errors in `formatErrorForUser()` with actionable messages
11. **RF-2-002** — Offer "Save as new draft" when autosave targets a deleted draft
12. **RF-6-001** — Add `visibilitychange` handler for stale-tab detection
13. **RF-1-001** — Use `router.replace()` for destructive actions to prevent stale back-nav

### UX Improvements (Low + Info)
14. **RF-2-003** — Add cooldown period after sync replay (defense-in-depth)
15. **RF-4-001** — Use BroadcastChannel for cross-tab sync coordination
16. **RF-6-002** — No action needed (acceptable for v1; CacheAge indicator exists)
17. **RF-1-002** — No action needed (graceful degradation already works)
18. **RF-7-002** — Enhance error classification in `formatErrorForUser()`
19. **RF-8-001** — No action needed (server validation is the correct defense)

## Positive Findings

The issuectl app demonstrates **strong resilience engineering** in several areas:

1. **Double-click prevention**: All mutation buttons correctly use `isPending` (via `useTransition`) or manual `saving` state to disable on first click. Verified: `setSaving(true)` fires synchronously before the first `await`, making the window for double-submission effectively zero.

2. **Offline queue with tiered actions**: The 3-tier system (T1: local-only always works, T2: queueable with replay, T3: blocked offline) is well-designed. Actions that can't be safely queued are explicitly disabled with "Requires connection" hints.

3. **Idempotency + singleflight deduplication**: Draft assignment uses two-layer idempotency — an outer layer for same-tab retries (user nonce) and an inner singleflight layer for cross-tab races (draft ID as key). This is sophisticated and correct.

4. **Graceful 404 handling**: All dynamic routes validate parameters before DB/API access. UUID format validation on draft IDs prevents injection. Non-existent resources show helpful 404 pages with navigation back to the dashboard.

5. **Smart back-button handling**: `DetailTopBar` checks `document.referrer` to distinguish same-origin navigation (uses `router.back()` preserving filters) from external entry (uses fallback `href`).

6. **Offline indicator UX**: The OfflineIndicator correctly shows/hides based on `navigator.onLine`, renders `null` when not needed (no empty DOM), and provides queue management (dropdown, failure modal with retry/discard).

7. **Cache staleness messaging**: Most server actions return a `cacheStale?: true` flag when revalidation fails, and components surface this as "reload if the list looks stale" — honest about data freshness.

8. **Error boundary coverage**: Root `error.tsx` and `not-found.tsx` exist. `DashboardContent` has its own try/catch with inline error display. Suspense boundary provides a loading skeleton.

---

## Verification Evidence

Screenshots saved to: `reports/screenshots/`

| Test | File | Result |
|------|------|--------|
| Double-click prevention | `01-double-click-test.png` | Handled Gracefully |
| Comment maxLength | `02-comment-long-text.png` | Verified (no limit) |
| Back navigation | `03-back-navigation-dashboard.png` | Handled Gracefully |
| Branch validation | `04-branch-validation-*.png` | Verified (no client check) |
| Invalid repo filter | `05-invalid-repo-filter.png` | Handled Gracefully |
| Non-existent draft | `06-nonexistent-draft.png` | Handled Gracefully |
| Invalid draft format | `06b-invalid-draft-format.png` | Handled Gracefully |
| Error boundary | `07-error-boundary.png` | Handled Gracefully |
| Offline indicator | `08-offline-indicator.png` | Handled Gracefully |
