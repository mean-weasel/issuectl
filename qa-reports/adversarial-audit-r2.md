# Adversarial Audit R2 -- issuectl Web Dashboard

**Date:** 2026-04-12  
**Target:** http://localhost:3847 (Next.js App Router, dev mode)  
**Scope:** XSS, SQL injection, path traversal, auth bypass, input abuse, state corruption, error disclosure, CSRF, race conditions  

## Severity Table

| # | Severity | Finding | File |
|---|----------|---------|------|
| 1 | **MEDIUM** | Server actions lack tracked-repo authorization check | `packages/web/lib/actions/issues.ts`, `comments.ts`, `launch.ts` |
| 2 | **MEDIUM** | `updateDraftAction` missing field validation | `packages/web/lib/actions/drafts.ts:79-90` |
| 3 | **MEDIUM** | `createDraftAction`/`assignDraftAction` re-throw raw errors | `packages/web/lib/actions/drafts.ts:66-68, 118-120` |
| 4 | **LOW** | No `Content-Security-Policy` header | `packages/web/next.config.ts` |
| 5 | **LOW** | DB allows empty draft titles (no CHECK constraint) | `packages/core/src/db/schema.ts` |
| 6 | **INFO** | Error pages leak file paths in dev mode HTML templates | Next.js dev behavior |
| 7 | **INFO** | Error messages from Octokit leaked through several actions | `launch.ts:85`, `pulls.ts:45`, `parse.ts:68,122` |

## Findings

### 1. MEDIUM -- Server actions skip tracked-repo authorization

**Impact:** Any server action caller (not just the UI) can create/update/close issues, add/remove labels, and post comments on ANY GitHub repo the `gh auth token` has access to -- not just repos tracked in the DB.

**Affected actions:** `createIssue`, `updateIssue`, `closeIssue`, `toggleLabel` (all in `issues.ts`), `addComment` (`comments.ts`), `launchIssue` (`launch.ts`).

**Contrast:** `mergePullAction` in `pulls.ts:23` correctly checks `getRepo(db, owner, repo)` and rejects untracked repos. The other mutation actions do not.

**Reproduction:**  
1. Call `createIssue({ owner: "any-org", repo: "any-repo-you-have-access-to", title: "injected" })` via the server action endpoint  
2. Issue is created on a repo that was never registered in issuectl  

**Fix:** Add `const tracked = getRepo(db, owner, repo); if (!tracked) return { success: false, error: "Repository is not tracked" };` to all mutation actions, matching the pattern in `mergePullAction`.

### 2. MEDIUM -- updateDraftAction passes unvalidated fields to core

**Impact:** An attacker bypassing the UI can set an empty title on a draft or inject invalid data. The client component (`DraftDetail.tsx:39`) prevents empty titles, but the server action (`drafts.ts:79-90`) only validates `draftId` -- it passes `update` (which contains `title`, `body`, `priority`) straight to `core/updateDraft` without validating any fields.

**Reproduction:**  
1. Direct DB test: `INSERT INTO drafts (id, title, ...) VALUES ('test', '', ...);` succeeds  
2. The empty-title draft renders on the dashboard with a blank title area  
3. The detail page shows an empty input field  

**Fix:** Add `validateTitle`, `validateBody`, and `validatePriority` calls inside `updateDraftAction` (same validators already exist in the file for `createDraftAction`). Also add a `CHECK(length(trim(title)) > 0)` constraint to the schema.

### 3. MEDIUM -- Raw error re-throw leaks internal details to client

**Impact:** `createDraftAction` and `assignDraftAction` catch errors, log them, then `throw err` -- sending the original `Error.message` to the client via the React Server Action error boundary. The `ErrorState` component renders `error.message` directly. This could expose SQLite error codes, DB paths, or Octokit API error details.

**Contrast:** Every other action file returns `{ success: false, error: "sanitized message" }`. The drafts actions are the only ones that throw.

**Fix:** Replace `throw err` with `throw new Error("Failed to create draft")` / `throw new Error("Failed to assign draft")` or switch to the `{ success: false, error }` return pattern used everywhere else.

### 4. LOW -- No Content-Security-Policy header

`next.config.ts` sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy` but omits `Content-Security-Policy`. While React's JSX escaping prevents XSS today, a CSP header (`default-src 'self'; script-src 'self'`) would provide defense-in-depth against future DOM manipulation or third-party script injection.

### 5. LOW -- DB schema allows empty draft titles

The `drafts` table has a `CHECK` constraint on `priority IN ('low', 'normal', 'high')` (confirmed: direct insert with `priority='CRITICAL'` fails with constraint error) but no constraint on `title`. A direct DB write or a crafted `updateDraftAction` call can store an empty title.

### 6. INFO -- Dev-mode error templates contain file paths

The `<template data-stck="...">` element in 404/error responses includes full stack traces with paths like `/Users/neonwatty/Desktop/issuectl/node_modules/...`. This is standard Next.js dev behavior and would not appear in production builds.

### 7. INFO -- Raw Octokit error messages exposed in some actions

`launch.ts:85`, `pulls.ts:45`, and `parse.ts:68,122` return `err.message` directly. Octokit errors can contain API URLs, rate limit details, or token scoping information. Less severe than finding #3 since these use the structured return pattern rather than `throw`.

## What Held Up

- **XSS:** React JSX escaping works correctly. Script tags in draft titles render as text, not HTML. No `dangerouslySetInnerHTML` or `innerHTML` anywhere in the codebase.
- **SQL injection:** All queries use parameterized `?` placeholders via `better-sqlite3`. No string interpolation in SQL.
- **Path traversal:** `cleanupWorktree` properly uses `resolve()` to validate paths stay within the worktree directory. Issue/PR page routes validate `number` as a positive integer.
- **CSRF:** Next.js 15 server actions check the `Origin` header (mismatched origin returns 500 vs 404 for correct origin).
- **Command injection:** `validateClaudeArgs` blocks shell operators, backticks, `$` expansion, control characters, and unmatched quotes. `buildClaudeCommand` adds a defense-in-depth `DANGEROUS_METACHARS` check at launch time.
- **Double-submit:** Draft creation sheet disables the save button during submission.
- **Repo registration:** `addRepo` validates owner/repo format with `/^[a-zA-Z0-9._-]+$/` and verifies the repo exists on GitHub before adding it.

## Screenshots

- `qa-reports/screenshots/adversarial-r2-empty-title-draft.png` -- Empty title draft rendered
- `qa-reports/screenshots/adversarial-r2-settings.png` -- Settings page with prior adversarial artifacts
- `qa-reports/screenshots/adversarial-r2-issue-detail.png` -- Issue detail page
- `qa-reports/screenshots/adversarial-r2-homepage-runtime-error.png` -- Homepage runtime error (stale dev server)
