# iOS Phase 3: PR Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add merge, approve, request changes, and comment capabilities to the iOS app's PR detail view, with review status display.

**Architecture:** Dedicated REST endpoints on the server (following Phase 1-2 patterns), new core GitHub API functions for reviews/merge, extended data layer for review data, new iOS models/API methods/UI components.

**Tech Stack:** TypeScript (core + Next.js endpoints), Swift/SwiftUI (iOS), Octokit (GitHub API), pino (structured logging)

---

## File Structure

### Server-side (issuectl monorepo)

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/core/src/github/types.ts` | Modify | Add `GitHubPullReview` type |
| `packages/core/src/github/pulls.ts` | Modify | Add `listReviews`, `createReview`, `mergePull`, `createPullComment` |
| `packages/core/src/data/pulls.ts` | Modify | Include reviews in `fetchPullDetail` and `CachedPullDetail` |
| `packages/core/src/index.ts` | Modify | Export new type and functions |
| `packages/web/lib/constants.ts` | Modify | Add `MAX_COMMENT_BODY` constant |
| `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/merge/route.ts` | Create | POST merge endpoint |
| `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/review/route.ts` | Create | POST review endpoint |
| `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/comments/route.ts` | Create | POST comment endpoint |

### iOS (issuectl-ios)

| File | Action | Responsibility |
|------|--------|---------------|
| `IssueCTL/Models/PullRequest.swift` | Modify | Add `GitHubPullReview`, request/response types, extend `PullDetailResponse` |
| `IssueCTL/Services/APIClient.swift` | Modify | Add `mergePull`, `reviewPull`, `commentOnPull` methods |
| `IssueCTL/Views/PullRequests/PRDetailView.swift` | Modify | Add reviews section, action bar, merge dialog, state management |
| `IssueCTL/Views/PullRequests/RequestChangesSheet.swift` | Create | Sheet for submitting request-changes review |
| `IssueCTL/Views/PullRequests/CommentSheet.swift` | Create | Sheet for adding PR comment |
| `IssueCTL.xcodeproj/project.pbxproj` | Modify | Register new Swift files |

---

### Task 1: Add GitHubPullReview type and review functions to core

**Files:**
- Modify: `packages/core/src/github/types.ts`
- Modify: `packages/core/src/github/pulls.ts`

- [ ] **Step 1: Add GitHubPullReview type**

Add to the end of `packages/core/src/github/types.ts` (before the closing content):

```typescript
export type GitHubPullReview = {
  id: number;
  user: GitHubUser | null;
  state: "approved" | "changes_requested" | "commented" | "dismissed";
  body: string;
  submittedAt: string;
};
```

- [ ] **Step 2: Add listReviews function**

Add to `packages/core/src/github/pulls.ts`. First update the imports at line 2:

```typescript
import type { GitHubPull, GitHubCheck, GitHubPullFile, GitHubPullReview, RawGitHubUser } from "./types.js";
```

Then add at the end of the file:

```typescript
export async function listReviews(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubPullReview[]> {
  const { data } = await octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: number,
  });
  return data.map((r) => ({
    id: r.id,
    user: mapUser(r.user as RawGitHubUser),
    state: r.state.toLowerCase() as GitHubPullReview["state"],
    body: r.body ?? "",
    submittedAt: r.submitted_at ?? "",
  }));
}
```

- [ ] **Step 3: Add createReview function**

Add after `listReviews` in `packages/core/src/github/pulls.ts`:

```typescript
export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export async function createReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  event: ReviewEvent,
  body?: string,
): Promise<GitHubPullReview> {
  const { data } = await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: number,
    event,
    body: body || undefined,
  });
  return {
    id: data.id,
    user: mapUser(data.user as RawGitHubUser),
    state: data.state.toLowerCase() as GitHubPullReview["state"],
    body: data.body ?? "",
    submittedAt: data.submitted_at ?? "",
  };
}
```

- [ ] **Step 4: Add mergePull function**

Add after `createReview` in `packages/core/src/github/pulls.ts`:

```typescript
export type MergeMethod = "merge" | "squash" | "rebase";

export async function mergePull(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  mergeMethod: MergeMethod,
): Promise<{ sha: string; merged: boolean; message: string }> {
  const { data } = await octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: number,
    merge_method: mergeMethod,
  });
  return { sha: data.sha, merged: data.merged, message: data.message };
}
```

- [ ] **Step 5: Add createPullComment function**

Add after `mergePull` in `packages/core/src/github/pulls.ts`. This reuses the issues comment endpoint (GitHub treats PR comments and issue comments the same):

```typescript
export async function createPullComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  body: string,
): Promise<GitHubComment> {
  const { data } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: number,
    body,
  });
  return {
    id: data.id,
    body: data.body ?? "",
    user: mapUser(data.user as RawGitHubUser),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    htmlUrl: data.html_url,
  };
}
```

Note: also add `GitHubComment` to the import at the top of the file:

```typescript
import type { GitHubPull, GitHubCheck, GitHubPullFile, GitHubPullReview, GitHubComment, RawGitHubUser } from "./types.js";
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/github/types.ts packages/core/src/github/pulls.ts
git commit -m "feat(core): add PR review, merge, and comment GitHub API functions"
```

---

### Task 2: Extend data layer to include reviews in pull detail

**Files:**
- Modify: `packages/core/src/data/pulls.ts`

- [ ] **Step 1: Add listReviews import**

In `packages/core/src/data/pulls.ts`, update the imports at line 3-4:

```typescript
import type { GitHubPull, GitHubCheck, GitHubIssue, GitHubPullFile, GitHubPullReview } from "../github/types.js";
import { listPulls, getPull, getPullChecks, listPullFiles, listReviews } from "../github/pulls.js";
```

- [ ] **Step 2: Add reviews to CachedPullDetail type**

Update `CachedPullDetail` (around line 83) to include reviews:

```typescript
type CachedPullDetail = {
  pull: GitHubPull;
  checks: GitHubCheck[];
  files: GitHubPullFile[];
  linkedIssue: GitHubIssue | null;
  reviews: GitHubPullReview[];
};
```

- [ ] **Step 3: Fetch reviews in fetchPullDetail**

Update the `fetchPullDetail` function. Change the `Promise.all` at line 58 to include reviews:

```typescript
async function fetchPullDetail(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<CachedPullDetail> {
  const [pull, checks, files, reviews] = await Promise.all([
    getPull(octokit, owner, repo, number),
    getPullChecks(octokit, owner, repo, `pull/${number}/head`),
    listPullFiles(octokit, owner, repo, number),
    listReviews(octokit, owner, repo, number),
  ]);

  const issueNumber = extractLinkedIssueNumber(pull.body);
  let linkedIssue: GitHubIssue | null = null;
  if (issueNumber) {
    try {
      linkedIssue = await getIssue(octokit, owner, repo, issueNumber);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status !== 404) {
        console.warn(
          `[issuectl] Failed to fetch linked issue #${issueNumber} for PR #${number}:`,
          err,
        );
      }
    }
  }

  return { pull, checks, files, linkedIssue, reviews };
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/data/pulls.ts
git commit -m "feat(core): include reviews in pull detail data layer"
```

---

### Task 3: Export new types and functions from core index

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add type export**

Find the existing type exports block (around line 93-103) and add `GitHubPullReview`:

```typescript
export type {
  GitHubUser,
  GitHubIssue,
  GitHubPull,
  GitHubComment,
  GitHubLabel,
  GitHubCheck,
  GitHubPullFile,
  GitHubPullReview,
  GitHubAccessibleRepo,
} from "./github/types.js";
```

- [ ] **Step 2: Add function exports**

Add a new export block after the existing pulls data layer exports (after line 141):

```typescript
export {
  listReviews,
  createReview,
  mergePull,
  createPullComment,
  type ReviewEvent,
  type MergeMethod,
} from "./github/pulls.js";
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export PR review, merge, and comment functions"
```

---

### Task 4: Add MAX_COMMENT_BODY to shared constants

**Files:**
- Modify: `packages/web/lib/constants.ts`

- [ ] **Step 1: Add constant**

Add to `packages/web/lib/constants.ts`:

```typescript
/** Max comment/review body length — matches GitHub's limit. */
export const MAX_COMMENT_BODY = 65536;
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/lib/constants.ts
git commit -m "feat(web): add MAX_COMMENT_BODY shared constant"
```

---

### Task 5: Create merge endpoint

**Files:**
- Create: `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/merge/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  clearCacheKey,
  withAuthRetry,
  mergePull,
  formatErrorForUser,
  type MergeMethod,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

const VALID_MERGE_METHODS: MergeMethod[] = ["merge", "squash", "rebase"];

type MergeBody = {
  mergeMethod: MergeMethod;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo, number: numStr } = await params;
  const pullNumber = parseInt(numStr, 10);
  if (Number.isNaN(pullNumber) || pullNumber <= 0) {
    return NextResponse.json({ error: "Invalid pull request number" }, { status: 400 });
  }

  let body: MergeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_MERGE_METHODS.includes(body.mergeMethod)) {
    return NextResponse.json({ error: "Invalid merge method" }, { status: 400 });
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const result = await withAuthRetry((octokit) =>
      mergePull(octokit, owner, repo, pullNumber, body.mergeMethod),
    );

    clearCacheKey(db, `pull-detail:${owner}/${repo}#${pullNumber}`);
    clearCacheKey(db, `pulls-open:${owner}/${repo}`);

    return NextResponse.json({ success: true, sha: result.sha });
  } catch (err) {
    log.error({ err, msg: "api_merge_pull_failed", owner, repo, pullNumber });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 3: Commit**

```bash
git add "packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/merge/route.ts"
git commit -m "feat(web): add POST merge endpoint for iOS PR actions"
```

---

### Task 6: Create review endpoint

**Files:**
- Create: `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/review/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  clearCacheKey,
  withAuthRetry,
  createReview,
  formatErrorForUser,
  type ReviewEvent,
} from "@issuectl/core";
import { MAX_COMMENT_BODY } from "@/lib/constants";

export const dynamic = "force-dynamic";

const VALID_EVENTS: ReviewEvent[] = ["APPROVE", "REQUEST_CHANGES"];

type ReviewBody = {
  event: ReviewEvent;
  body?: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo, number: numStr } = await params;
  const pullNumber = parseInt(numStr, 10);
  if (Number.isNaN(pullNumber) || pullNumber <= 0) {
    return NextResponse.json({ error: "Invalid pull request number" }, { status: 400 });
  }

  let body: ReviewBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_EVENTS.includes(body.event)) {
    return NextResponse.json({ error: "Invalid review event" }, { status: 400 });
  }
  if (body.event === "REQUEST_CHANGES" && (!body.body || !body.body.trim())) {
    return NextResponse.json({ error: "Body is required when requesting changes" }, { status: 400 });
  }
  if (body.body && body.body.length > MAX_COMMENT_BODY) {
    return NextResponse.json(
      { error: `Review body must be ${MAX_COMMENT_BODY} characters or fewer` },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const review = await withAuthRetry((octokit) =>
      createReview(octokit, owner, repo, pullNumber, body.event, body.body),
    );

    clearCacheKey(db, `pull-detail:${owner}/${repo}#${pullNumber}`);

    return NextResponse.json({ success: true, reviewId: review.id });
  } catch (err) {
    log.error({ err, msg: "api_review_pull_failed", owner, repo, pullNumber, event: body.event });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 3: Commit**

```bash
git add "packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/review/route.ts"
git commit -m "feat(web): add POST review endpoint for iOS PR actions"
```

---

### Task 7: Create comments endpoint

**Files:**
- Create: `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/comments/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  clearCacheKey,
  withAuthRetry,
  createPullComment,
  formatErrorForUser,
} from "@issuectl/core";
import { MAX_COMMENT_BODY } from "@/lib/constants";

export const dynamic = "force-dynamic";

type CommentBody = {
  body: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo, number: numStr } = await params;
  const pullNumber = parseInt(numStr, 10);
  if (Number.isNaN(pullNumber) || pullNumber <= 0) {
    return NextResponse.json({ error: "Invalid pull request number" }, { status: 400 });
  }

  let body: CommentBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }
  if (body.body.length > MAX_COMMENT_BODY) {
    return NextResponse.json(
      { error: `Comment must be ${MAX_COMMENT_BODY} characters or fewer` },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const comment = await withAuthRetry((octokit) =>
      createPullComment(octokit, owner, repo, pullNumber, body.body),
    );

    clearCacheKey(db, `pull-detail:${owner}/${repo}#${pullNumber}`);

    return NextResponse.json({ success: true, commentId: comment.id });
  } catch (err) {
    log.error({ err, msg: "api_comment_pull_failed", owner, repo, pullNumber });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 3: Commit**

```bash
git add "packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/comments/route.ts"
git commit -m "feat(web): add POST comment endpoint for iOS PR actions"
```

---

### Task 8: Add iOS models and API client methods

**Files:**
- Modify: `IssueCTL/Models/PullRequest.swift`
- Modify: `IssueCTL/Services/APIClient.swift`

- [ ] **Step 1: Add GitHubPullReview model**

Add to `IssueCTL/Models/PullRequest.swift` after the `GitHubPullFile` struct:

```swift
struct GitHubPullReview: Codable, Identifiable, Sendable {
    let id: Int
    let user: GitHubUser?
    let state: String
    let body: String
    let submittedAt: String

    var isApproved: Bool { state == "approved" }
    var isChangesRequested: Bool { state == "changes_requested" }
    var isCommented: Bool { state == "commented" }
}
```

- [ ] **Step 2: Add reviews to PullDetailResponse**

Update `PullDetailResponse` in `IssueCTL/Models/PullRequest.swift` to include reviews:

```swift
struct PullDetailResponse: Codable, Sendable {
    let pull: GitHubPull
    let checks: [GitHubCheck]
    let files: [GitHubPullFile]
    let linkedIssue: GitHubIssue?
    let reviews: [GitHubPullReview]
    let fromCache: Bool
    let cachedAt: String?
}
```

- [ ] **Step 3: Add request/response types**

Add at the end of `IssueCTL/Models/PullRequest.swift`:

```swift
struct MergeRequestBody: Encodable, Sendable {
    let mergeMethod: String
}

struct MergeResponse: Codable, Sendable {
    let success: Bool
    let sha: String?
    let error: String?
}

struct ReviewRequestBody: Encodable, Sendable {
    let event: String
    let body: String?
}

struct ReviewResponse: Codable, Sendable {
    let success: Bool
    let reviewId: Int?
    let error: String?
}

struct PullCommentRequestBody: Encodable, Sendable {
    let body: String
}

struct PullCommentResponse: Codable, Sendable {
    let success: Bool
    let commentId: Int?
    let error: String?
}
```

- [ ] **Step 4: Add API client methods**

Add to `IssueCTL/Services/APIClient.swift` in the `// MARK: - Endpoints` section, after `endSession`:

```swift
func mergePull(owner: String, repo: String, number: Int, body: MergeRequestBody) async throws -> MergeResponse {
    let bodyData = try JSONEncoder().encode(body)
    let (data, _) = try await request(path: "/api/v1/pulls/\(owner)/\(repo)/\(number)/merge", method: "POST", body: bodyData)
    return try decoder.decode(MergeResponse.self, from: data)
}

func reviewPull(owner: String, repo: String, number: Int, body: ReviewRequestBody) async throws -> ReviewResponse {
    let bodyData = try JSONEncoder().encode(body)
    let (data, _) = try await request(path: "/api/v1/pulls/\(owner)/\(repo)/\(number)/review", method: "POST", body: bodyData)
    return try decoder.decode(ReviewResponse.self, from: data)
}

func commentOnPull(owner: String, repo: String, number: Int, body: PullCommentRequestBody) async throws -> PullCommentResponse {
    let bodyData = try JSONEncoder().encode(body)
    let (data, _) = try await request(path: "/api/v1/pulls/\(owner)/\(repo)/\(number)/comments", method: "POST", body: bodyData)
    return try decoder.decode(PullCommentResponse.self, from: data)
}
```

- [ ] **Step 5: Build iOS app**

Run: XcodeBuildMCP `build_sim`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/neonwatty/Desktop/issuectl-ios
git add IssueCTL/Models/PullRequest.swift IssueCTL/Services/APIClient.swift
git commit -m "feat(ios): add PR action models and API client methods"
```

---

### Task 9: Create RequestChangesSheet and CommentSheet

**Files:**
- Create: `IssueCTL/Views/PullRequests/RequestChangesSheet.swift`
- Create: `IssueCTL/Views/PullRequests/CommentSheet.swift`

- [ ] **Step 1: Create RequestChangesSheet**

Create `IssueCTL/Views/PullRequests/RequestChangesSheet.swift`:

```swift
import SwiftUI

struct RequestChangesSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let owner: String
    let repo: String
    let number: Int
    let onSuccess: () -> Void

    @State private var body = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("What needs to change?") {
                    TextEditor(text: $body)
                        .frame(minHeight: 120)
                        .font(.body)
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSubmitting {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label("Request Changes", systemImage: "xmark.circle")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
                }
            }
            .navigationTitle("Request Changes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true
        errorMessage = nil
        do {
            let requestBody = ReviewRequestBody(event: "REQUEST_CHANGES", body: body)
            let response = try await api.reviewPull(owner: owner, repo: repo, number: number, body: requestBody)
            if response.success {
                onSuccess()
                dismiss()
            } else {
                errorMessage = response.error ?? "Failed to submit review"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
```

- [ ] **Step 2: Create CommentSheet**

Create `IssueCTL/Views/PullRequests/CommentSheet.swift`:

```swift
import SwiftUI

struct CommentSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let owner: String
    let repo: String
    let number: Int
    let onSuccess: () -> Void

    @State private var body = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Comment") {
                    TextEditor(text: $body)
                        .frame(minHeight: 120)
                        .font(.body)
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSubmitting {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label("Add Comment", systemImage: "bubble.left")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
                }
            }
            .navigationTitle("Add Comment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true
        errorMessage = nil
        do {
            let requestBody = PullCommentRequestBody(body: body)
            let response = try await api.commentOnPull(owner: owner, repo: repo, number: number, body: requestBody)
            if response.success {
                onSuccess()
                dismiss()
            } else {
                errorMessage = response.error ?? "Failed to add comment"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
```

- [ ] **Step 3: Build iOS app**

Run: XcodeBuildMCP `build_sim` (will fail because files not in pbxproj yet — that's OK, we register them in Task 11)

- [ ] **Step 4: Commit**

```bash
cd /Users/neonwatty/Desktop/issuectl-ios
git add IssueCTL/Views/PullRequests/RequestChangesSheet.swift IssueCTL/Views/PullRequests/CommentSheet.swift
git commit -m "feat(ios): add RequestChangesSheet and CommentSheet views"
```

---

### Task 10: Add reviews section and action bar to PRDetailView

**Files:**
- Modify: `IssueCTL/Views/PullRequests/PRDetailView.swift`

- [ ] **Step 1: Add state properties**

Add after the existing `@State private var errorMessage: String?` (line 11):

```swift
@State private var isApproving = false
@State private var isMerging = false
@State private var showRequestChanges = false
@State private var showCommentSheet = false
@State private var showMergeConfirm = false
@State private var actionError: String?
```

- [ ] **Step 2: Add reviews section to the body**

In the `VStack` inside the `ScrollView`, add the reviews section after `checksSection`. Insert after `if !detail.checks.isEmpty { checksSection(detail.checks) }`:

```swift
if !detail.reviews.isEmpty {
    reviewsSection(detail.reviews)
}
```

- [ ] **Step 3: Add action bar below the ScrollView**

Replace the existing content block wrapping the `ScrollView` (from `} else if let detail {` through the closing of that block) with a version that includes the action bar. The ScrollView stays the same, but wrap it in a `VStack` and add the bar:

```swift
} else if let detail {
    VStack(spacing: 0) {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                headerSection(detail.pull)
                branchSection(detail.pull)
                bodySection(detail.pull)
                if !detail.checks.isEmpty {
                    checksSection(detail.checks)
                }
                if !detail.reviews.isEmpty {
                    reviewsSection(detail.reviews)
                }
                if !detail.files.isEmpty {
                    filesSection(detail.files)
                }
                if let linkedIssue = detail.linkedIssue {
                    linkedIssueSection(linkedIssue)
                }
                if let actionError {
                    Label(actionError, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .font(.subheadline)
                }
            }
            .padding()
        }
        .refreshable { await load(refresh: true) }

        if detail.pull.isOpen && !detail.pull.merged {
            actionBar
        }
    }
```

- [ ] **Step 4: Implement the action bar**

Add after the `linkedIssueSection` function:

```swift
private var actionBar: some View {
    HStack(spacing: 16) {
        Button {
            Task { await approve() }
        } label: {
            if isApproving {
                ProgressView().controlSize(.small)
            } else {
                Label("Approve", systemImage: "checkmark.circle")
            }
        }
        .tint(.green)
        .disabled(isApproving)

        Button {
            showRequestChanges = true
        } label: {
            Label("Changes", systemImage: "xmark.circle")
        }
        .tint(.red)

        Button {
            showCommentSheet = true
        } label: {
            Label("Comment", systemImage: "bubble.left")
        }

        Button {
            showMergeConfirm = true
        } label: {
            if isMerging {
                ProgressView().controlSize(.small)
            } else {
                Label("Merge", systemImage: "arrow.triangle.merge")
            }
        }
        .tint(.purple)
        .disabled(isMerging)
    }
    .labelStyle(.titleAndIcon)
    .font(.caption)
    .padding()
    .background(.bar)
}
```

- [ ] **Step 5: Implement the reviewsSection**

Add after `linkedIssueSection`:

```swift
@ViewBuilder
private func reviewsSection(_ reviews: [GitHubPullReview]) -> some View {
    VStack(alignment: .leading, spacing: 8) {
        Divider()
        Label("Reviews", systemImage: "eye")
            .font(.headline)

        ForEach(reviews) { review in
            HStack(spacing: 8) {
                Image(systemName: reviewIcon(for: review.state))
                    .foregroundStyle(reviewColor(for: review.state))
                if let user = review.user {
                    Text(user.login)
                        .font(.subheadline)
                }
                Text(reviewStateLabel(review.state))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(.vertical, 2)
        }
    }
}

private func reviewIcon(for state: String) -> String {
    switch state {
    case "approved": "checkmark.circle.fill"
    case "changes_requested": "xmark.circle.fill"
    case "commented": "bubble.left.fill"
    case "dismissed": "minus.circle.fill"
    default: "questionmark.circle"
    }
}

private func reviewColor(for state: String) -> Color {
    switch state {
    case "approved": .green
    case "changes_requested": .red
    case "commented": .secondary
    case "dismissed": .orange
    default: .secondary
    }
}

private func reviewStateLabel(_ state: String) -> String {
    switch state {
    case "approved": "Approved"
    case "changes_requested": "Requested changes"
    case "commented": "Commented"
    case "dismissed": "Dismissed"
    default: state
    }
}
```

- [ ] **Step 6: Add sheet and dialog modifiers**

Add to the view chain, after `.task { await load() }`:

```swift
.sheet(isPresented: $showRequestChanges) {
    RequestChangesSheet(
        owner: owner, repo: repo, number: number,
        onSuccess: { Task { await load(refresh: true) } }
    )
}
.sheet(isPresented: $showCommentSheet) {
    CommentSheet(
        owner: owner, repo: repo, number: number,
        onSuccess: { Task { await load(refresh: true) } }
    )
}
.confirmationDialog("Merge Pull Request", isPresented: $showMergeConfirm, titleVisibility: .visible) {
    Button("Merge Commit") { Task { await merge(method: "merge") } }
    Button("Squash and Merge") { Task { await merge(method: "squash") } }
    Button("Rebase and Merge") { Task { await merge(method: "rebase") } }
}
```

- [ ] **Step 7: Implement approve and merge actions**

Add in the `// MARK: - Loading` section, after the `load` function:

```swift
private func approve() async {
    isApproving = true
    actionError = nil
    do {
        let body = ReviewRequestBody(event: "APPROVE", body: nil)
        let response = try await api.reviewPull(owner: owner, repo: repo, number: number, body: body)
        if response.success {
            await load(refresh: true)
        } else {
            actionError = response.error ?? "Failed to approve"
        }
    } catch {
        actionError = error.localizedDescription
    }
    isApproving = false
}

private func merge(method: String) async {
    isMerging = true
    actionError = nil
    do {
        let body = MergeRequestBody(mergeMethod: method)
        let response = try await api.mergePull(owner: owner, repo: repo, number: number, body: body)
        if response.success {
            await load(refresh: true)
        } else {
            actionError = response.error ?? "Merge failed"
        }
    } catch {
        actionError = error.localizedDescription
    }
    isMerging = false
}
```

- [ ] **Step 8: Commit**

```bash
cd /Users/neonwatty/Desktop/issuectl-ios
git add IssueCTL/Views/PullRequests/PRDetailView.swift
git commit -m "feat(ios): add reviews section, action bar, and merge dialog to PRDetailView"
```

---

### Task 11: Register new files in Xcode project and verify build

**Files:**
- Modify: `IssueCTL.xcodeproj/project.pbxproj`

- [ ] **Step 1: Add PBXFileReference entries**

Add in the `PBXFileReference` section:

```
		EE1B2C3D4E5F6A7B8C9D0E1F /* RequestChangesSheet.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = RequestChangesSheet.swift; sourceTree = "<group>"; };
		EE2B3C4D5E6F7A8B9C0D1E2F /* CommentSheet.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = CommentSheet.swift; sourceTree = "<group>"; };
```

- [ ] **Step 2: Add PBXBuildFile entries**

Add in the `PBXBuildFile` section:

```
		FE1B2C3D4E5F6A7B8C9D0E1F /* RequestChangesSheet.swift in Sources */ = {isa = PBXBuildFile; fileRef = EE1B2C3D4E5F6A7B8C9D0E1F /* RequestChangesSheet.swift */; };
		FE2B3C4D5E6F7A8B9C0D1E2F /* CommentSheet.swift in Sources */ = {isa = PBXBuildFile; fileRef = EE2B3C4D5E6F7A8B9C0D1E2F /* CommentSheet.swift */; };
```

- [ ] **Step 3: Add files to PullRequests group**

Update the `PullRequests` group's `children` to include the new files (alphabetical order):

```
		E1F2A3B4C5D6E7F8A9B0C1D2 /* PullRequests */ = {
			isa = PBXGroup;
			children = (
				EE2B3C4D5E6F7A8B9C0D1E2F /* CommentSheet.swift */,
				9B0C1D2E3F4A5B6C7D8E9F0A /* PRDetailView.swift */,
				5B6C7D8E9F0A1B2C3D4E5F6A /* PRListView.swift */,
				7B8C9D0E1F2A3B4C5D6E7F8A /* PRRowView.swift */,
				EE1B2C3D4E5F6A7B8C9D0E1F /* RequestChangesSheet.swift */,
			);
			path = PullRequests;
			sourceTree = "<group>";
		};
```

- [ ] **Step 4: Add to PBXSourcesBuildPhase**

Add in the `Sources` files list (alphabetical position):

After `CommentView.swift in Sources`:
```
				FE2B3C4D5E6F7A8B9C0D1E2F /* CommentSheet.swift in Sources */,
```

After `RepoListView.swift in Sources`:
```
				FE1B2C3D4E5F6A7B8C9D0E1F /* RequestChangesSheet.swift in Sources */,
```

- [ ] **Step 5: Build iOS app**

Run: XcodeBuildMCP `build_sim`
Expected: Build succeeds with all new files compiled.

- [ ] **Step 6: Commit**

```bash
cd /Users/neonwatty/Desktop/issuectl-ios
git add IssueCTL.xcodeproj/project.pbxproj
git commit -m "chore(ios): register Phase 3 PR action files in Xcode project"
```

---

### Task 12: Final typecheck, push, and PR

- [ ] **Step 1: Run server-side typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 2: Push iOS changes**

```bash
cd /Users/neonwatty/Desktop/issuectl-ios
git push
```

- [ ] **Step 3: Push server-side changes**

```bash
git push
```

- [ ] **Step 4: Run PR review toolkit on server-side changes**

Run: `/pr-review-toolkit:review-pr all`
Address all critical and important findings.

- [ ] **Step 5: Create server-side PR**

```bash
gh pr create --title "feat(web): Phase 3 API endpoints — merge, review, comments" --body "..." --base main # reviewed
```
