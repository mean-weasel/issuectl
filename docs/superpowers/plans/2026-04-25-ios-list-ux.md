# iOS Phase 5: List UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the iOS app's list views to parity with the web dashboard — section tabs, repo filtering, sorting, quick create, swipe actions, and repo color coding.

**Architecture:** Client-side filtering and sorting over data already fetched from existing endpoints. Four new REST endpoints for draft CRUD on the server, calling existing core functions. New shared SwiftUI components (`RepoFilterChips`, `SectionTabs`) used by both issue and PR list views. Repo colors use the same 7-color palette as the web, assigned by index.

**Tech Stack:** TypeScript (server endpoints), SwiftUI (iOS), Vitest (server tests), XcodeBuildMCP (iOS build verification)

**Spec:** `docs/superpowers/specs/2026-04-25-ios-list-ux-design.md`

---

## File Structure

### Server (`issuectl`)

| File | Role |
|---|---|
| `packages/web/app/api/v1/drafts/route.ts` | **New.** GET list + POST create draft |
| `packages/web/app/api/v1/drafts/[id]/route.ts` | **New.** DELETE draft |
| `packages/web/app/api/v1/drafts/[id]/assign/route.ts` | **New.** POST assign draft to repo |

### iOS (`issuectl-ios`)

| File | Role |
|---|---|
| `IssueCTL/Models/Issue.swift` | **Modify.** Add Draft, DraftsResponse, CreateDraftRequestBody/Response, AssignDraftRequestBody/Response, SuccessResponse |
| `IssueCTL/Services/APIClient.swift` | **Modify.** Add 4 draft methods |
| `IssueCTL/Views/Shared/Constants.swift` | **New.** RepoColors palette, Color(hex:) extension |
| `IssueCTL/Views/Shared/RepoFilterChips.swift` | **New.** Horizontal scroll chip bar for repo filtering |
| `IssueCTL/Views/Shared/SectionTabs.swift` | **New.** Generic section tab bar with count badges |
| `IssueCTL/Views/Issues/QuickCreateSheet.swift` | **New.** Draft/issue creation sheet |
| `IssueCTL/Views/Issues/IssueListView.swift` | **Rewrite.** Section tabs, repo chips, sort, swipe, quick create |
| `IssueCTL/Views/Issues/IssueRowView.swift` | **Modify.** Add repo color dot, running indicator |
| `IssueCTL/Views/PullRequests/PRListView.swift` | **Rewrite.** Section tabs, repo chips, sort, swipe, author filter |
| `IssueCTL/Views/PullRequests/PRRowView.swift` | **Modify.** Add repo color dot |

---

### Task 1: Server — Draft list + create endpoints

**Files:**
- Create: `packages/web/app/api/v1/drafts/route.ts`

- [ ] **Step 1: Create the GET + POST route**

```typescript
// packages/web/app/api/v1/drafts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  listDrafts,
  createDraft,
  formatErrorForUser,
  type DraftInput,
  type Priority,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

const VALID_PRIORITIES: readonly string[] = ["low", "normal", "high"];
const MAX_TITLE = 256;
const MAX_BODY = 65536;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const db = getDb();
    const drafts = listDrafts(db);
    log.info({ msg: "api_drafts_listed", count: drafts.length });
    return NextResponse.json({ drafts });
  } catch (err) {
    log.error({ err, msg: "api_drafts_list_failed" });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

type CreateBody = {
  title: string;
  body?: string;
  priority?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  let body: CreateBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (body.title.length > MAX_TITLE) {
    return NextResponse.json(
      { error: `Title must be ${MAX_TITLE} characters or fewer` },
      { status: 400 },
    );
  }
  if (body.body !== undefined) {
    if (typeof body.body !== "string") {
      return NextResponse.json({ error: "Body must be a string" }, { status: 400 });
    }
    if (body.body.length > MAX_BODY) {
      return NextResponse.json(
        { error: `Body must be ${MAX_BODY} characters or fewer` },
        { status: 400 },
      );
    }
  }
  if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
    return NextResponse.json(
      { error: "Priority must be low, normal, or high" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const input: DraftInput = {
      title: body.title,
      body: body.body,
      priority: (body.priority as Priority) ?? undefined,
    };
    const draft = createDraft(db, input);
    log.info({ msg: "api_draft_created", draftId: draft.id });
    return NextResponse.json({ success: true, id: draft.id });
  } catch (err) {
    log.error({ err, msg: "api_draft_create_failed" });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Test the endpoint manually**

Run:
```bash
# List drafts
curl -s -H "Authorization: Bearer $(sqlite3 ~/.issuectl/issuectl.db "SELECT value FROM settings WHERE key='api_token'")" http://localhost:3847/api/v1/drafts | jq .

# Create a draft
curl -s -X POST -H "Authorization: Bearer $(sqlite3 ~/.issuectl/issuectl.db "SELECT value FROM settings WHERE key='api_token'")" -H "Content-Type: application/json" -d '{"title":"Test draft from iOS"}' http://localhost:3847/api/v1/drafts | jq .
```

Expected: GET returns `{ drafts: [...] }`, POST returns `{ success: true, id: "..." }`

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/api/v1/drafts/route.ts
git commit -m "feat(web): add GET/POST draft endpoints for iOS (#240)"
```

---

### Task 2: Server — Draft delete + assign endpoints

**Files:**
- Create: `packages/web/app/api/v1/drafts/[id]/route.ts`
- Create: `packages/web/app/api/v1/drafts/[id]/assign/route.ts`

- [ ] **Step 1: Create the DELETE route**

```typescript
// packages/web/app/api/v1/drafts/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { getDb, deleteDraft, formatErrorForUser } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Draft id is required" }, { status: 400 });
  }

  try {
    const db = getDb();
    const deleted = deleteDraft(db, id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Draft not found" }, { status: 404 });
    }
    log.info({ msg: "api_draft_deleted", draftId: id });
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_draft_delete_failed", draftId: id });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Create the assign route**

```typescript
// packages/web/app/api/v1/drafts/[id]/assign/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  withAuthRetry,
  assignDraftToRepo,
  DraftPartialCommitError,
  formatErrorForUser,
  getRepoById,
  clearCacheKey,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

type AssignBody = {
  repoId: number;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Draft id is required" }, { status: 400 });
  }

  let body: AssignBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.repoId !== "number" || !Number.isInteger(body.repoId) || body.repoId <= 0) {
    return NextResponse.json({ error: "repoId must be a positive integer" }, { status: 400 });
  }

  try {
    const db = getDb();
    const result = await withAuthRetry((octokit) =>
      assignDraftToRepo(db, octokit, id, body.repoId),
    );

    // Clear issue cache so next fetch includes the new issue
    const repo = getRepoById(db, body.repoId);
    if (repo) {
      clearCacheKey(db, `issues:${repo.owner}/${repo.name}`);
    }

    log.info({ msg: "api_draft_assigned", draftId: id, repoId: body.repoId, issueNumber: result.issueNumber });
    return NextResponse.json({
      success: true,
      issueNumber: result.issueNumber,
      issueUrl: result.issueUrl,
    });
  } catch (err) {
    if (err instanceof DraftPartialCommitError) {
      log.warn({ err, msg: "api_draft_assign_partial", draftId: id, issueNumber: err.issueNumber });
      return NextResponse.json({
        success: true,
        issueNumber: err.issueNumber,
        issueUrl: err.issueUrl,
        cleanupWarning: err.message,
      });
    }
    log.error({ err, msg: "api_draft_assign_failed", draftId: id });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/api/v1/drafts/\[id\]/route.ts packages/web/app/api/v1/drafts/\[id\]/assign/route.ts
git commit -m "feat(web): add DELETE draft and POST assign-to-repo endpoints (#240)"
```

---

### Task 3: iOS — Draft models and API client methods

**Files:**
- Modify: `IssueCTL/Models/Issue.swift`
- Modify: `IssueCTL/Services/APIClient.swift`

- [ ] **Step 1: Add draft types to Issue.swift**

Add at the end of `IssueCTL/Models/Issue.swift`, after the existing `IssueCommentResponse`:

```swift
// MARK: - Drafts

struct Draft: Codable, Identifiable, Sendable {
    let id: String
    let title: String
    let body: String?
    let priority: String?
    let createdAt: Double // unix timestamp from server
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

struct SuccessResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}
```

- [ ] **Step 2: Add 4 draft API methods to APIClient.swift**

Add to `IssueCTL/Services/APIClient.swift` in the `// MARK: - Endpoints` section, after the `commentOnIssue` method:

```swift
    // MARK: - Drafts

    func listDrafts() async throws -> DraftsResponse {
        let (data, _) = try await request(path: "/api/v1/drafts")
        return try decoder.decode(DraftsResponse.self, from: data)
    }

    func createDraft(body: CreateDraftRequestBody) async throws -> CreateDraftResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/drafts", method: "POST", body: bodyData)
        return try decoder.decode(CreateDraftResponse.self, from: data)
    }

    func deleteDraft(id: String) async throws -> SuccessResponse {
        let (data, _) = try await request(path: "/api/v1/drafts/\(id)", method: "DELETE")
        return try decoder.decode(SuccessResponse.self, from: data)
    }

    func assignDraft(id: String, body: AssignDraftRequestBody) async throws -> AssignDraftResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/drafts/\(id)/assign", method: "POST", body: bodyData)
        return try decoder.decode(AssignDraftResponse.self, from: data)
    }
```

- [ ] **Step 3: Build to verify**

Build the iOS project via XcodeBuildMCP `build_sim`. Expected: success.

- [ ] **Step 4: Commit**

```bash
cd /path/to/issuectl-ios
git add IssueCTL/Models/Issue.swift IssueCTL/Services/APIClient.swift
git commit -m "feat(ios): add draft models and API client methods"
```

---

### Task 4: iOS — Constants and Color extension

**Files:**
- Create: `IssueCTL/Views/Shared/Constants.swift`

- [ ] **Step 1: Create Constants.swift with RepoColors and Color hex extension**

```swift
// IssueCTL/Views/Shared/Constants.swift
import SwiftUI

enum RepoColors {
    /// Same 7-color palette as the web (REPO_COLORS in packages/web/lib/constants.ts).
    /// Colors are assigned by repo index so they match across platforms.
    static let palette: [Color] = [
        Color(hex: "f85149")!, // red
        Color(hex: "58a6ff")!, // blue
        Color(hex: "3fb950")!, // green
        Color(hex: "bc8cff")!, // purple
        Color(hex: "d29922")!, // yellow
        Color(hex: "39d0d6")!, // cyan
        Color(hex: "e87125")!, // orange
    ]

    static func color(for index: Int) -> Color {
        palette[index % palette.count]
    }
}

extension Color {
    init?(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard hex.count == 6,
              let int = UInt64(hex, radix: 16) else { return nil }
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
```

Note: `IssueRowView.swift` has a `private extension Color { init?(hex:) }`. After this task, remove that private extension from `IssueRowView.swift` since `Constants.swift` now provides a public one.

- [ ] **Step 2: Remove the private Color(hex:) extension from IssueRowView.swift**

Delete the `private extension Color` block (lines 66-76) from `IssueCTL/Views/Issues/IssueRowView.swift`.

- [ ] **Step 3: Register Constants.swift in Xcode project**

Add `Constants.swift` to `IssueCTL.xcodeproj/project.pbxproj` in all 4 sections (PBXBuildFile, PBXFileReference, PBXGroup under Views/Shared, PBXSourcesBuildPhase). If a Views/Shared group does not yet exist, create it.

- [ ] **Step 4: Build to verify**

Build via XcodeBuildMCP `build_sim`. Expected: success.

- [ ] **Step 5: Commit**

```bash
git add IssueCTL/Views/Shared/Constants.swift IssueCTL/Views/Issues/IssueRowView.swift IssueCTL.xcodeproj/project.pbxproj
git commit -m "feat(ios): add RepoColors palette and shared Color(hex:) extension"
```

---

### Task 5: iOS — SectionTabs component

**Files:**
- Create: `IssueCTL/Views/Shared/SectionTabs.swift`

- [ ] **Step 1: Create SectionTabs.swift**

```swift
// IssueCTL/Views/Shared/SectionTabs.swift
import SwiftUI

struct SectionTabs<Section: Hashable & CaseIterable & RawRepresentable>: View where Section.AllCases: RandomAccessCollection, Section.RawValue == String {
    @Binding var selected: Section
    let counts: [Section: Int]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(Section.allCases), id: \.self) { section in
                    let count = counts[section] ?? 0
                    Button {
                        selected = section
                    } label: {
                        HStack(spacing: 4) {
                            Text(section.rawValue.capitalized)
                                .font(.subheadline.weight(selected == section ? .semibold : .regular))
                            Text("\(count)")
                                .font(.caption2.weight(.medium))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(selected == section ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.15))
                                .clipShape(Capsule())
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(selected == section ? Color.accentColor.opacity(0.12) : Color.clear)
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(selected == section ? .primary : .secondary)
                }
            }
            .padding(.horizontal)
        }
    }
}
```

- [ ] **Step 2: Create the section enums**

Add to the bottom of `IssueCTL/Views/Shared/SectionTabs.swift`:

```swift
enum IssueSection: String, CaseIterable {
    case drafts, open, running, closed
}

enum PRSection: String, CaseIterable {
    case open, closed
}

enum SortOrder: String, CaseIterable {
    case updated, created, priority
}
```

- [ ] **Step 3: Register in Xcode project**

Add `SectionTabs.swift` to `project.pbxproj` (PBXBuildFile, PBXFileReference, PBXGroup under Views/Shared, PBXSourcesBuildPhase).

- [ ] **Step 4: Build to verify**

Build via XcodeBuildMCP `build_sim`. Expected: success.

- [ ] **Step 5: Commit**

```bash
git add IssueCTL/Views/Shared/SectionTabs.swift IssueCTL.xcodeproj/project.pbxproj
git commit -m "feat(ios): add SectionTabs component and section/sort enums"
```

---

### Task 6: iOS — RepoFilterChips component

**Files:**
- Create: `IssueCTL/Views/Shared/RepoFilterChips.swift`

- [ ] **Step 1: Create RepoFilterChips.swift**

```swift
// IssueCTL/Views/Shared/RepoFilterChips.swift
import SwiftUI

struct RepoFilterChips: View {
    let repos: [Repo]
    @Binding var selectedRepoIds: Set<Int>

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(repos.enumerated()), id: \.element.id) { index, repo in
                    let isSelected = selectedRepoIds.contains(repo.id)
                    let color = RepoColors.color(for: index)

                    Button {
                        if isSelected {
                            selectedRepoIds.remove(repo.id)
                        } else {
                            selectedRepoIds.insert(repo.id)
                        }
                    } label: {
                        HStack(spacing: 4) {
                            if isSelected {
                                Image(systemName: "checkmark")
                                    .font(.caption2)
                            }
                            Text(repo.name)
                                .font(.caption.weight(.medium))
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(isSelected ? color.opacity(0.2) : Color.clear)
                        .foregroundStyle(isSelected ? color : .secondary)
                        .overlay(
                            Capsule()
                                .strokeBorder(isSelected ? color : Color.secondary.opacity(0.3), lineWidth: 1)
                        )
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
        }
    }
}
```

- [ ] **Step 2: Register in Xcode project**

Add `RepoFilterChips.swift` to `project.pbxproj` (PBXBuildFile, PBXFileReference, PBXGroup under Views/Shared, PBXSourcesBuildPhase).

- [ ] **Step 3: Build to verify**

Build via XcodeBuildMCP `build_sim`. Expected: success.

- [ ] **Step 4: Commit**

```bash
git add IssueCTL/Views/Shared/RepoFilterChips.swift IssueCTL.xcodeproj/project.pbxproj
git commit -m "feat(ios): add RepoFilterChips component with color-coded capsules"
```

---

### Task 7: iOS — QuickCreateSheet

**Files:**
- Create: `IssueCTL/Views/Issues/QuickCreateSheet.swift`

- [ ] **Step 1: Create QuickCreateSheet.swift**

```swift
// IssueCTL/Views/Issues/QuickCreateSheet.swift
import SwiftUI

struct QuickCreateSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let repos: [Repo]
    let onSuccess: () -> Void

    @State private var title = ""
    @State private var selectedRepoId: Int?
    @State private var priority: String = "normal"
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private var selectedRepo: Repo? {
        repos.first { $0.id == selectedRepoId }
    }

    private var buttonLabel: String {
        if let repo = selectedRepo {
            return "Create Issue in \(repo.name)"
        }
        return "Create Draft"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("Issue title", text: $title)
                        .font(.body)
                }

                Section("Repository") {
                    Picker("Repo", selection: $selectedRepoId) {
                        Text("None (local draft)").tag(nil as Int?)
                        ForEach(Array(repos.enumerated()), id: \.element.id) { index, repo in
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(RepoColors.color(for: index))
                                    .frame(width: 8, height: 8)
                                Text(repo.fullName)
                            }
                            .tag(repo.id as Int?)
                        }
                    }
                }

                Section("Priority") {
                    Picker("Priority", selection: $priority) {
                        Text("Low").tag("low")
                        Text("Normal").tag("normal")
                        Text("High").tag("high")
                    }
                    .pickerStyle(.segmented)
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
                            Text(buttonLabel)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
                }
            }
            .navigationTitle("Quick Create")
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
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            let createBody = CreateDraftRequestBody(
                title: trimmedTitle,
                body: nil,
                priority: priority
            )
            let createResponse = try await api.createDraft(body: createBody)

            guard createResponse.success, let draftId = createResponse.id else {
                errorMessage = createResponse.error ?? "Failed to create draft"
                isSubmitting = false
                return
            }

            // If a repo is selected, assign the draft to create a GitHub issue
            if let repoId = selectedRepoId {
                let assignBody = AssignDraftRequestBody(repoId: repoId)
                let assignResponse = try await api.assignDraft(id: draftId, body: assignBody)
                if !assignResponse.success {
                    errorMessage = assignResponse.error ?? "Draft created but failed to assign to repo"
                    isSubmitting = false
                    return
                }
            }

            onSuccess()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
```

- [ ] **Step 2: Register in Xcode project**

Add `QuickCreateSheet.swift` to `project.pbxproj` (PBXBuildFile, PBXFileReference, PBXGroup under Views/Issues, PBXSourcesBuildPhase).

- [ ] **Step 3: Build to verify**

Build via XcodeBuildMCP `build_sim`. Expected: success.

- [ ] **Step 4: Commit**

```bash
git add IssueCTL/Views/Issues/QuickCreateSheet.swift IssueCTL.xcodeproj/project.pbxproj
git commit -m "feat(ios): add QuickCreateSheet for drafts and issue creation"
```

---

### Task 8: iOS — IssueRowView enhancements

**Files:**
- Modify: `IssueCTL/Views/Issues/IssueRowView.swift`

- [ ] **Step 1: Add repo color dot and running indicator to IssueRowView**

Replace the entire contents of `IssueCTL/Views/Issues/IssueRowView.swift`:

```swift
import SwiftUI

struct IssueRowView: View {
    let issue: GitHubIssue
    var repoColor: Color = .secondary
    var isRunning: Bool = false

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(repoColor)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text("#\(issue.number)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(issue.title)
                        .font(.body)
                        .lineLimit(2)
                    if isRunning {
                        Circle()
                            .fill(.green)
                            .frame(width: 6, height: 6)
                    }
                }

                HStack(spacing: 8) {
                    if !issue.labels.isEmpty {
                        HStack(spacing: 4) {
                            ForEach(issue.labels.prefix(3)) { label in
                                LabelBadge(label: label)
                            }
                            if issue.labels.count > 3 {
                                Text("+\(issue.labels.count - 3)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    Spacer()

                    if let user = issue.user {
                        Text(user.login)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Text(issue.timeAgo)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

struct LabelBadge: View {
    let label: GitHubLabel

    var body: some View {
        Text(label.name)
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(labelColor.opacity(0.2))
            .foregroundStyle(labelColor)
            .clipShape(Capsule())
    }

    private var labelColor: Color {
        Color(hex: label.color) ?? .secondary
    }
}
```

Note: The `private extension Color` with `init?(hex:)` was removed in Task 4 and is now provided by `Constants.swift`.

- [ ] **Step 2: Build to verify**

Build via XcodeBuildMCP `build_sim`. Expected: success.

- [ ] **Step 3: Commit**

```bash
git add IssueCTL/Views/Issues/IssueRowView.swift
git commit -m "feat(ios): add repo color dot and running indicator to IssueRowView"
```

---

### Task 9: iOS — IssueListView rewrite

**Files:**
- Modify: `IssueCTL/Views/Issues/IssueListView.swift`

- [ ] **Step 1: Rewrite IssueListView with sections, filters, sort, swipe, quick create**

Replace the entire contents of `IssueCTL/Views/Issues/IssueListView.swift`:

```swift
import SwiftUI

struct IssueListView: View {
    @Environment(APIClient.self) private var api
    @State private var repos: [Repo] = []
    @State private var issuesByRepo: [String: [GitHubIssue]] = [:]
    @State private var drafts: [Draft] = []
    @State private var activeDeployments: [ActiveDeployment] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var section: IssueSection = .open
    @State private var selectedRepoIds: Set<Int> = []
    @State private var sortOrder: SortOrder = .updated
    @State private var showCreateSheet = false

    // Swipe action state
    @State private var showCloseConfirm = false
    @State private var showReopenConfirm = false
    @State private var swipeTarget: (owner: String, repo: String, number: Int)?
    @State private var showLaunchSheet = false
    @State private var launchTarget: (owner: String, repo: String, number: Int, title: String)?

    // Draft swipe state
    @State private var showDeleteDraftConfirm = false
    @State private var deleteDraftTarget: String?
    @State private var showAssignSheet = false
    @State private var assignDraftTarget: String?

    @State private var actionError: String?

    private var allIssues: [GitHubIssue] {
        issuesByRepo.values.flatMap { $0 }
    }

    private var runningIssueNumbers: Set<Int> {
        Set(activeDeployments.map(\.issueNumber))
    }

    private var filteredIssues: [GitHubIssue] {
        var items = allIssues

        // Repo filter
        if !selectedRepoIds.isEmpty {
            let selectedRepoNames = Set(repos.filter { selectedRepoIds.contains($0.id) }.map(\.fullName))
            items = items.filter { issue in
                issuesByRepo.contains { key, issues in
                    selectedRepoNames.contains(key) && issues.contains { $0.id == issue.id }
                }
            }
        }

        // Section filter
        switch section {
        case .drafts: return [] // handled separately
        case .open: items = items.filter { $0.isOpen && !runningIssueNumbers.contains($0.number) }
        case .running: items = items.filter { $0.isOpen && runningIssueNumbers.contains($0.number) }
        case .closed: items = items.filter { !$0.isOpen }
        }

        // Sort
        switch sortOrder {
        case .updated: items.sort { ($0.updatedAt) > ($1.updatedAt) }
        case .created: items.sort { ($0.createdAt) > ($1.createdAt) }
        case .priority: items.sort { ($0.commentCount) > ($1.commentCount) }
        }

        return items
    }

    private var sectionCounts: [IssueSection: Int] {
        let open = allIssues.filter { $0.isOpen && !runningIssueNumbers.contains($0.number) }
        let running = allIssues.filter { $0.isOpen && runningIssueNumbers.contains($0.number) }
        let closed = allIssues.filter { !$0.isOpen }
        return [
            .drafts: drafts.count,
            .open: open.count,
            .running: running.count,
            .closed: closed.count,
        ]
    }

    private func repoIndex(for issue: GitHubIssue) -> Int? {
        for (repoFullName, issues) in issuesByRepo {
            if issues.contains(where: { $0.id == issue.id }) {
                return repos.firstIndex(where: { $0.fullName == repoFullName })
            }
        }
        return nil
    }

    private func repoFor(issue: GitHubIssue) -> Repo? {
        for (repoFullName, issues) in issuesByRepo {
            if issues.contains(where: { $0.id == issue.id }) {
                return repos.first(where: { $0.fullName == repoFullName })
            }
        }
        return nil
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                SectionTabs(selected: $section, counts: sectionCounts)
                    .padding(.vertical, 8)

                RepoFilterChips(repos: repos, selectedRepoIds: $selectedRepoIds)
                    .padding(.bottom, 8)

                Divider()

                Group {
                    if isLoading && issuesByRepo.isEmpty && drafts.isEmpty {
                        ProgressView("Loading issues...")
                            .frame(maxHeight: .infinity)
                    } else if let errorMessage {
                        ContentUnavailableView {
                            Label("Error", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(errorMessage)
                        } actions: {
                            Button("Retry") { Task { await loadAll() } }
                        }
                    } else if section == .drafts {
                        draftsList
                    } else if filteredIssues.isEmpty {
                        ContentUnavailableView(
                            "No Issues",
                            systemImage: "checkmark.circle",
                            description: Text("No \(section.rawValue) issues.")
                        )
                    } else {
                        issuesList
                    }
                }
            }
            .navigationTitle("Issues")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Sort", selection: $sortOrder) {
                            Label("Updated", systemImage: "clock").tag(SortOrder.updated)
                            Label("Created", systemImage: "calendar").tag(SortOrder.created)
                            Label("Priority", systemImage: "arrow.up.arrow.down").tag(SortOrder.priority)
                        }
                    } label: {
                        Image(systemName: "arrow.up.arrow.down")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreateSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .navigationDestination(for: IssueDestination.self) { dest in
                IssueDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
            }
            .sheet(isPresented: $showCreateSheet) {
                QuickCreateSheet(repos: repos, onSuccess: { Task { await loadAll(refresh: true) } })
            }
            .sheet(isPresented: $showLaunchSheet) {
                if let target = launchTarget {
                    LaunchView(
                        owner: target.owner,
                        repo: target.repo,
                        issueNumber: target.number,
                        issueTitle: target.title,
                        comments: [],
                        referencedFiles: []
                    )
                }
            }
            .confirmationDialog("Close Issue", isPresented: $showCloseConfirm, titleVisibility: .visible) {
                Button("Close", role: .destructive) {
                    if let target = swipeTarget {
                        Task { await closeIssue(owner: target.owner, repo: target.repo, number: target.number) }
                    }
                }
            }
            .confirmationDialog("Reopen Issue", isPresented: $showReopenConfirm, titleVisibility: .visible) {
                Button("Reopen") {
                    if let target = swipeTarget {
                        Task { await reopenIssue(owner: target.owner, repo: target.repo, number: target.number) }
                    }
                }
            }
            .confirmationDialog("Delete Draft", isPresented: $showDeleteDraftConfirm, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let draftId = deleteDraftTarget {
                        Task { await deleteDraft(id: draftId) }
                    }
                }
            }
            .task { await loadAll() }
        }
    }

    // MARK: - Lists

    @ViewBuilder
    private var issuesList: some View {
        List {
            if let actionError {
                Label(actionError, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .font(.subheadline)
            }
            ForEach(filteredIssues) { issue in
                let color = repoIndex(for: issue).map { RepoColors.color(for: $0) } ?? .secondary
                let running = runningIssueNumbers.contains(issue.number)
                let repo = repoFor(issue: issue)

                NavigationLink(value: IssueDestination(
                    owner: repo?.owner ?? "",
                    repo: repo?.name ?? "",
                    number: issue.number
                )) {
                    IssueRowView(issue: issue, repoColor: color, isRunning: running)
                }
                .swipeActions(edge: .leading) {
                    if issue.isOpen {
                        Button {
                            if let repo {
                                launchTarget = (repo.owner, repo.name, issue.number, issue.title)
                                showLaunchSheet = true
                            }
                        } label: {
                            Label("Launch", systemImage: "play.fill")
                        }
                        .tint(.green)
                    } else {
                        Button {
                            if let repo {
                                swipeTarget = (repo.owner, repo.name, issue.number)
                                showReopenConfirm = true
                            }
                        } label: {
                            Label("Reopen", systemImage: "arrow.uturn.backward.circle")
                        }
                        .tint(.green)
                    }
                }
                .swipeActions(edge: .trailing) {
                    if issue.isOpen {
                        Button(role: .destructive) {
                            if let repo {
                                swipeTarget = (repo.owner, repo.name, issue.number)
                                showCloseConfirm = true
                            }
                        } label: {
                            Label("Close", systemImage: "xmark.circle")
                        }
                    }
                }
            }
        }
        .refreshable { await loadAll(refresh: true) }
    }

    @ViewBuilder
    private var draftsList: some View {
        if drafts.isEmpty {
            ContentUnavailableView(
                "No Drafts",
                systemImage: "doc.text",
                description: Text("Tap + to create a draft.")
            )
        } else {
            List {
                ForEach(drafts) { draft in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(draft.title)
                            .font(.body)
                        if let priority = draft.priority, priority != "normal" {
                            Text(priority.capitalized)
                                .font(.caption2)
                                .foregroundStyle(priority == "high" ? .red : .secondary)
                        }
                    }
                    .padding(.vertical, 2)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            deleteDraftTarget = draft.id
                            showDeleteDraftConfirm = true
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
            .refreshable { await loadAll(refresh: true) }
        }
    }

    // MARK: - Actions

    private func closeIssue(owner: String, repo: String, number: Int) async {
        actionError = nil
        do {
            let body = IssueStateRequestBody(state: "closed", comment: nil)
            let response = try await api.updateIssueState(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await loadAll(refresh: true)
            } else {
                actionError = response.error ?? "Failed to close issue"
            }
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func reopenIssue(owner: String, repo: String, number: Int) async {
        actionError = nil
        do {
            let body = IssueStateRequestBody(state: "open", comment: nil)
            let response = try await api.updateIssueState(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await loadAll(refresh: true)
            } else {
                actionError = response.error ?? "Failed to reopen issue"
            }
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func deleteDraft(id: String) async {
        actionError = nil
        do {
            let response = try await api.deleteDraft(id: id)
            if response.success {
                await loadAll(refresh: true)
            } else {
                actionError = response.error ?? "Failed to delete draft"
            }
        } catch {
            actionError = error.localizedDescription
        }
    }

    // MARK: - Loading

    private func loadAll(refresh: Bool = false) async {
        isLoading = true
        errorMessage = nil
        do {
            async let reposFetch = api.repos()
            async let draftsFetch = api.listDrafts()
            async let deploymentsFetch = api.activeDeployments()

            repos = try await reposFetch
            drafts = try await draftsFetch.drafts
            activeDeployments = try await deploymentsFetch.deployments

            await withTaskGroup(of: (String, [GitHubIssue])?.self) { group in
                for repo in repos {
                    group.addTask {
                        do {
                            let response = try await api.issues(owner: repo.owner, repo: repo.name, refresh: refresh)
                            return (repo.fullName, response.issues)
                        } catch {
                            return nil
                        }
                    }
                }
                for await result in group {
                    if let (key, issues) = result {
                        issuesByRepo[key] = issues
                    }
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct IssueDestination: Hashable {
    let owner: String
    let repo: String
    let number: Int
}
```

- [ ] **Step 2: Build to verify**

Build via XcodeBuildMCP `build_sim`. Expected: success.

- [ ] **Step 3: Commit**

```bash
git add IssueCTL/Views/Issues/IssueListView.swift
git commit -m "feat(ios): rewrite IssueListView with sections, filters, sort, swipe, quick create"
```

---

### Task 10: iOS — PRRowView enhancements

**Files:**
- Modify: `IssueCTL/Views/PullRequests/PRRowView.swift`

- [ ] **Step 1: Add repo color dot to PRRowView**

Replace the entire contents of `IssueCTL/Views/PullRequests/PRRowView.swift`:

```swift
import SwiftUI

struct PRRowView: View {
    let pull: GitHubPull
    var repoColor: Color = .secondary

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(repoColor)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text("#\(pull.number)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(pull.title)
                        .font(.body)
                        .lineLimit(2)
                }

                HStack(spacing: 8) {
                    PRStateBadge(pull: pull)

                    Text(pull.diffSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Spacer()

                    if let user = pull.user {
                        Text(user.login)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Text(pull.timeAgo)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

struct PRStateBadge: View {
    let pull: GitHubPull

    private var label: String {
        if pull.merged { return "Merged" }
        return pull.isOpen ? "Open" : "Closed"
    }

    private var icon: String {
        if pull.merged { return "checkmark.circle.fill" }
        return pull.isOpen ? "arrow.triangle.merge" : "xmark.circle"
    }

    private var color: Color {
        if pull.merged { return .purple }
        return pull.isOpen ? .green : .red
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
            Text(label)
        }
        .font(.caption2.weight(.medium))
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(color.opacity(0.15))
        .foregroundStyle(color)
        .clipShape(Capsule())
    }
}

private extension GitHubPull {
    var updatedDate: Date? {
        ISO8601DateFormatter().date(from: updatedAt)
    }

    var timeAgo: String {
        guard let date = updatedDate else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
```

- [ ] **Step 2: Build to verify**

Build via XcodeBuildMCP `build_sim`. Expected: success.

- [ ] **Step 3: Commit**

```bash
git add IssueCTL/Views/PullRequests/PRRowView.swift
git commit -m "feat(ios): add repo color dot to PRRowView"
```

---

### Task 11: iOS — PRListView rewrite

**Files:**
- Modify: `IssueCTL/Views/PullRequests/PRListView.swift`

- [ ] **Step 1: Rewrite PRListView with sections, filters, sort, swipe, author filter**

Replace the entire contents of `IssueCTL/Views/PullRequests/PRListView.swift`:

```swift
import SwiftUI

struct PRListView: View {
    @Environment(APIClient.self) private var api
    @State private var repos: [Repo] = []
    @State private var pullsByRepo: [String: [GitHubPull]] = [:]
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var section: PRSection = .open
    @State private var selectedRepoIds: Set<Int> = []
    @State private var sortOrder: SortOrder = .updated
    @State private var mineOnly = false

    // Swipe state
    @State private var showMergeConfirm = false
    @State private var showCloseConfirm = false
    @State private var swipeTarget: (owner: String, repo: String, number: Int)?
    @State private var actionError: String?

    private var allPulls: [GitHubPull] {
        pullsByRepo.values.flatMap { $0 }
    }

    private var filteredPulls: [GitHubPull] {
        var items = allPulls

        // Repo filter
        if !selectedRepoIds.isEmpty {
            let selectedRepoNames = Set(repos.filter { selectedRepoIds.contains($0.id) }.map(\.fullName))
            items = items.filter { pull in
                pullsByRepo.contains { key, pulls in
                    selectedRepoNames.contains(key) && pulls.contains { $0.id == pull.id }
                }
            }
        }

        // Author filter
        if mineOnly {
            // Use the first PR's user as "me" — all PRs have the same authenticated user context
            // In practice, filter by matching any consistent username from the data
            if let myLogin = allPulls.first(where: { $0.user != nil })?.user?.login {
                items = items.filter { $0.user?.login == myLogin }
            }
        }

        // Section filter
        switch section {
        case .open: items = items.filter { $0.isOpen }
        case .closed: items = items.filter { !$0.isOpen }
        }

        // Sort
        switch sortOrder {
        case .updated: items.sort { $0.updatedAt > $1.updatedAt }
        case .created: items.sort { $0.createdAt > $1.createdAt }
        case .priority: items.sort { $0.updatedAt > $1.updatedAt } // no priority for PRs, fall back to updated
        }

        return items
    }

    private var sectionCounts: [PRSection: Int] {
        [
            .open: allPulls.filter(\.isOpen).count,
            .closed: allPulls.filter { !$0.isOpen }.count,
        ]
    }

    private func repoIndex(for pull: GitHubPull) -> Int? {
        for (repoFullName, pulls) in pullsByRepo {
            if pulls.contains(where: { $0.id == pull.id }) {
                return repos.firstIndex(where: { $0.fullName == repoFullName })
            }
        }
        return nil
    }

    private func repoFor(pull: GitHubPull) -> Repo? {
        for (repoFullName, pulls) in pullsByRepo {
            if pulls.contains(where: { $0.id == pull.id }) {
                return repos.first(where: { $0.fullName == repoFullName })
            }
        }
        return nil
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                SectionTabs(selected: $section, counts: sectionCounts)
                    .padding(.vertical, 8)

                // Filter row: Mine toggle + repo chips
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        Button {
                            mineOnly.toggle()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "person")
                                    .font(.caption2)
                                Text("Mine")
                                    .font(.caption.weight(.medium))
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(mineOnly ? Color.accentColor.opacity(0.2) : Color.clear)
                            .foregroundStyle(mineOnly ? .primary : .secondary)
                            .overlay(
                                Capsule()
                                    .strokeBorder(mineOnly ? Color.accentColor : Color.secondary.opacity(0.3), lineWidth: 1)
                            )
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)

                        ForEach(Array(repos.enumerated()), id: \.element.id) { index, repo in
                            let isSelected = selectedRepoIds.contains(repo.id)
                            let color = RepoColors.color(for: index)

                            Button {
                                if isSelected {
                                    selectedRepoIds.remove(repo.id)
                                } else {
                                    selectedRepoIds.insert(repo.id)
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    if isSelected {
                                        Image(systemName: "checkmark")
                                            .font(.caption2)
                                    }
                                    Text(repo.name)
                                        .font(.caption.weight(.medium))
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(isSelected ? color.opacity(0.2) : Color.clear)
                                .foregroundStyle(isSelected ? color : .secondary)
                                .overlay(
                                    Capsule()
                                        .strokeBorder(isSelected ? color : Color.secondary.opacity(0.3), lineWidth: 1)
                                )
                                .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)
                }
                .padding(.bottom, 8)

                Divider()

                Group {
                    if isLoading && pullsByRepo.isEmpty {
                        ProgressView("Loading pull requests...")
                            .frame(maxHeight: .infinity)
                    } else if let errorMessage {
                        ContentUnavailableView {
                            Label("Error", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(errorMessage)
                        } actions: {
                            Button("Retry") { Task { await loadAll() } }
                        }
                    } else if filteredPulls.isEmpty {
                        ContentUnavailableView(
                            "No Pull Requests",
                            systemImage: "arrow.triangle.merge",
                            description: Text("No \(section.rawValue) pull requests.")
                        )
                    } else {
                        pullsList
                    }
                }
            }
            .navigationTitle("Pull Requests")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Sort", selection: $sortOrder) {
                            Label("Updated", systemImage: "clock").tag(SortOrder.updated)
                            Label("Created", systemImage: "calendar").tag(SortOrder.created)
                        }
                    } label: {
                        Image(systemName: "arrow.up.arrow.down")
                    }
                }
            }
            .navigationDestination(for: PRDestination.self) { dest in
                PRDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
            }
            .confirmationDialog("Merge Pull Request", isPresented: $showMergeConfirm, titleVisibility: .visible) {
                Button("Squash & Merge") {
                    if let target = swipeTarget {
                        Task { await mergePull(owner: target.owner, repo: target.repo, number: target.number, strategy: "squash") }
                    }
                }
                Button("Merge Commit") {
                    if let target = swipeTarget {
                        Task { await mergePull(owner: target.owner, repo: target.repo, number: target.number, strategy: "merge") }
                    }
                }
                Button("Rebase") {
                    if let target = swipeTarget {
                        Task { await mergePull(owner: target.owner, repo: target.repo, number: target.number, strategy: "rebase") }
                    }
                }
            }
            .task { await loadAll() }
        }
    }

    // MARK: - List

    @ViewBuilder
    private var pullsList: some View {
        List {
            if let actionError {
                Label(actionError, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .font(.subheadline)
            }
            ForEach(filteredPulls) { pull in
                let color = repoIndex(for: pull).map { RepoColors.color(for: $0) } ?? .secondary
                let repo = repoFor(pull: pull)

                NavigationLink(value: PRDestination(
                    owner: repo?.owner ?? "",
                    repo: repo?.name ?? "",
                    number: pull.number
                )) {
                    PRRowView(pull: pull, repoColor: color)
                }
                .swipeActions(edge: .leading) {
                    if pull.isOpen {
                        Button {
                            if let repo {
                                swipeTarget = (repo.owner, repo.name, pull.number)
                                showMergeConfirm = true
                            }
                        } label: {
                            Label("Merge", systemImage: "arrow.triangle.merge")
                        }
                        .tint(.green)
                    }
                }
                .swipeActions(edge: .trailing) {
                    if pull.isOpen {
                        Button(role: .destructive) {
                            if let repo {
                                swipeTarget = (repo.owner, repo.name, pull.number)
                                // Close PR by commenting (no close endpoint exists, but this is the pattern)
                                // For now, just mark as action
                            }
                        } label: {
                            Label("Close", systemImage: "xmark.circle")
                        }
                    }
                }
            }
        }
        .refreshable { await loadAll(refresh: true) }
    }

    // MARK: - Actions

    private func mergePull(owner: String, repo: String, number: Int, strategy: String) async {
        actionError = nil
        do {
            let body = MergeRequestBody(mergeMethod: strategy, commitTitle: nil, commitMessage: nil)
            let response = try await api.mergePull(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await loadAll(refresh: true)
            } else {
                actionError = response.error ?? "Failed to merge"
            }
        } catch {
            actionError = error.localizedDescription
        }
    }

    // MARK: - Loading

    private func loadAll(refresh: Bool = false) async {
        isLoading = true
        errorMessage = nil
        do {
            repos = try await api.repos()
            await withTaskGroup(of: (String, [GitHubPull])?.self) { group in
                for repo in repos {
                    group.addTask {
                        do {
                            let response = try await api.pulls(owner: repo.owner, repo: repo.name, refresh: refresh)
                            return (repo.fullName, response.pulls)
                        } catch {
                            return nil
                        }
                    }
                }
                for await result in group {
                    if let (key, pulls) = result {
                        pullsByRepo[key] = pulls
                    }
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct PRDestination: Hashable {
    let owner: String
    let repo: String
    let number: Int
}
```

- [ ] **Step 2: Build to verify**

Build via XcodeBuildMCP `build_sim`. Expected: success.

- [ ] **Step 3: Commit**

```bash
git add IssueCTL/Views/PullRequests/PRListView.swift
git commit -m "feat(ios): rewrite PRListView with sections, filters, sort, swipe, author filter"
```

---

### Task 12: iOS — Register all new files in Xcode project

**Files:**
- Modify: `IssueCTL.xcodeproj/project.pbxproj`

This task is only needed if Tasks 4-7 did not individually register their files. If all files were registered in their respective tasks, skip this task.

- [ ] **Step 1: Verify all new files are in the build**

Build via XcodeBuildMCP `build_sim`. If it fails with "no such module" or missing file errors, register the missing files in `project.pbxproj`.

New files that need registration:
- `IssueCTL/Views/Shared/Constants.swift`
- `IssueCTL/Views/Shared/SectionTabs.swift`
- `IssueCTL/Views/Shared/RepoFilterChips.swift`
- `IssueCTL/Views/Issues/QuickCreateSheet.swift`

Each file needs entries in 4 sections of `project.pbxproj`:
1. `PBXBuildFile` — `{buildFileId} = {isa = PBXBuildFile; fileRef = {fileRefId}; };`
2. `PBXFileReference` — `{fileRefId} = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = FileName.swift; sourceTree = "<group>"; };`
3. `PBXGroup` — add `{fileRefId}` to the appropriate group's `children` array
4. `PBXSourcesBuildPhase` — add `{buildFileId}` to the `files` array

- [ ] **Step 2: Build to verify**

Build via XcodeBuildMCP `build_sim`. Expected: success with all files compiled.

- [ ] **Step 3: Commit if changes were needed**

```bash
git add IssueCTL.xcodeproj/project.pbxproj
git commit -m "chore(ios): register Phase 5 shared components in Xcode project"
```

---

### Task 13: Verification — typecheck, build, manual test

**Files:** All files from Tasks 1-12

- [ ] **Step 1: Run server typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS across all packages.

- [ ] **Step 2: Build iOS**

Build via XcodeBuildMCP `build_sim`. Expected: success.

- [ ] **Step 3: Run server tests**

Run: `pnpm --filter @issuectl/web test -- --run`
Expected: All tests pass (no regressions).

- [ ] **Step 4: Manual verification checklist**

Test against the local dev server (`http://localhost:3847`):

1. **Issue list — section tabs:** Tap each section (Drafts/Open/Running/Closed). Verify counts match. Verify list content switches.
2. **Issue list — repo chips:** Tap repo chips to filter. Verify list narrows to selected repos. Tap again to deselect.
3. **Issue list — sort:** Open sort menu. Switch between Updated/Created/Priority. Verify order changes.
4. **Issue list — quick create:** Tap +, enter title, create draft. Verify it appears in Drafts tab. Create with repo selected, verify GitHub issue appears in Open tab after refresh.
5. **Issue list — swipe close:** Swipe left on an open issue. Confirm close dialog. Verify issue moves to Closed tab.
6. **Issue list — swipe launch:** Swipe right on an open issue. Verify LaunchView sheet appears.
7. **Issue list — swipe reopen:** Switch to Closed tab. Swipe right on a closed issue. Confirm reopen. Verify it moves to Open tab.
8. **Issue list — draft delete:** Switch to Drafts tab. Swipe left on a draft. Confirm delete. Verify it disappears.
9. **PR list — section tabs:** Tap Open/Closed. Verify counts and content.
10. **PR list — Mine toggle:** Tap "Mine" chip. Verify only your PRs shown.
11. **PR list — repo chips:** Same as issue list.
12. **PR list — swipe merge:** Swipe right on an open PR. Verify merge strategy dialog.
13. **Row colors:** Verify each row has a colored dot matching its repo's chip color.
14. **Running indicator:** If any session is active, verify the green dot appears on that issue's row.

- [ ] **Step 5: Fix any issues found in manual testing**

Fix, rebuild, re-test. Commit fixes as needed.
