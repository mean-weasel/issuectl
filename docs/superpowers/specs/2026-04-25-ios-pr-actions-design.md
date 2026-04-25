# iOS Phase 3: PR Actions

## Goal

Add merge, approve, request changes, and comment capabilities to the iOS app's PR detail view, completing the issue-to-merge workflow loop entirely from a phone.

## Scope

**In scope:**
- Merge with strategy picker (merge commit / squash / rebase) + confirmation dialog
- Approve (immediate, no confirmation)
- Request Changes (with required body text)
- Add top-level PR comments (compose-then-send)
- Display existing reviews in PR detail view

**Out of scope:**
- Line-level review comments (complex on mobile, low value/effort ratio)
- Editing or deleting existing reviews
- Draft PR promotion
- PR creation

## Architecture

Dedicated REST endpoints per action, following the Phase 1-2 pattern. The core layer gains GitHub API wrapper functions and types. The iOS app calls REST endpoints with Bearer auth.

Two codebases touched:
- `issuectl` (server) — new core functions, extended data layer, 3 new endpoints, 1 extended endpoint
- `issuectl-ios` (client) — new models, API client methods, UI components

## Server: Core Layer

### New types (`packages/core/src/github/types.ts`)

```typescript
type GitHubPullReview = {
  id: number;
  user: GitHubUser | null;
  state: "approved" | "changes_requested" | "commented" | "dismissed";
  body: string;
  submittedAt: string;
};
```

### New functions (`packages/core/src/github/pulls.ts`)

- `listReviews(octokit, owner, repo, number)` -> `GitHubPullReview[]`
  Wraps `octokit.rest.pulls.listReviews`. Maps response to `GitHubPullReview`.

- `createReview(octokit, owner, repo, number, event, body?)` -> `GitHubPullReview`
  Wraps `octokit.rest.pulls.createReview` with `event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"`.

- `mergePull(octokit, owner, repo, number, mergeMethod)` -> `{ sha: string; merged: boolean; message: string }`
  Wraps `octokit.rest.pulls.merge` with `merge_method: "merge" | "squash" | "rebase"`.

- `createPullComment(octokit, owner, repo, number, body)` -> `GitHubComment`
  Wraps `octokit.rest.issues.createComment` (same endpoint as issue comments).

All functions accept `octokit` as first parameter, matching established convention.

### Data layer (`packages/core/src/data/pulls.ts`)

Extend `getPullDetail()` to fetch reviews via `listReviews()` alongside checks and files. Returns `reviews: GitHubPullReview[]` in the response. Cache key unchanged: `pull-detail:owner/repo#number`.

### Exports (`packages/core/src/index.ts`)

Export new functions and `GitHubPullReview` type.

## Server: API Endpoints

### `POST /api/v1/pulls/[owner]/[repo]/[number]/merge`

**Body:**
```json
{ "mergeMethod": "merge" | "squash" | "rebase" }
```

**Validation:** `mergeMethod` must be one of the three allowed values.

**Logic:** `withAuthRetry(octokit => mergePull(octokit, ...))`. Clear cache keys `pull-detail:owner/repo#number` and `pulls-open:owner/repo`.

**Response:** `{ success: true, sha }` on success. `{ success: false, error }` on failure (merge conflict, checks failing, etc).

### `POST /api/v1/pulls/[owner]/[repo]/[number]/review`

**Body:**
```json
{ "event": "APPROVE" | "REQUEST_CHANGES", "body": "optional string" }
```

**Validation:** `event` must be `APPROVE` or `REQUEST_CHANGES`. `body` is required when `event` is `REQUEST_CHANGES`. Max body length: 65536 characters (matching existing `MAX_COMMENT_BODY` in `comments.ts`).

**Logic:** `withAuthRetry(octokit => createReview(octokit, ...))`. Clear `pull-detail:owner/repo#number` cache.

**Response:** `{ success: true, reviewId }` or `{ success: false, error }`.

### `POST /api/v1/pulls/[owner]/[repo]/[number]/comments`

**Body:**
```json
{ "body": "comment text" }
```

**Validation:** Non-empty body, max 65536 characters (same `MAX_COMMENT_BODY` limit).

**Logic:** `withAuthRetry(octokit => createPullComment(octokit, ...))`. Clear `pull-detail:owner/repo#number` cache.

**Response:** `{ success: true, commentId }` or `{ success: false, error }`.

### Extended `GET /api/v1/pulls/[owner]/[repo]/[number]`

No endpoint change. The data layer now returns `reviews: GitHubPullReview[]` in the response alongside existing `checks`, `files`, `linkedIssue`.

### Common patterns

All POST endpoints use: `requireAuth` -> input validation -> `getDb()`/`getRepo()` inside try-catch -> `withAuthRetry` -> cache invalidation -> structured pino logging (`import log from "@/lib/logger"`).

## iOS: Models

### New types (`PullRequest.swift`)

```swift
struct GitHubPullReview: Codable, Identifiable, Sendable {
    let id: Int
    let user: GitHubUser?
    let state: String  // approved, changes_requested, commented, dismissed
    let body: String
    let submittedAt: String
}
```

### Extended response

`PullDetailResponse` gains `reviews: [GitHubPullReview]` field.

### New request/response types

```swift
struct MergeRequestBody: Encodable, Sendable {
    let mergeMethod: String  // merge, squash, rebase
}

struct MergeResponse: Codable, Sendable {
    let success: Bool
    let sha: String?
    let error: String?
}

struct ReviewRequestBody: Encodable, Sendable {
    let event: String  // APPROVE, REQUEST_CHANGES
    let body: String?
}

struct ReviewResponse: Codable, Sendable {
    let success: Bool
    let reviewId: Int?
    let error: String?
}

struct CommentRequestBody: Encodable, Sendable {
    let body: String
}

struct CommentResponse: Codable, Sendable {
    let success: Bool
    let commentId: Int?
    let error: String?
}
```

## iOS: API Client

Three new methods in `APIClient.swift`:

- `mergePull(owner:repo:number:body:)` -> `MergeResponse`
- `reviewPull(owner:repo:number:body:)` -> `ReviewResponse`
- `commentOnPull(owner:repo:number:body:)` -> `CommentResponse`

All follow existing pattern: `makeRequest(method:path:body:)` with Bearer auth, JSON encode/decode.

## iOS: UI

### Reviews section in `PRDetailView`

New `reviewsSection()` between CI checks and changed files. Each review rendered as a compact row:
- SF Symbol person icon + username + state badge
- State badges: green checkmark (approved), red X (changes_requested), gray speech bubble (commented)
- Ordered by submission time, most recent first

### Action bottom bar

Displayed when PR is open and not merged. Four buttons in an `HStack`:
- **Approve** (green checkmark) — fires immediately, shows brief success indicator
- **Changes** (red X) — presents `RequestChangesSheet`
- **Comment** (speech bubble) — presents `CommentSheet`
- **Merge** (purple merge icon) — presents merge confirmation dialog

Hidden when PR is merged or closed.

### Merge confirmation

Uses `.confirmationDialog` with three destructive-role buttons:
- "Merge Commit"
- "Squash and Merge"
- "Rebase and Merge"

Each triggers the merge API call with the corresponding `mergeMethod`.

### Compose sheets

**`RequestChangesSheet`** — `TextEditor` for body + "Submit Review" button. Body required (button disabled when empty).

**`CommentSheet`** — `TextEditor` for body + "Add Comment" button. Body required.

Both dismiss on success and trigger a detail refresh.

### State management

- `@State` booleans per action for loading states (`isApproving`, `isMerging`, etc.)
- On success: dismiss sheet (if applicable), refresh detail view to reflect new state
- On error: inline error label matching `LaunchView` pattern
- On merge success: detail refreshes to show merged state, action bar disappears

### Xcode project

Register all new Swift files in `project.pbxproj` — new view files go into existing `PullRequests` group (no new groups needed since the sheets are small and PR-specific).

## Error Handling

- Merge conflicts: server returns descriptive error from GitHub API, iOS shows it inline
- Permission errors: "You don't have permission to merge this PR" — shown as error label
- Network errors: standard `error.localizedDescription` display
- Already merged: server returns error, detail refresh shows merged state

## Testing

- Server: typecheck (`pnpm turbo typecheck`) for all new endpoints and core functions
- iOS: Xcode build verification via XcodeBuildMCP
- Manual: test each action against a real PR on a test repo
