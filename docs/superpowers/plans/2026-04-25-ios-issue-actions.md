# iOS Phase 4: Issue Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add close/reopen and comment capabilities to the iOS app's issue detail view.

**Architecture:** Two new REST endpoints on the server (`POST .../state`, `POST .../comments`), one new core function (`reopenIssue`), and iOS UI components (action bar, two sheets) following the Phase 3 PR actions pattern exactly.

**Tech Stack:** TypeScript (Node.js/Next.js), Swift (SwiftUI), Octokit, pino logging

**Design spec:** `docs/superpowers/specs/2026-04-25-ios-issue-actions-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/core/src/github/issues.ts` | Add `reopenIssue` function |
| Modify | `packages/core/src/index.ts` | Export `reopenIssue` |
| Create | `packages/web/app/api/v1/issues/[owner]/[repo]/[number]/state/route.ts` | POST endpoint for close/reopen |
| Create | `packages/web/app/api/v1/issues/[owner]/[repo]/[number]/comments/route.ts` | POST endpoint for issue comments |
| Modify | `IssueCTL/Models/Issue.swift` | Add request/response types |
| Modify | `IssueCTL/Services/APIClient.swift` | Add `updateIssueState` and `commentOnIssue` methods |
| Create | `IssueCTL/Views/Issues/IssueCommentSheet.swift` | Comment compose sheet |
| Create | `IssueCTL/Views/Issues/CloseIssueSheet.swift` | Close with optional comment sheet |
| Modify | `IssueCTL/Views/Issues/IssueDetailView.swift` | Add action bar and sheet wiring |
| Modify | `IssueCTL.xcodeproj/project.pbxproj` | Register new Swift files |

---

### Task 1: Add `reopenIssue` core function and export

**Files:**
- Modify: `packages/core/src/github/issues.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add `reopenIssue` function to `packages/core/src/github/issues.ts`**

Insert this function after the existing `closeIssue` function (after line 139):

```typescript
export async function reopenIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<void> {
  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: number,
    state: "open",
  });
}
```

- [ ] **Step 2: Export `reopenIssue` from `packages/core/src/index.ts`**

In the existing export block from `"./github/issues.js"` (around line 112-118), add `reopenIssue`:

Change:
```typescript
export {
  createIssue,
  updateIssue,
  closeIssue,
  reassignIssue,
  type ReassignResult,
} from "./github/issues.js";
```

To:
```typescript
export {
  createIssue,
  updateIssue,
  closeIssue,
  reopenIssue,
  reassignIssue,
  type ReassignResult,
} from "./github/issues.js";
```

- [ ] **Step 3: Run typecheck**

Run: `cd /Users/neonwatty/Desktop/issuectl/.claude/worktrees/phase-4-ios-issue-actions && pnpm turbo typecheck`
Expected: PASS — 4/4 tasks, 0 errors

- [ ] **Step 4: Commit**

```bash
cd /Users/neonwatty/Desktop/issuectl/.claude/worktrees/phase-4-ios-issue-actions
git add packages/core/src/github/issues.ts packages/core/src/index.ts
git commit -m "feat(core): add reopenIssue function for iOS issue actions"
```

---

### Task 2: Create issue state endpoint

**Files:**
- Create: `packages/web/app/api/v1/issues/[owner]/[repo]/[number]/state/route.ts`

- [ ] **Step 1: Create the state route file**

Create `packages/web/app/api/v1/issues/[owner]/[repo]/[number]/state/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  clearCacheKey,
  withAuthRetry,
  closeIssue,
  reopenIssue,
  addComment,
  formatErrorForUser,
} from "@issuectl/core";
import { MAX_COMMENT_BODY } from "@/lib/constants";

export const dynamic = "force-dynamic";

const VALID_STATES = ["open", "closed"] as const;
type IssueState = (typeof VALID_STATES)[number];

type StateBody = {
  state: IssueState;
  comment?: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo, number: numStr } = await params;
  const issueNumber = parseInt(numStr, 10);
  if (Number.isNaN(issueNumber) || issueNumber <= 0) {
    return NextResponse.json({ error: "Invalid issue number" }, { status: 400 });
  }

  let body: StateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_STATES.includes(body.state as IssueState)) {
    return NextResponse.json({ error: "Invalid state — must be open or closed" }, { status: 400 });
  }

  if (body.comment !== undefined) {
    if (typeof body.comment !== "string" || !body.comment.trim()) {
      return NextResponse.json({ error: "Comment must be a non-empty string" }, { status: 400 });
    }
    if (body.comment.length > MAX_COMMENT_BODY) {
      return NextResponse.json(
        { error: `Comment must be ${MAX_COMMENT_BODY} characters or fewer` },
        { status: 400 },
      );
    }
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    // Post comment first (if provided), then change state
    if (body.comment?.trim()) {
      await withAuthRetry((octokit) =>
        addComment(db, octokit, owner, repo, issueNumber, body.comment!),
      );
    }

    if (body.state === "closed") {
      await withAuthRetry((octokit) => closeIssue(octokit, owner, repo, issueNumber));
    } else {
      await withAuthRetry((octokit) => reopenIssue(octokit, owner, repo, issueNumber));
    }

    clearCacheKey(db, `issue-detail:${owner}/${repo}#${issueNumber}`);
    clearCacheKey(db, `issues:${owner}/${repo}`);

    log.info({ msg: "api_issue_state_changed", owner, repo, issueNumber, state: body.state });
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_issue_state_failed", owner, repo, issueNumber });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/neonwatty/Desktop/issuectl/.claude/worktrees/phase-4-ios-issue-actions && pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd /Users/neonwatty/Desktop/issuectl/.claude/worktrees/phase-4-ios-issue-actions
git add packages/web/app/api/v1/issues/\[owner\]/\[repo\]/\[number\]/state/route.ts
git commit -m "feat(web): add POST issue state endpoint for iOS issue actions"
```

---

### Task 3: Create issue comments endpoint

**Files:**
- Create: `packages/web/app/api/v1/issues/[owner]/[repo]/[number]/comments/route.ts`

- [ ] **Step 1: Create the comments route file**

Create `packages/web/app/api/v1/issues/[owner]/[repo]/[number]/comments/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  withAuthRetry,
  addComment,
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
  const issueNumber = parseInt(numStr, 10);
  if (Number.isNaN(issueNumber) || issueNumber <= 0) {
    return NextResponse.json({ error: "Invalid issue number" }, { status: 400 });
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
      addComment(db, octokit, owner, repo, issueNumber, body.body),
    );

    log.info({ msg: "api_issue_comment_added", owner, repo, issueNumber, commentId: comment.id });
    return NextResponse.json({ success: true, commentId: comment.id });
  } catch (err) {
    log.error({ err, msg: "api_issue_comment_failed", owner, repo, issueNumber });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
```

Note: `addComment` from `@issuectl/core` is the data layer version (from `data/comments.ts`) which handles cache invalidation internally — it clears `comments:`, `issue-content:`, `issue-detail:`, and `pull-detail:` cache keys. No additional `clearCacheKey` calls needed.

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/neonwatty/Desktop/issuectl/.claude/worktrees/phase-4-ios-issue-actions && pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd /Users/neonwatty/Desktop/issuectl/.claude/worktrees/phase-4-ios-issue-actions
git add packages/web/app/api/v1/issues/\[owner\]/\[repo\]/\[number\]/comments/route.ts
git commit -m "feat(web): add POST issue comments endpoint for iOS issue actions"
```

---

### Task 4: Add iOS models and API client methods

**Files:**
- Modify: `IssueCTL/Models/Issue.swift` (in the `issuectl-ios` repo at `/Users/neonwatty/Desktop/issuectl-ios/`)
- Modify: `IssueCTL/Services/APIClient.swift`

- [ ] **Step 1: Add request/response types to `Issue.swift`**

Append these types at the end of `IssueCTL/Models/Issue.swift` (after `IssueDetailResponse`):

```swift
struct IssueStateRequestBody: Encodable, Sendable {
    let state: String
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

- [ ] **Step 2: Add API client methods to `APIClient.swift`**

Add these two methods in `APIClient.swift` after the `commentOnPull` method (around line 176), before the `// MARK: - Private` section:

```swift
    func updateIssueState(owner: String, repo: String, number: Int, body: IssueStateRequestBody) async throws -> IssueStateResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/issues/\(owner)/\(repo)/\(number)/state", method: "POST", body: bodyData)
        return try decoder.decode(IssueStateResponse.self, from: data)
    }

    func commentOnIssue(owner: String, repo: String, number: Int, body: IssueCommentRequestBody) async throws -> IssueCommentResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/issues/\(owner)/\(repo)/\(number)/comments", method: "POST", body: bodyData)
        return try decoder.decode(IssueCommentResponse.self, from: data)
    }
```

- [ ] **Step 3: Build iOS project**

Run Xcode build via XcodeBuildMCP `build_sim` to verify the models and API methods compile.
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Commit**

```bash
cd /Users/neonwatty/Desktop/issuectl-ios
git add IssueCTL/Models/Issue.swift IssueCTL/Services/APIClient.swift
git commit -m "feat(ios): add issue state and comment models and API client methods"
```

---

### Task 5: Create IssueCommentSheet

**Files:**
- Create: `IssueCTL/Views/Issues/IssueCommentSheet.swift`

- [ ] **Step 1: Create `IssueCommentSheet.swift`**

Create `IssueCTL/Views/Issues/IssueCommentSheet.swift` following the same pattern as `CommentSheet.swift` (for PRs):

```swift
import SwiftUI

struct IssueCommentSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let owner: String
    let repo: String
    let number: Int
    let onSuccess: () -> Void

    @State private var commentBody = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Comment") {
                    TextEditor(text: $commentBody)
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
                    .disabled(commentBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
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
            let requestBody = IssueCommentRequestBody(body: commentBody)
            let response = try await api.commentOnIssue(owner: owner, repo: repo, number: number, body: requestBody)
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

- [ ] **Step 2: Commit**

```bash
cd /Users/neonwatty/Desktop/issuectl-ios
git add IssueCTL/Views/Issues/IssueCommentSheet.swift
git commit -m "feat(ios): add IssueCommentSheet for adding comments to issues"
```

---

### Task 6: Create CloseIssueSheet

**Files:**
- Create: `IssueCTL/Views/Issues/CloseIssueSheet.swift`

- [ ] **Step 1: Create `CloseIssueSheet.swift`**

Create `IssueCTL/Views/Issues/CloseIssueSheet.swift`:

```swift
import SwiftUI

struct CloseIssueSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let owner: String
    let repo: String
    let number: Int
    let onSuccess: () -> Void

    @State private var closingComment = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Closing comment (optional)") {
                    TextEditor(text: $closingComment)
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
                    Button(role: .destructive) {
                        Task { await submit() }
                    } label: {
                        if isSubmitting {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label("Close Issue", systemImage: "xmark.circle")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isSubmitting)
                }
            }
            .navigationTitle("Close Issue")
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
            let trimmed = closingComment.trimmingCharacters(in: .whitespacesAndNewlines)
            let requestBody = IssueStateRequestBody(
                state: "closed",
                comment: trimmed.isEmpty ? nil : trimmed
            )
            let response = try await api.updateIssueState(owner: owner, repo: repo, number: number, body: requestBody)
            if response.success {
                onSuccess()
                dismiss()
            } else {
                errorMessage = response.error ?? "Failed to close issue"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/neonwatty/Desktop/issuectl-ios
git add IssueCTL/Views/Issues/CloseIssueSheet.swift
git commit -m "feat(ios): add CloseIssueSheet with optional closing comment"
```

---

### Task 7: Add action bar and sheet wiring to IssueDetailView

**Files:**
- Modify: `IssueCTL/Views/Issues/IssueDetailView.swift`

- [ ] **Step 1: Add state properties**

In `IssueDetailView`, add these `@State` properties after the existing ones (after `@State private var showLaunchSheet = false` on line 12):

```swift
    @State private var isClosing = false
    @State private var isReopening = false
    @State private var showCommentSheet = false
    @State private var showCloseSheet = false
    @State private var showCloseConfirm = false
    @State private var showReopenConfirm = false
    @State private var actionError: String?
```

- [ ] **Step 2: Wrap ScrollView in VStack and add action bar**

Replace the `else if let detail` branch content (lines 27-43) — the current `ScrollView` block. Wrap it in a `VStack(spacing: 0)` and add the action bar after the scroll view, plus an error label:

```swift
            } else if let detail {
                VStack(spacing: 0) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            headerSection(detail.issue)
                            bodySection(detail.issue)
                            if !detail.linkedPRs.isEmpty {
                                linkedPRsSection(detail.linkedPRs)
                            }
                            if !detail.deployments.isEmpty {
                                deploymentsSection(detail.deployments)
                            }
                            if !detail.comments.isEmpty {
                                commentsSection(detail.comments)
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

                    actionBar(for: detail.issue)
                }
            }
```

- [ ] **Step 3: Add sheet and confirmation dialog modifiers**

After the existing `.sheet(isPresented: $showLaunchSheet)` modifier and before `.task { await load() }`, add:

```swift
        .sheet(isPresented: $showCommentSheet) {
            IssueCommentSheet(
                owner: owner, repo: repo, number: number,
                onSuccess: { Task { await load(refresh: true) } }
            )
        }
        .sheet(isPresented: $showCloseSheet) {
            CloseIssueSheet(
                owner: owner, repo: repo, number: number,
                onSuccess: { Task { await load(refresh: true) } }
            )
        }
        .confirmationDialog("Close Issue", isPresented: $showCloseConfirm, titleVisibility: .visible) {
            Button("Close", role: .destructive) { Task { await closeWithoutComment() } }
            Button("Close with comment...") { showCloseSheet = true }
        }
        .confirmationDialog("Reopen Issue", isPresented: $showReopenConfirm, titleVisibility: .visible) {
            Button("Reopen") { Task { await reopen() } }
        }
```

- [ ] **Step 4: Add the actionBar computed property**

Add this after the `commentsSection` function and before the `// MARK: - Loading` section:

```swift
    // MARK: - Action Bar

    @ViewBuilder
    private func actionBar(for issue: GitHubIssue) -> some View {
        if issue.isOpen {
            HStack(spacing: 16) {
                Button {
                    showCommentSheet = true
                } label: {
                    Label("Comment", systemImage: "bubble.left")
                }

                Button {
                    showCloseConfirm = true
                } label: {
                    if isClosing {
                        ProgressView().controlSize(.small)
                    } else {
                        Label("Close", systemImage: "xmark.circle")
                    }
                }
                .tint(.red)
                .disabled(isClosing)
            }
            .labelStyle(.titleAndIcon)
            .font(.caption)
            .padding()
            .background(.bar)
        } else {
            HStack {
                Button {
                    showReopenConfirm = true
                } label: {
                    if isReopening {
                        ProgressView().controlSize(.small)
                    } else {
                        Label("Reopen", systemImage: "arrow.uturn.backward.circle")
                    }
                }
                .tint(.green)
                .disabled(isReopening)
            }
            .labelStyle(.titleAndIcon)
            .font(.caption)
            .padding()
            .background(.bar)
        }
    }
```

- [ ] **Step 5: Add action functions**

Add these after the existing `load` function:

```swift
    private func closeWithoutComment() async {
        isClosing = true
        actionError = nil
        do {
            let body = IssueStateRequestBody(state: "closed", comment: nil)
            let response = try await api.updateIssueState(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await load(refresh: true)
            } else {
                actionError = response.error ?? "Failed to close issue"
            }
        } catch {
            actionError = error.localizedDescription
        }
        isClosing = false
    }

    private func reopen() async {
        isReopening = true
        actionError = nil
        do {
            let body = IssueStateRequestBody(state: "open", comment: nil)
            let response = try await api.updateIssueState(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await load(refresh: true)
            } else {
                actionError = response.error ?? "Failed to reopen issue"
            }
        } catch {
            actionError = error.localizedDescription
        }
        isReopening = false
    }
```

- [ ] **Step 6: Commit**

```bash
cd /Users/neonwatty/Desktop/issuectl-ios
git add IssueCTL/Views/Issues/IssueDetailView.swift
git commit -m "feat(ios): add action bar with close/reopen and comment to IssueDetailView"
```

---

### Task 8: Register new Swift files in Xcode project

**Files:**
- Modify: `IssueCTL.xcodeproj/project.pbxproj`

The two new files (`IssueCommentSheet.swift`, `CloseIssueSheet.swift`) must be registered in four sections of `project.pbxproj`:

1. `PBXBuildFile` — links file ref to build phase
2. `PBXFileReference` — declares the file
3. `PBXGroup` — adds to the Issues group
4. `PBXSourcesBuildPhase` — includes in compilation

- [ ] **Step 1: Generate unique IDs and add to PBXBuildFile**

Use these IDs:
- `IssueCommentSheet.swift`: fileRef `FF1A2B3C4D5E6F7A8B9C0D1E`, buildFile `GG1A2B3C4D5E6F7A8B9C0D1E`
- `CloseIssueSheet.swift`: fileRef `FF2A3B4C5D6E7F8A9B0C1D2E`, buildFile `GG2A3B4C5D6E7F8A9B0C1D2E`

In the `/* Begin PBXBuildFile section */`, add:

```
		GG1A2B3C4D5E6F7A8B9C0D1E /* IssueCommentSheet.swift in Sources */ = {isa = PBXBuildFile; fileRef = FF1A2B3C4D5E6F7A8B9C0D1E /* IssueCommentSheet.swift */; };
		GG2A3B4C5D6E7F8A9B0C1D2E /* CloseIssueSheet.swift in Sources */ = {isa = PBXBuildFile; fileRef = FF2A3B4C5D6E7F8A9B0C1D2E /* CloseIssueSheet.swift */; };
```

- [ ] **Step 2: Add to PBXFileReference**

In the `/* Begin PBXFileReference section */`, add:

```
		FF1A2B3C4D5E6F7A8B9C0D1E /* IssueCommentSheet.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = IssueCommentSheet.swift; sourceTree = "<group>"; };
		FF2A3B4C5D6E7F8A9B0C1D2E /* CloseIssueSheet.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = CloseIssueSheet.swift; sourceTree = "<group>"; };
```

- [ ] **Step 3: Add to PBXGroup (Issues group)**

Find the Issues group in the `/* Begin PBXGroup section */` (the group containing `IssueDetailView.swift`, `IssueListView.swift`, etc.). Add the two new file references to its `children` array:

```
				FF1A2B3C4D5E6F7A8B9C0D1E /* IssueCommentSheet.swift */,
				FF2A3B4C5D6E7F8A9B0C1D2E /* CloseIssueSheet.swift */,
```

- [ ] **Step 4: Add to PBXSourcesBuildPhase**

In the `/* Begin PBXSourcesBuildPhase section */`, add to the `files` array:

```
				GG1A2B3C4D5E6F7A8B9C0D1E /* IssueCommentSheet.swift in Sources */,
				GG2A3B4C5D6E7F8A9B0C1D2E /* CloseIssueSheet.swift in Sources */,
```

- [ ] **Step 5: Build iOS project**

Run Xcode build via XcodeBuildMCP `build_sim` to verify the project compiles with new files registered.
Expected: BUILD SUCCEEDED

- [ ] **Step 6: Commit**

```bash
cd /Users/neonwatty/Desktop/issuectl-ios
git add IssueCTL.xcodeproj/project.pbxproj
git commit -m "chore(ios): register IssueCommentSheet and CloseIssueSheet in Xcode project"
```

---

### Task 9: Final typecheck, build verification, push, and PR

**Files:**
- No files modified — verification only

- [ ] **Step 1: Server typecheck**

Run: `cd /Users/neonwatty/Desktop/issuectl/.claude/worktrees/phase-4-ios-issue-actions && pnpm turbo typecheck`
Expected: PASS — 4/4 tasks, 0 errors

- [ ] **Step 2: iOS build**

Run Xcode build via XcodeBuildMCP `build_sim`.
Expected: BUILD SUCCEEDED

- [ ] **Step 3: Push server branch**

```bash
cd /Users/neonwatty/Desktop/issuectl/.claude/worktrees/phase-4-ios-issue-actions
git push origin phase-4-ios-issue-actions
```

- [ ] **Step 4: Push iOS to main**

```bash
cd /Users/neonwatty/Desktop/issuectl-ios
git push origin main
```

- [ ] **Step 5: Run PR review toolkit on server changes**

Run `/pr-review-toolkit:review-pr all` on the server-side changes. Fix all critical and important findings before creating the PR.

- [ ] **Step 6: Create server PR**

```bash
cd /Users/neonwatty/Desktop/issuectl/.claude/worktrees/phase-4-ios-issue-actions
gh pr create --title "feat(ios): Phase 4 — issue close/reopen and comment actions" --body "$(cat <<'EOF'
## Summary

- Add `reopenIssue` core function alongside existing `closeIssue`
- Add `POST .../state` endpoint for close/reopen with optional comment
- Add `POST .../comments` endpoint for issue comments
- Design spec and implementation plan in `docs/superpowers/`

Companion iOS changes: SwiftUI action bar (comment, close with confirmation, reopen), IssueCommentSheet, CloseIssueSheet with optional closing comment, API client methods.

## Test plan

- [ ] `pnpm turbo typecheck` — 0 errors
- [ ] PR review toolkit — all findings addressed
- [ ] Manual test: close an issue via iOS
- [ ] Manual test: reopen an issue via iOS
- [ ] Manual test: close with comment via iOS
- [ ] Manual test: add a comment via iOS
EOF
)" --base main # reviewed
```
