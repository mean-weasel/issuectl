# iOS Phase 5: List UX

## Goal

Bring the issuectl iOS app's list views to parity with the web dashboard — section tabs, repo filtering, sorting, quick create, swipe actions, and repo color coding.

## Scope

**In scope:**
- Section tabs with counts (Drafts/Open/Running/Closed for issues; Open/Closed for PRs)
- Repo filter chips (horizontal scroll, color-coded, multi-select)
- Sort control (updated/created/priority)
- Author filter for PRs ("Mine" toggle)
- Quick create sheet (draft or immediate GitHub issue)
- Swipe actions (close/reopen, launch/merge)
- Repo color coding on list rows
- Running session indicator on issue rows
- Draft REST endpoints on the server (GET/POST/DELETE/assign)

**Out of scope:**
- Full issue creation form (title + body + labels + assignee)
- Draft editing (update title/body after creation)
- URL import
- Offline/draft sync between web and iOS
- PR creation

## Architecture

Client-side filtering and sorting — all data is fetched via existing endpoints, then filtered/sorted in SwiftUI `@State`. No new server endpoints for filtering. Four new REST endpoints for draft CRUD, calling existing core functions.

Two codebases touched:
- `issuectl` (server) — 4 new draft REST endpoints
- `issuectl-ios` (client) — new models, API methods, shared components, modified list views

## Server: Draft REST Endpoints

### `GET /api/v1/drafts`

**Response:** `{ drafts: Draft[] }`

Each draft: `{ id: string, title: string, body?: string, priority?: "low"|"normal"|"high", createdAt: string }`

**Logic:** `listDrafts(db)` from `@issuectl/core`.

### `POST /api/v1/drafts`

**Body:**
```json
{ "title": "string (required)", "body": "string (optional)", "priority": "low|normal|high (optional)" }
```

**Validation:**
- `title` required, non-empty, max 256 characters
- `body` optional, max 65536 characters
- `priority` optional, must be one of `low`, `normal`, `high`

**Logic:** `createDraft(db, { title, body, priority })`.

**Response:** `{ success: true, id: string }` or `{ success: false, error: string }`.

### `DELETE /api/v1/drafts/[id]`

**Validation:** `id` must be a non-empty string.

**Logic:** `deleteDraft(db, id)`.

**Response:** `{ success: true }` or `{ success: false, error: string }`.

### `POST /api/v1/drafts/[id]/assign`

**Body:**
```json
{ "repoId": 123 }
```

**Validation:** `id` non-empty string, `repoId` positive integer.

**Logic:** `withAuthRetry(octokit => assignDraftToRepo(db, octokit, id, repoId))`. Clears `issues:{owner}/{repo}` cache key after success.

**Response:** `{ success: true, issueNumber: number, issueUrl: string }` or `{ success: false, error: string }`.

Partial commit case: if the GitHub issue was created but local draft cleanup failed, returns `{ success: true, issueNumber, issueUrl, cleanupWarning: string }`.

### Common patterns

All endpoints use: `requireAuth` → input validation → `getDb()` inside try-catch → core function call → structured pino logging (`import log from "@/lib/logger"`).

## iOS: Models

### New types (`Issue.swift`)

```swift
struct Draft: Codable, Identifiable, Sendable {
    let id: String
    let title: String
    let body: String?
    let priority: String?
    let createdAt: String
}

struct DraftsResponse: Codable, Sendable {
    let drafts: [Draft]
}

struct CreateDraftRequestBody: Encodable, Sendable {
    let title: String
    let body: String?
    let priority: String?
}

struct CreateDraftResponse: Codable, Sendable {
    let success: Bool
    let id: String?
    let error: String?
}

struct AssignDraftRequestBody: Encodable, Sendable {
    let repoId: Int
}

struct AssignDraftResponse: Codable, Sendable {
    let success: Bool
    let issueNumber: Int?
    let issueUrl: String?
    let cleanupWarning: String?
    let error: String?
}
```

### New type (`SuccessResponse.swift` or shared)

```swift
struct SuccessResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}
```

### Shared type

`SuccessResponse` is reused across multiple endpoints (delete draft, and potentially future simple responses):

```swift
struct SuccessResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}
```

## iOS: API Client

Four new methods in `APIClient.swift`:

- `listDrafts()` → `DraftsResponse`
- `createDraft(body:)` → `CreateDraftResponse`
- `deleteDraft(id:)` → `SuccessResponse`
- `assignDraft(id:body:)` → `AssignDraftResponse`

All follow existing pattern: `makeRequest(method:path:body:)` with Bearer auth, JSON encode/decode.

## iOS: Repo Color Palette

New file `Constants.swift`:

```swift
enum RepoColors {
    static let palette: [Color] = [
        Color(hex: "f85149"),
        Color(hex: "58a6ff"),
        Color(hex: "3fb950"),
        Color(hex: "bc8cff"),
        Color(hex: "d29922"),
        Color(hex: "39d0d6"),
        Color(hex: "e87125"),
    ]

    static func color(for index: Int) -> Color {
        palette[index % palette.count]
    }
}
```

Same 7-color palette as the web (`REPO_COLORS` in `packages/web/lib/constants.ts`), same index-based assignment so colors match across platforms.

## iOS: Shared Components

### `RepoFilterChips`

Horizontal `ScrollView` of capsule-shaped buttons, one per tracked repo. Each chip shows the repo name with its assigned color as the background (when selected) or tinted text (when deselected). Tap toggles selection. Multiple selection supported. When no chips are selected, all repos are shown.

```swift
struct RepoFilterChips: View {
    let repos: [Repo]
    @Binding var selectedRepoIds: Set<Int>
}
```

### `SectionTabs`

Generic horizontal segmented control with count badges. Used by both issue and PR lists with different section enums.

```swift
struct SectionTabs<Section: Hashable & CaseIterable & CustomStringConvertible>: View {
    @Binding var selected: Section
    let counts: [Section: Int]
}
```

### Enums

```swift
enum IssueSection: String, CaseIterable, CustomStringConvertible {
    case drafts, open, running, closed
    var description: String { rawValue.capitalized }
}

enum PRSection: String, CaseIterable, CustomStringConvertible {
    case open, closed
    var description: String { rawValue.capitalized }
}

enum SortOrder: String, CaseIterable {
    case updated, created, priority
}
```

## iOS: Issue List View

### Layout (top to bottom)

1. **Navigation bar** — title "Issues", trailing sort menu button, trailing `+` button for quick create
2. **Section tabs** — `SectionTabs<IssueSection>` with counts
3. **Repo filter chips** — `RepoFilterChips` row
4. **List content** — filtered/sorted issues (or drafts when Drafts tab active)

### Section logic

- **Drafts** — items from `api.listDrafts()`
- **Open** — issues where `state == "open"` and no active deployment
- **Running** — issues where `state == "open"` and an active deployment exists
- **Closed** — issues where `state == "closed"`

Running detection: cross-reference `api.deployments()` response against issue numbers.

### Sort logic

- **Updated** — sort by `updatedAt` descending
- **Created** — sort by `createdAt` descending
- **Priority** — drafts have a priority field; open/closed issues sort by comment count as a proxy (most-discussed = highest priority), matching the web behavior

### Swipe actions

- **Open issues:** swipe left → close (red, confirmation dialog), swipe right → launch (green, presents LaunchView)
- **Closed issues:** swipe right → reopen (green, confirmation dialog)
- **Drafts:** swipe left → delete draft (red, confirmation), swipe right → assign to repo (presents repo picker)
- **Running issues:** swipe left → close (red), swipe right → open terminal (presents session view)

### Row enhancements

- Repo color dot (leading edge, 8pt circle) using `RepoColors.color(for: repoIndex)`
- Running indicator: small green pulse dot next to the state badge

### State management

```swift
@State private var section: IssueSection = .open
@State private var selectedRepoIds: Set<Int> = []
@State private var sortOrder: SortOrder = .updated
@State private var showCreateSheet = false
@State private var drafts: [Draft] = []
```

Filtering and sorting are computed properties over the fetched data arrays.

## iOS: PR List View

### Layout (top to bottom)

1. **Navigation bar** — title "Pull Requests", trailing sort menu button
2. **Section tabs** — `SectionTabs<PRSection>` with counts
3. **Filter row** — "Mine" toggle chip + `RepoFilterChips`

### Author filter

"Mine" chip at the leading edge of the filter row. Visually distinct: person icon, no repo color. Filters PRs where `user.login` matches the authenticated user's login. The username is available from any PR's user field in the response data.

### Sort logic

- **Updated** — sort by `updatedAt` descending
- **Created** — sort by `createdAt` descending
- No priority sort for PRs

### Swipe actions

- **Open PRs:** swipe left → close (red), swipe right → merge (green, confirmation dialog with strategy picker)
- **Closed/merged PRs:** no swipe actions

### Row enhancements

- Repo color dot (same as issues)
- Merge status: merged = purple icon, checks passing = green, checks failing = red

## iOS: Quick Create Sheet

`QuickCreateSheet` — presented from the `+` button on the issue list.

### Fields

- **Title** (required) — text field, submit disabled when empty
- **Repo** (optional) — picker showing tracked repos with color dots. When "None" selected, creates a local draft. When a repo is selected, creates a draft then immediately assigns it (creating a GitHub issue).
- **Priority** (optional) — segmented control: Low / Normal / High. Defaults to "normal".

### Flow

1. User fills title, optionally picks repo and priority
2. Taps "Create Draft" (no repo) or "Create Issue" (repo selected)
3. No repo: `api.createDraft(title, body: nil, priority)` → dismiss, refresh drafts
4. With repo: `api.createDraft(title, body: nil, priority)` → `api.assignDraft(id, repoId)` → dismiss, refresh issues
5. If assign fails after draft creation: show error, draft is preserved for retry

### Button label

Dynamic based on repo selection:
- No repo selected → "Create Draft"
- Repo selected → "Create Issue in {repo}"

## Error Handling

- All actions follow existing Phase 3/4 patterns: `actionError` inline label, `isSubmitting` boolean, confirmation dialogs for destructive actions
- Swipe close/reopen: confirmation dialog before executing (prevents accidental swipes)
- Quick create: button disabled while submitting, error shown inline in sheet
- Assign draft partial failure: show success with warning message
- Network errors: standard `error.localizedDescription` display

## Xcode Project

Register new Swift files in `project.pbxproj`:
- `Constants.swift`
- `RepoFilterChips.swift`
- `SectionTabs.swift`
- `QuickCreateSheet.swift`

## Testing

- Server: typecheck (`pnpm turbo typecheck`) for all new endpoints
- iOS: Xcode build verification via XcodeBuildMCP
- Manual: test filtering, sorting, section switching, swipe actions, quick create against local dev server

## Files Changed

### Server (`issuectl`)

| File | Change |
|------|--------|
| `packages/web/app/api/v1/drafts/route.ts` | New — GET + POST for drafts |
| `packages/web/app/api/v1/drafts/[id]/route.ts` | New — DELETE draft |
| `packages/web/app/api/v1/drafts/[id]/assign/route.ts` | New — POST assign draft to repo |

### iOS (`issuectl-ios`)

| File | Change |
|------|--------|
| `IssueCTL/Models/Issue.swift` | Add Draft, DraftsResponse, CreateDraftRequestBody/Response, AssignDraftRequestBody/Response |
| `IssueCTL/Services/APIClient.swift` | Add 4 draft methods |
| `IssueCTL/Views/Shared/Constants.swift` | New — RepoColors palette |
| `IssueCTL/Views/Shared/RepoFilterChips.swift` | New — shared repo chip bar |
| `IssueCTL/Views/Shared/SectionTabs.swift` | New — shared section tab component |
| `IssueCTL/Views/Issues/QuickCreateSheet.swift` | New — draft/issue creation sheet |
| `IssueCTL/Views/Issues/IssueListView.swift` | Add sections, filters, sort, swipe, quick create button |
| `IssueCTL/Views/Issues/IssueRowView.swift` | Add repo color dot, running indicator |
| `IssueCTL/Views/PullRequests/PRListView.swift` | Add sections, filters, sort, swipe, author filter |
| `IssueCTL/Views/PullRequests/PRRowView.swift` | Add repo color dot, merge status indicator |
