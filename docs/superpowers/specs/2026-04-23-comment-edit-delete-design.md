# Comment Edit & Delete — Design Spec

Add the ability to edit and delete your own issue comments in the issuectl dashboard, synced with GitHub.

## Problem

The dashboard supports creating comments but not editing or deleting them. Users must switch to GitHub.com to correct typos, update information, or remove accidental comments. This breaks the workflow of staying in the issuectl command center.

## Scope

- Edit and delete **own comments only** (matched by `comment.user.login === currentUser`)
- Inline edit UX (no modals)
- Lightweight delete confirmation (button flips to "confirm?" for 3 seconds)
- Optimistic UI with rollback on error
- Synced with GitHub via the existing Octokit client

## Design

### Core layer: GitHub functions

**File:** `packages/core/src/github/issues.ts`

Two new functions alongside the existing `addComment`:

```ts
export async function updateComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number,
  body: string,
): Promise<GitHubComment> {
  const { data } = await octokit.rest.issues.updateComment({
    owner,
    repo,
    comment_id: commentId,
    body,
  });
  return mapComment(data);
}

export async function deleteComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number,
): Promise<void> {
  await octokit.rest.issues.deleteComment({
    owner,
    repo,
    comment_id: commentId,
  });
}
```

Both use the existing `mapComment` helper and Octokit instance pattern. No new types needed.

### Core layer: data functions

**File:** `packages/core/src/data/comments.ts`

Two new functions wrapping the GitHub functions with the same 4-key cache invalidation pattern used by `addComment`:

```ts
export async function editComment(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  commentId: number,
  body: string,
): Promise<GitHubComment>

export async function removeComment(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  commentId: number,
): Promise<void>
```

Both clear the same 4 cache keys after the mutation:
- `comments:${owner}/${repo}#${issueNumber}`
- `issue-content:${owner}/${repo}#${issueNumber}`
- `issue-detail:${owner}/${repo}#${issueNumber}`
- `pull-detail:${owner}/${repo}#${issueNumber}`

`issueNumber` is needed for cache key construction even though the GitHub API only requires `commentId`.

### Core layer: current user

**File:** `packages/core/src/data/user.ts` (new)

```ts
export async function getCurrentUserLogin(
  db: Database.Database,
  octokit: Octokit,
): Promise<string>
```

Calls `octokit.rest.users.getAuthenticated()` with SWR caching (cache key: `current-user`, long TTL since it doesn't change). Returns the `login` string. This is needed to determine which comments belong to the current user.

### Core layer: exports

**File:** `packages/core/src/index.ts`

Re-export `editComment`, `removeComment` from `./data/comments.js` and `getCurrentUserLogin` from `./data/user.js`.

### Server actions

**File:** `packages/web/lib/actions/comments.ts`

Two new actions following the exact patterns of `addComment`:

```ts
export async function editComment(
  owner: string,
  repo: string,
  issueNumber: number,
  commentId: number,
  body: string,
): Promise<{ success: boolean; error?: string }>

export async function deleteComment(
  owner: string,
  repo: string,
  issueNumber: number,
  commentId: number,
): Promise<{ success: boolean; error?: string }>
```

**Validation:**
- `editComment`: reject empty body, enforce 65,536 char max, regex-validate owner/repo
- `deleteComment`: regex-validate owner/repo, validate commentId is a positive integer

**Patterns:**
- `withAuthRetry` for automatic token refresh on 401
- No idempotency needed (edits are naturally idempotent; double-delete returns 404 handled gracefully)
- `revalidateSafely()` on detail + home pages after mutation
- Return `{ success, error }` shape

### UI: CommentItem component

**File:** `packages/web/components/detail/CommentItem.tsx` (new, client component)

Extracted from the current inline rendering in `CommentList.tsx`. Each comment renders with:

**Normal mode:**
- Avatar, username, relative timestamp (existing layout)
- Markdown body via `<LightboxBodyText>` (existing)
- Edit and delete icon buttons — visible only when `comment.user?.login === currentUser`
- Buttons appear on hover (desktop) or always visible (mobile)

**Edit mode** (activated by clicking edit button):
- Textarea replaces the markdown body, pre-filled with `comment.body` (raw markdown)
- Save and Cancel buttons below the textarea
- Save: calls `editComment` action, optimistically updates body, rolls back + shows toast on error
- Cancel: reverts to normal mode, discards changes
- Cmd+Enter to save (same shortcut as CommentComposer)

**Delete flow:**
- Click delete button → button text changes to "confirm?" with a red style
- After 3 seconds, reverts back to normal delete button if not clicked
- Click "confirm?" → optimistically hides the comment, calls `deleteComment` action
- On error: re-shows the comment with a toast

### UI: CommentList changes

**File:** `packages/web/components/detail/CommentList.tsx`

Refactored to render `<CommentItem>` for each comment instead of inline markup. Receives `currentUser` prop and passes it to each item. Stays a presentational component (not a client component itself — the client boundary is at `CommentItem`).

### UI: CommentSection changes

**File:** `packages/web/components/detail/CommentSection.tsx`

Receives new `currentUser` prop and passes it through to `CommentList`. Existing optimistic comment logic for `addComment` is unchanged.

### UI: Detail page changes

**File:** `packages/web/app/issues/[owner]/[repo]/[number]/page.tsx`

Calls `getCurrentUserLogin()` alongside existing data fetches. Passes `currentUser` to `<CommentSection>`.

### Styling

**File:** `packages/web/components/detail/CommentItem.module.css` (new)

Edit/delete buttons styled as small icon buttons matching the Paper design system. Edit mode textarea matches `CommentComposer` styling. Delete confirm state uses `--paper-red` or similar danger color. Buttons positioned at top-right of comment, with `opacity: 0` on desktop (visible on hover via `.comment:hover`), always visible on mobile.

### Testing

**Unit tests (Vitest):**
- `packages/core/src/github/issues.test.ts` — tests for `updateComment` and `deleteComment` (mock Octokit)
- `packages/core/src/data/comments.test.ts` — tests for `editComment` and `removeComment` (cache invalidation)
- `packages/web/lib/actions/comments.test.ts` — tests for new server actions (validation, error handling)

**No E2E tests** for this feature — the edit/delete UI interactions are difficult to test meaningfully in Playwright without a real GitHub backend. The unit tests at each layer provide sufficient coverage.

## Files changed

| File | Change |
|---|---|
| `packages/core/src/github/issues.ts` | Add `updateComment`, `deleteComment` |
| `packages/core/src/data/comments.ts` | Add `editComment`, `removeComment` |
| `packages/core/src/data/user.ts` | New — `getCurrentUserLogin` |
| `packages/core/src/index.ts` | Re-export new functions |
| `packages/web/lib/actions/comments.ts` | Add `editComment`, `deleteComment` actions |
| `packages/web/components/detail/CommentItem.tsx` | New — client component for single comment with edit/delete |
| `packages/web/components/detail/CommentItem.module.css` | New — styles for comment actions and edit mode |
| `packages/web/components/detail/CommentList.tsx` | Refactor to use `<CommentItem>`, accept `currentUser` |
| `packages/web/components/detail/CommentSection.tsx` | Accept and pass `currentUser` prop |
| `packages/web/app/issues/[owner]/[repo]/[number]/page.tsx` | Fetch and pass `currentUser` |

## What doesn't change

- `GitHubComment` type — already has `id` and `user.login`
- `CommentComposer` — create flow unchanged
- `useImageUpload` hook — unchanged
- Upload server action — unchanged
- SWR caching infrastructure — reused as-is
- `withAuthRetry`, `withIdempotency` — reused as-is

## Trade-offs

**Inline edit vs. modal:** Inline edit is lighter and matches GitHub's UX, but means the comment component has more state. Accepted — the state is simple (normal / editing / deleting).

**No permission check beyond login comparison:** We don't call GitHub's API to check if the user truly has permission to edit/delete. We compare logins client-side and let GitHub enforce permissions on the API call. If someone spoofs the UI to show edit buttons, the API call will return 403. This is simpler and correct.

**3-second confirm vs. modal confirm for delete:** The timed confirm is lighter than a modal but could be missed if the user clicks quickly without reading. Accepted — deleting a comment is low-stakes (the content is still in GitHub's audit log and the user can re-post).

## Out of scope

- Editing/deleting other users' comments (collaborator permissions)
- Edit history display
- Undo after delete
- Batch operations on comments
- Comment reactions (emoji)
