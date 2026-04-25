# iOS Phase 4: Issue Actions

## Goal

Add close/reopen and comment capabilities to the iOS app's issue detail view, completing the core issue triage workflow from a phone.

## Scope

**In scope:**
- Close with optional comment + confirmation dialog
- Reopen with confirmation dialog
- Add top-level issue comments (compose-then-send)
- Single `POST .../state` endpoint handles both close and reopen

**Out of scope:**
- Label toggling (needs picker UI, low mobile value — candidate for Phase 5)
- Issue creation (complex form, better on desktop)
- Issue editing (title/body — rare action on mobile)
- Comment editing/deletion (mirroring web capability — future work)
- Cross-repo reassignment

## Architecture

Dedicated REST endpoints per action, following the Phase 3 pattern. The core layer gains one new function (`reopenIssue`). The iOS app calls REST endpoints with Bearer auth.

Two codebases touched:
- `issuectl` (server) — 1 new core function, 2 new endpoints
- `issuectl-ios` (client) — new models, API client methods, UI components

## Server: Core Layer

### New function (`packages/core/src/github/issues.ts`)

- `reopenIssue(octokit, owner, repo, number)` -> `GitHubIssue`
  Wraps `octokit.rest.issues.update({ owner, repo, issue_number: number, state: "open" })`. Maps response to `GitHubIssue`.

The existing `closeIssue(octokit, owner, repo, number)` already handles the close case.

### Exports (`packages/core/src/index.ts`)

Export `reopenIssue` alongside the existing `closeIssue`.

## Server: API Endpoints

### `POST /api/v1/issues/[owner]/[repo]/[number]/state`

**Body:**
```json
{ "state": "open" | "closed", "comment": "optional string" }
```

**Validation:**
- `state` must be `"open"` or `"closed"`
- `comment`, if provided, must be a non-empty string, max 65536 characters (`MAX_COMMENT_BODY` from `@/lib/constants`)

**Logic:**
1. If `comment` is provided and non-empty, post it first via `addComment` from the data layer (`@issuectl/core`)
2. Then update issue state via `closeIssue` (for `"closed"`) or `reopenIssue` (for `"open"`)
3. Clear cache keys: `issue-detail:{owner}/{repo}#{number}` and `issues:{owner}/{repo}`

**Response:** `{ success: true }` on success. `{ success: false, error: string }` on failure.

### `POST /api/v1/issues/[owner]/[repo]/[number]/comments`

**Body:**
```json
{ "body": "comment text" }
```

**Validation:** Non-empty body, max 65536 characters (`MAX_COMMENT_BODY`).

**Logic:** `withAuthRetry(octokit => addComment(db, octokit, owner, repo, number, body))`. Clear `issue-detail:{owner}/{repo}#{number}` cache.

**Response:** `{ success: true, commentId: number }` or `{ success: false, error: string }`.

### Common patterns

Both POST endpoints use: `requireAuth` -> input validation -> `getDb()`/`getRepo()` inside try-catch -> `withAuthRetry` -> cache invalidation -> structured pino logging (`import log from "@/lib/logger"`).

## iOS: Models

### New types (`Issue.swift`)

```swift
struct IssueStateRequestBody: Encodable, Sendable {
    let state: String  // "open" or "closed"
    let comment: String?
}

struct IssueStateResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}

struct IssueCommentRequestBody: Encodable, Sendable {
    let body: String
}

struct IssueCommentResponse: Codable, Sendable {
    let success: Bool
    let commentId: Int?
    let error: String?
}
```

## iOS: API Client

Two new methods in `APIClient.swift`:

- `updateIssueState(owner:repo:number:body:)` -> `IssueStateResponse`
- `commentOnIssue(owner:repo:number:body:)` -> `IssueCommentResponse`

Both follow existing pattern: `makeRequest(method:path:body:)` with Bearer auth, JSON encode/decode.

## iOS: UI

### Action bar in `IssueDetailView`

Displayed below the ScrollView. Content depends on issue state:

**When open:** Two buttons in an HStack:
- **Comment** (speech bubble icon) — presents `IssueCommentSheet`
- **Close** (red X icon) — presents `.confirmationDialog` with two options:
  - "Close" — calls `updateIssueState` with `state: "closed"`, no comment
  - "Close with comment..." — presents `CloseIssueSheet`

**When closed:** Single button:
- **Reopen** (green arrow icon) — presents `.confirmationDialog`, then calls `updateIssueState` with `state: "open"`

Action bar disappears or updates after state change (detail refreshes).

### `IssueCommentSheet`

Identical pattern to the PR `CommentSheet`: NavigationStack + Form, TextEditor for body, body required (button disabled when empty), "Add Comment" submit button. Calls `api.commentOnIssue`. Dismisses on success and triggers detail refresh.

### `CloseIssueSheet`

NavigationStack + Form, TextEditor for optional closing comment, "Close Issue" submit button (always enabled — comment is optional). Calls `api.updateIssueState` with `state: "closed"` and the comment if provided. Dismisses on success and triggers detail refresh.

### State management

- `@State` booleans: `isClosing`, `isReopening`, `showCommentSheet`, `showCloseSheet`, `showCloseConfirm`, `showReopenConfirm`, `actionError`
- On success: dismiss sheet (if applicable), refresh detail view
- On error: inline error label matching Phase 3 pattern
- On close/reopen success: detail refreshes to show new state, action bar updates

### Xcode project

Register new Swift files (`IssueCommentSheet.swift`, `CloseIssueSheet.swift`) in `project.pbxproj` — new view files go into existing Issues group.

## Error Handling

- Permission errors: "You don't have permission" — shown as error label
- Already closed/open: server returns error, detail refresh shows correct state
- Network errors: standard `error.localizedDescription` display
- Comment post failure during close: comment error surfaced, issue state not changed (comment posts first)
- State change failure after comment: comment is already posted (visible on GitHub), error returned to client. The user sees the comment appeared but the issue didn't close — they can retry the close action.

## Testing

- Server: typecheck (`pnpm turbo typecheck`) for all new endpoints and core function
- iOS: Xcode build verification via XcodeBuildMCP
- Manual: test each action against a real issue on a test repo
