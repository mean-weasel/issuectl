# issuectl iOS App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native SwiftUI iOS app backed by a REST API layer on the existing issuectl server, enabling full issue triage, Claude Code session launching, terminal interaction, and push notifications from iPhone.

**Architecture:** Two-repo split. The existing `issuectl` monorepo gains REST API route handlers at `/api/v1/` alongside the existing Next.js dashboard. A new `issuectl-ios` repo contains the SwiftUI app that consumes these endpoints. The iOS app uses WKWebView only for terminal interaction; all other screens are native SwiftUI.

**Tech Stack:** SwiftUI (iOS 17+), Swift Concurrency (async/await), SwiftData (caching), WKWebView (terminal), Next.js Route Handlers (REST API), APNs HTTP/2 (push notifications)

**Spec:** `docs/superpowers/specs/2026-04-25-ios-app-design.md`

---

## Overview

The plan is organized into 5 phases matching the spec. Each phase delivers a usable app. **Phase 0 is fully detailed with bite-sized steps.** Phases 1–4 are structured at the task level with file lists and key code — they will be expanded to bite-sized steps when Phase 0 is complete and you're ready to begin them.

### Two-Repo Workflow

Work alternates between repos:

- **`issuectl` (existing)** — Server-side API endpoints. Build with `pnpm turbo build`, typecheck with `pnpm turbo typecheck`.
- **`issuectl-ios` (new)** — iOS app. Build and run with XcodeBuildMCP.

Each task below indicates which repo it targets.

---

## Phase 0: Foundation

**Goal:** Prove end-to-end connectivity — open the iOS app, enter a server URL, see tracked repos.

### File Map

**issuectl repo (server-side):**
```
packages/core/src/types.ts                          — Modify: add "api_token" to SettingKey
packages/core/src/db/settings.ts                    — Modify: add token generation helper
packages/core/src/index.ts                          — Modify: export new function
packages/web/lib/api-auth.ts                        — Create: bearer token validation middleware
packages/web/app/api/v1/health/route.ts             — Create: health check endpoint
packages/web/app/api/v1/repos/route.ts              — Create: repo list endpoint
packages/core/src/db/settings.test.ts               — Modify: add token tests
packages/web/lib/api-auth.test.ts                   — Create: auth middleware tests
```

**issuectl-ios repo:**
```
IssueCTL.xcodeproj                                  — Create: Xcode project (via Xcode)
IssueCTL/App/IssueCTLApp.swift                      — Create: app entry point
IssueCTL/App/ContentView.swift                      — Create: root tab view
IssueCTL/Models/Repo.swift                          — Create: Codable repo model
IssueCTL/Models/ServerHealth.swift                   — Create: health response model
IssueCTL/Services/APIClient.swift                    — Create: HTTP client with auth
IssueCTL/Services/KeychainService.swift              — Create: Keychain storage for token/URL
IssueCTL/Views/Onboarding/OnboardingView.swift       — Create: server setup screen
IssueCTL/Views/Repos/RepoListView.swift              — Create: repo list view
IssueCTL/Views/Settings/SettingsView.swift            — Create: settings tab
CLAUDE.md                                           — Create: project conventions
```

---

### Task 1: Add `api_token` to SettingKey and token generation

**Repo:** `issuectl`
**Files:**
- Modify: `packages/core/src/types.ts:10-15`
- Modify: `packages/core/src/db/settings.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/db/settings.test.ts`

- [ ] **Step 1: Write the failing test for generateApiToken**

```typescript
// In packages/core/src/db/settings.test.ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "../db/schema.js";
import { generateApiToken, getSetting, setSetting } from "../db/settings.js";

describe("generateApiToken", () => {
  function freshDb() {
    const db = new Database(":memory:");
    initSchema(db);
    return db;
  }

  it("generates and stores a 64-char hex token", () => {
    const db = freshDb();
    const token = generateApiToken(db);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(getSetting(db, "api_token")).toBe(token);
  });

  it("returns existing token if already set", () => {
    const db = freshDb();
    const first = generateApiToken(db);
    const second = generateApiToken(db);
    expect(second).toBe(first);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @issuectl/core test -- --run settings`
Expected: FAIL — `generateApiToken` is not exported, `api_token` is not a valid SettingKey

- [ ] **Step 3: Add `api_token` to SettingKey union**

In `packages/core/src/types.ts`, add `"api_token"` to the SettingKey union:

```typescript
export type SettingKey =
  | "branch_pattern"
  | "cache_ttl"
  | "worktree_dir"
  | "claude_extra_args"
  | "default_repo_id"
  | "api_token";
```

- [ ] **Step 4: Implement generateApiToken**

In `packages/core/src/db/settings.ts`, add:

```typescript
import { randomBytes } from "node:crypto";

export function generateApiToken(db: Database.Database): string {
  const existing = getSetting(db, "api_token");
  if (existing) return existing;

  const token = randomBytes(32).toString("hex");
  setSetting(db, "api_token", token);
  return token;
}
```

- [ ] **Step 5: Export from index.ts**

In `packages/core/src/index.ts`, add `generateApiToken` to the settings export block:

```typescript
export {
  getSetting,
  setSetting,
  getSettings,
  seedDefaults,
  generateApiToken,
} from "./db/settings.js";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @issuectl/core test -- --run settings`
Expected: PASS

- [ ] **Step 7: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/db/settings.ts packages/core/src/index.ts packages/core/src/db/settings.test.ts
git commit -m "feat(core): add api_token setting and token generation"
```

---

### Task 2: Create bearer token auth middleware

**Repo:** `issuectl`
**Files:**
- Create: `packages/web/lib/api-auth.ts`
- Create: `packages/web/lib/api-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/web/lib/api-auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @issuectl/core before importing the module under test
vi.mock("@issuectl/core", () => ({
  getDb: vi.fn(),
  getSetting: vi.fn(),
}));

import { validateApiToken } from "./api-auth.js";
import { getDb, getSetting } from "@issuectl/core";

describe("validateApiToken", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue({} as any);
  });

  it("returns true for a valid bearer token", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers({ Authorization: "Bearer abc123" });
    expect(validateApiToken(headers)).toBe(true);
  });

  it("returns false for a missing Authorization header", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers();
    expect(validateApiToken(headers)).toBe(false);
  });

  it("returns false for wrong token", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers({ Authorization: "Bearer wrong" });
    expect(validateApiToken(headers)).toBe(false);
  });

  it("returns false when no token is configured", () => {
    vi.mocked(getSetting).mockReturnValue(undefined);
    const headers = new Headers({ Authorization: "Bearer anything" });
    expect(validateApiToken(headers)).toBe(false);
  });

  it("ignores non-Bearer schemes", () => {
    vi.mocked(getSetting).mockReturnValue("abc123");
    const headers = new Headers({ Authorization: "Basic abc123" });
    expect(validateApiToken(headers)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @issuectl/web test -- --run api-auth`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement the auth middleware**

```typescript
// packages/web/lib/api-auth.ts
import { getDb, getSetting } from "@issuectl/core";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Validate a bearer token from request headers against the stored api_token.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function validateApiToken(headers: Headers): boolean {
  const authHeader = headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = authHeader.slice(7);
  const db = getDb();
  const stored = getSetting(db, "api_token");
  if (!stored) return false;

  // Timing-safe comparison — both must be the same length
  if (provided.length !== stored.length) return false;
  return timingSafeEqual(
    Buffer.from(provided),
    Buffer.from(stored),
  );
}

/**
 * Guard for API v1 route handlers. Returns a 401 response if auth fails,
 * or null if auth succeeds. Usage:
 *
 *   const denied = requireAuth(request);
 *   if (denied) return denied;
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  if (!validateApiToken(request.headers)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @issuectl/web test -- --run api-auth`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass

- [ ] **Step 6: Commit**

```bash
git add packages/web/lib/api-auth.ts packages/web/lib/api-auth.test.ts
git commit -m "feat(web): add bearer token auth middleware for API v1"
```

---

### Task 3: Create `/api/v1/health` endpoint

**Repo:** `issuectl`
**Files:**
- Create: `packages/web/app/api/v1/health/route.ts`

- [ ] **Step 1: Create the health endpoint**

```typescript
// packages/web/app/api/v1/health/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  return NextResponse.json({
    ok: true,
    version: process.env.npm_package_version ?? "0.0.0",
    timestamp: new Date().toISOString(),
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Manual test (dev server running)**

Run: `curl -s -H "Authorization: Bearer $(sqlite3 ~/.issuectl/issuectl.db "SELECT value FROM settings WHERE key='api_token'")" http://localhost:3847/api/v1/health | jq .`

Expected: `{ "ok": true, "version": "0.0.0", "timestamp": "..." }`

Verify auth rejection:
Run: `curl -s http://localhost:3847/api/v1/health`
Expected: `{ "error": "Unauthorized" }` with status 401

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/api/v1/health/route.ts
git commit -m "feat(web): add /api/v1/health endpoint"
```

---

### Task 4: Create `/api/v1/repos` endpoint

**Repo:** `issuectl`
**Files:**
- Create: `packages/web/app/api/v1/repos/route.ts`

- [ ] **Step 1: Create the repos endpoint**

```typescript
// packages/web/app/api/v1/repos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getDb, listRepos } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const db = getDb();
    const repos = listRepos(db);
    return NextResponse.json({ repos });
  } catch (err) {
    console.error("[issuectl] GET /api/v1/repos failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Manual test**

Run: `curl -s -H "Authorization: Bearer $(sqlite3 ~/.issuectl/issuectl.db "SELECT value FROM settings WHERE key='api_token'")" http://localhost:3847/api/v1/repos | jq .`

Expected: `{ "repos": [{ "id": 1, "owner": "...", "name": "...", ... }] }`

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/api/v1/repos/route.ts
git commit -m "feat(web): add /api/v1/repos endpoint"
```

---

### Task 5: Generate API token during init

**Repo:** `issuectl`
**Files:**
- Modify: `packages/cli/src/commands/init.ts`

- [ ] **Step 1: Read the current init command**

Read `packages/cli/src/commands/init.ts` to understand the initialization flow.

- [ ] **Step 2: Add token generation to init**

After `seedDefaults(db)` in the init flow, add:

```typescript
import { generateApiToken } from "@issuectl/core";

// After seedDefaults(db):
const token = generateApiToken(db);
console.log(chalk.green("API token generated for mobile access."));
console.log(chalk.dim(`Token: ${token}`));
console.log(chalk.dim("Use this token in the iOS app to connect."));
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/init.ts
git commit -m "feat(cli): generate API token during init"
```

---

### Task 6: Create the Xcode project (issuectl-ios repo)

**Repo:** `issuectl-ios` (NEW)

This task creates the new repository and Xcode project. The Xcode project must be created through Xcode (or `xcodebuild`) — it cannot be generated from files alone.

- [ ] **Step 1: Create the repo and initialize**

```bash
cd ~/Desktop
mkdir issuectl-ios
cd issuectl-ios
git init
```

- [ ] **Step 2: Create the Xcode project**

Open Xcode → File → New → Project → iOS → App
- Product Name: `IssueCTL`
- Team: (your Apple Developer account)
- Organization Identifier: `com.issuectl`
- Interface: SwiftUI
- Language: Swift
- Storage: SwiftData
- Minimum Deployment: iOS 17.0

Save into `~/Desktop/issuectl-ios/`

- [ ] **Step 3: Create CLAUDE.md**

```markdown
# issuectl-ios

Native SwiftUI iOS app for issuectl — a GitHub issue command center with Claude Code launch integration.

## Project overview

- **Target:** iOS 17+, iPhone only (universal binary, phone-optimized)
- **Architecture:** SwiftUI + Swift Concurrency (async/await)
- **Persistence:** SwiftData for local caching
- **Networking:** URLSession with async/await
- **Server:** Connects to issuectl server via REST API at `/api/v1/`

## Code conventions

- **SwiftUI only.** No UIKit unless absolutely necessary (WKWebView wrapper is the exception).
- **No third-party dependencies.** Use only Apple frameworks.
- **Async/await everywhere.** No completion handlers.
- **Functional style.** Prefer value types (structs, enums). Classes only for ObservableObject.
- **@Observable macro** for state management (iOS 17+), not ObservableObject.

## Build and run

Build and run via XcodeBuildMCP from Claude Code:
- `build_sim` — build for simulator
- `build_run_sim` — build and launch on simulator
- `screenshot` — capture current simulator state
- `test_sim` — run tests on simulator

## File organization

```
IssueCTL/
├── App/           # App entry point, root views
├── Models/        # Codable structs matching API responses
├── Services/      # APIClient, KeychainService, CacheService
├── Views/         # Organized by feature (Issues/, PRs/, etc.)
└── Resources/     # Assets, colors
```

## API connection

The app connects to a self-hosted issuectl server. The server URL and bearer token are configured on first launch and stored in Keychain. All API calls go through `APIClient`.
```

- [ ] **Step 4: Create .gitignore**

```
# Xcode
build/
DerivedData/
*.xcuserstate
*.xcworkspace/xcuserdata/

# Swift Package Manager
.build/
Packages/

# OS
.DS_Store
```

- [ ] **Step 5: Initial commit**

```bash
git add .
git commit -m "chore: initialize Xcode project with SwiftUI + SwiftData"
```

---

### Task 7: Create API models and APIClient

**Repo:** `issuectl-ios`
**Files:**
- Create: `IssueCTL/Models/ServerHealth.swift`
- Create: `IssueCTL/Models/Repo.swift`
- Create: `IssueCTL/Services/KeychainService.swift`
- Create: `IssueCTL/Services/APIClient.swift`

- [ ] **Step 1: Create ServerHealth model**

```swift
// IssueCTL/Models/ServerHealth.swift
import Foundation

struct ServerHealth: Codable {
    let ok: Bool
    let version: String
    let timestamp: String
}
```

- [ ] **Step 2: Create Repo model**

```swift
// IssueCTL/Models/Repo.swift
import Foundation

struct Repo: Codable, Identifiable {
    let id: Int
    let owner: String
    let name: String
    let localPath: String?
    let branchPattern: String?
    let createdAt: String

    var fullName: String { "\(owner)/\(name)" }
}

struct ReposResponse: Codable {
    let repos: [Repo]
}
```

- [ ] **Step 3: Create KeychainService**

```swift
// IssueCTL/Services/KeychainService.swift
import Foundation
import Security

enum KeychainService {
    private static let service = "com.issuectl.ios"

    static func save(key: String, value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]

        SecItemDelete(query as CFDictionary)

        var add = query
        add[kSecValueData as String] = data
        SecItemAdd(add as CFDictionary, nil)
    }

    static func load(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
```

- [ ] **Step 4: Create APIClient**

```swift
// IssueCTL/Services/APIClient.swift
import Foundation

@Observable
final class APIClient {
    var serverURL: String {
        didSet { KeychainService.save(key: "serverURL", value: serverURL) }
    }
    var apiToken: String {
        didSet { KeychainService.save(key: "apiToken", value: apiToken) }
    }
    var isConfigured: Bool {
        !serverURL.isEmpty && !apiToken.isEmpty
    }

    init() {
        self.serverURL = KeychainService.load(key: "serverURL") ?? ""
        self.apiToken = KeychainService.load(key: "apiToken") ?? ""
    }

    private var baseURL: URL? {
        URL(string: serverURL)
    }

    private func request(path: String, method: String = "GET", body: Data? = nil) async throws -> (Data, HTTPURLResponse) {
        guard let base = baseURL else {
            throw APIError.notConfigured
        }

        var urlRequest = URLRequest(url: base.appendingPathComponent(path))
        urlRequest.httpMethod = method
        urlRequest.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { urlRequest.httpBody = body }

        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }
        if httpResponse.statusCode >= 400 {
            let errorBody = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.serverError(httpResponse.statusCode, errorBody?.error ?? "Unknown error")
        }

        return (data, httpResponse)
    }

    // MARK: - Endpoints

    func health() async throws -> ServerHealth {
        let (data, _) = try await request(path: "/api/v1/health")
        return try decoder.decode(ServerHealth.self, from: data)
    }

    func repos() async throws -> [Repo] {
        let (data, _) = try await request(path: "/api/v1/repos")
        let response = try decoder.decode(ReposResponse.self, from: data)
        return response.repos
    }

    // MARK: - Private

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()
}

enum APIError: LocalizedError {
    case notConfigured
    case unauthorized
    case invalidResponse
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Server URL not configured"
        case .unauthorized: "Invalid API token"
        case .invalidResponse: "Invalid server response"
        case .serverError(let code, let message): "Server error (\(code)): \(message)"
        }
    }
}

private struct ErrorResponse: Codable {
    let error: String
}
```

- [ ] **Step 5: Build to verify compilation**

Run: XcodeBuildMCP `build_sim`
Expected: BUILD SUCCEEDED

- [ ] **Step 6: Commit**

```bash
git add IssueCTL/Models/ IssueCTL/Services/
git commit -m "feat: add API models, Keychain service, and APIClient"
```

---

### Task 8: Create onboarding view

**Repo:** `issuectl-ios`
**Files:**
- Create: `IssueCTL/Views/Onboarding/OnboardingView.swift`

- [ ] **Step 1: Create the onboarding screen**

```swift
// IssueCTL/Views/Onboarding/OnboardingView.swift
import SwiftUI

struct OnboardingView: View {
    @Environment(APIClient.self) private var api
    @State private var serverURL = ""
    @State private var apiToken = ""
    @State private var isChecking = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Connect to your issuectl server running on your Mac.")
                        .foregroundStyle(.secondary)
                }

                Section("Server URL") {
                    TextField("https://issuectl.example.com", text: $serverURL)
                        .textContentType(.URL)
                        .autocapitalization(.none)
                        .keyboardType(.URL)
                }

                Section("API Token") {
                    SecureField("Paste your API token", text: $apiToken)
                        .autocapitalization(.none)

                    Text("Run `issuectl init` on your Mac to generate a token.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        Task { await connect() }
                    } label: {
                        if isChecking {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Connect")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(serverURL.isEmpty || apiToken.isEmpty || isChecking)
                }
            }
            .navigationTitle("Setup")
        }
    }

    private func connect() async {
        isChecking = true
        error = nil

        // Normalize URL — strip trailing slash
        var url = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if url.hasSuffix("/") { url.removeLast() }
        // Add https:// if missing
        if !url.hasPrefix("http://") && !url.hasPrefix("https://") {
            url = "https://\(url)"
        }

        api.serverURL = url
        api.apiToken = apiToken.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            let health = try await api.health()
            if health.ok {
                // Success — the app will switch to main content
                // because api.isConfigured is now true
            }
        } catch {
            self.error = error.localizedDescription
            api.serverURL = ""
            api.apiToken = ""
        }

        isChecking = false
    }
}
```

- [ ] **Step 2: Build to verify**

Run: XcodeBuildMCP `build_sim`
Expected: BUILD SUCCEEDED

- [ ] **Step 3: Commit**

```bash
git add IssueCTL/Views/Onboarding/
git commit -m "feat: add server onboarding screen"
```

---

### Task 9: Create tab bar and repo list view

**Repo:** `issuectl-ios`
**Files:**
- Modify: `IssueCTL/App/ContentView.swift`
- Create: `IssueCTL/Views/Repos/RepoListView.swift`
- Create: `IssueCTL/Views/Settings/SettingsView.swift`
- Modify: `IssueCTL/App/IssueCTLApp.swift`

- [ ] **Step 1: Create RepoListView**

```swift
// IssueCTL/Views/Repos/RepoListView.swift
import SwiftUI

struct RepoListView: View {
    @Environment(APIClient.self) private var api
    @State private var repos: [Repo] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && repos.isEmpty {
                    ProgressView("Loading repos...")
                } else if let error {
                    ContentUnavailableView {
                        Label("Error", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Retry") { Task { await loadRepos() } }
                    }
                } else if repos.isEmpty {
                    ContentUnavailableView(
                        "No Repos",
                        systemImage: "folder",
                        description: Text("Add repos with `issuectl repo add` on your Mac.")
                    )
                } else {
                    List(repos) { repo in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(repo.fullName)
                                .font(.headline)
                            if let path = repo.localPath {
                                Text(path)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .refreshable { await loadRepos() }
                }
            }
            .navigationTitle("Repos")
            .task { await loadRepos() }
        }
    }

    private func loadRepos() async {
        isLoading = true
        error = nil
        do {
            repos = try await api.repos()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}
```

- [ ] **Step 2: Create SettingsView**

```swift
// IssueCTL/Views/Settings/SettingsView.swift
import SwiftUI

struct SettingsView: View {
    @Environment(APIClient.self) private var api
    @State private var showDisconnectConfirm = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    LabeledContent("URL", value: api.serverURL)
                    LabeledContent("Status") {
                        Label("Connected", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                }

                Section {
                    Button("Disconnect", role: .destructive) {
                        showDisconnectConfirm = true
                    }
                }
            }
            .navigationTitle("Settings")
            .confirmationDialog(
                "Disconnect from server?",
                isPresented: $showDisconnectConfirm,
                titleVisibility: .visible
            ) {
                Button("Disconnect", role: .destructive) {
                    api.serverURL = ""
                    api.apiToken = ""
                    KeychainService.delete(key: "serverURL")
                    KeychainService.delete(key: "apiToken")
                }
            }
        }
    }
}
```

- [ ] **Step 3: Update ContentView with tab bar**

```swift
// IssueCTL/App/ContentView.swift
import SwiftUI

struct ContentView: View {
    @Environment(APIClient.self) private var api

    var body: some View {
        if api.isConfigured {
            TabView {
                Tab("Issues", systemImage: "list.bullet") {
                    RepoListView() // Placeholder — will become IssueListView in Phase 1
                }
                Tab("PRs", systemImage: "arrow.triangle.merge") {
                    Text("Pull Requests") // Placeholder
                }
                Tab("Active", systemImage: "play.circle") {
                    Text("Active Sessions") // Placeholder
                }
                Tab("Settings", systemImage: "gearshape") {
                    SettingsView()
                }
            }
        } else {
            OnboardingView()
        }
    }
}
```

- [ ] **Step 4: Update IssueCTLApp to inject APIClient**

```swift
// IssueCTL/App/IssueCTLApp.swift
import SwiftUI
import SwiftData

@main
struct IssueCTLApp: App {
    @State private var apiClient = APIClient()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(apiClient)
        }
    }
}
```

- [ ] **Step 5: Build and run**

Run: XcodeBuildMCP `build_run_sim`
Expected: App launches on simulator. Shows onboarding screen.

- [ ] **Step 6: Take screenshot to verify**

Run: XcodeBuildMCP `screenshot`
Expected: Onboarding screen visible with server URL and token fields.

- [ ] **Step 7: Commit**

```bash
git add IssueCTL/
git commit -m "feat: add tab bar, repo list, settings, and root app wiring"
```

---

### Task 10: End-to-end connectivity test

**Repo:** Both — this is a manual integration test

- [ ] **Step 1: Ensure API token exists on server**

If you haven't run `issuectl init` since Task 1, generate a token manually:

```bash
# From the issuectl repo
node -e "
import('@issuectl/core').then(({ getDb, generateApiToken }) => {
  const db = getDb();
  const token = generateApiToken(db);
  console.log('API Token:', token);
  db.close();
})
"
```

Copy the token.

- [ ] **Step 2: Start the dev server**

Ensure `pnpm turbo dev` is running in the issuectl repo on port 3847.

- [ ] **Step 3: Run the iOS app on simulator**

Run: XcodeBuildMCP `build_run_sim`

- [ ] **Step 4: Configure the app**

In the simulator:
- Enter `http://localhost:3847` as the server URL
- Paste the API token
- Tap "Connect"

- [ ] **Step 5: Verify repo list**

Expected: The Issues tab shows a list of your tracked repos (the repo list view is a placeholder — it will become the issue list in Phase 1).

- [ ] **Step 6: Take screenshot**

Run: XcodeBuildMCP `screenshot`
Expected: Tab bar visible, repos loaded from server.

- [ ] **Step 7: Verify settings disconnect**

Tap Settings → Disconnect → confirm. App should return to onboarding.

---

## Phase 1: Read-Only Issues & PRs

**Goal:** Triage issues and review PRs entirely from the phone.

### Server-Side Tasks (issuectl repo)

### Task 11: Issue list endpoint

**Files:**
- Create: `packages/web/app/api/v1/issues/[owner]/[repo]/route.ts`

The endpoint wraps `getIssues()` from `@issuectl/core`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getDb, getRepo, getIssues, withAuthRetry } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo } = await params;
  const db = getDb();
  if (!getRepo(db, owner, repo)) {
    return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
  }

  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";
    const result = await withAuthRetry((octokit) =>
      getIssues(db, octokit, owner, repo, { forceRefresh }),
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[issuectl] GET /api/v1/issues/${owner}/${repo} failed:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

### Task 12: Issue detail endpoint

**Files:**
- Create: `packages/web/app/api/v1/issues/[owner]/[repo]/[number]/route.ts`

Wraps `getIssueDetail()`. Same pattern as Task 11 but with `number` param parsed as integer.

### Task 13: PR list endpoint

**Files:**
- Create: `packages/web/app/api/v1/pulls/[owner]/[repo]/route.ts`

Wraps `getPulls()`. Same pattern as Task 11.

### Task 14: PR detail endpoint

**Files:**
- Create: `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/route.ts`

Wraps `getPullDetail()`. Same pattern as Task 12.

### iOS Tasks (issuectl-ios repo)

### Task 15: Issue and PR models

**Files:**
- Create: `IssueCTL/Models/Issue.swift` — `GitHubIssue`, `GitHubLabel`, `GitHubUser`, `GitHubComment` Codable structs
- Create: `IssueCTL/Models/PullRequest.swift` — `GitHubPull`, `GitHubCheck`, `GitHubPullFile` Codable structs
- Create: `IssueCTL/Models/Deployment.swift` — `Deployment` Codable struct

All models mirror the core TypeScript types. Use `keyDecodingStrategy: .convertFromSnakeCase` on the shared decoder.

### Task 16: APIClient issue and PR methods

**Files:**
- Modify: `IssueCTL/Services/APIClient.swift`

Add methods:
- `func issues(owner: String, repo: String, refresh: Bool = false) async throws -> IssuesResponse`
- `func issueDetail(owner: String, repo: String, number: Int) async throws -> IssueDetailResponse`
- `func pulls(owner: String, repo: String) async throws -> PullsResponse`
- `func pullDetail(owner: String, repo: String, number: Int) async throws -> PullDetailResponse`

### Task 17: Issue list view

**Files:**
- Create: `IssueCTL/Views/Issues/IssueListView.swift`
- Create: `IssueCTL/Views/Issues/IssueRowView.swift`

List view grouped by repo (using data from `/api/v1/repos` to enumerate, then fetching issues per repo). Supports pull-to-refresh, filter by state (Open/Closed/All), and swipe actions (placeholder — wired in Phase 2).

### Task 18: Issue detail view

**Files:**
- Create: `IssueCTL/Views/Issues/IssueDetailView.swift`
- Create: `IssueCTL/Views/Issues/CommentView.swift`

Push-navigation from issue list. Renders:
- Header with title, state badge, labels, assignee
- Body as rendered markdown (`Text(AttributedString(markdown: body))`)
- Comments list
- Deployments section (display only in Phase 1)

### Task 19: PR list and detail views

**Files:**
- Create: `IssueCTL/Views/PullRequests/PRListView.swift`
- Create: `IssueCTL/Views/PullRequests/PRRowView.swift`
- Create: `IssueCTL/Views/PullRequests/PRDetailView.swift`

Same patterns as issue views. CI status shown as colored circle (green/red/yellow). Linked issue number tappable.

### Task 20: SWR caching layer

**Files:**
- Create: `IssueCTL/Services/CacheService.swift`

Uses SwiftData to persist API responses with timestamps. `APIClient` checks cache first, returns stale data immediately, fetches fresh in background, updates via `@Observable` properties. TTL logic mirrors server-side SWR.

### Task 21: Wire everything into tabs

**Files:**
- Modify: `IssueCTL/App/ContentView.swift`

Replace placeholder tab content with actual views. Issues tab gets `IssueListView`, PRs tab gets `PRListView`.

---

## Phase 2: Launch & Terminal

**Goal:** Full launch workflow from phone — find issue, launch Claude Code, watch terminal, end session.

### Server-Side Tasks (issuectl repo)

### Task 22: Active deployments endpoint

**Files:**
- Create: `packages/core/src/db/deployments.ts` — add `getActiveDeployments(db)` function
- Modify: `packages/core/src/index.ts` — export new function
- Create: `packages/web/app/api/v1/deployments/route.ts`

New core function to query all active (non-ended, non-pending) deployments across all repos, joined with repo data:

```typescript
export function getActiveDeployments(db: Database.Database): Array<Deployment & { owner: string; repoName: string }> {
  const rows = db.prepare(`
    SELECT d.*, r.owner, r.name as repo_name
    FROM deployments d
    JOIN repos r ON d.repo_id = r.id
    WHERE d.state = 'active' AND d.ended_at IS NULL
    ORDER BY d.launched_at DESC
  `).all() as Array<DeploymentRow & { owner: string; repo_name: string }>;
  return rows.map((row) => ({
    ...rowToDeployment(row),
    owner: row.owner,
    repoName: row.repo_name,
  }));
}
```

### Task 23: Launch endpoint

**Files:**
- Create: `packages/web/app/api/v1/launch/[owner]/[repo]/[number]/route.ts`

POST endpoint. Accepts JSON body matching `LaunchFormData` (minus `idempotencyKey` — generate server-side). Wraps the same logic as the `launchIssue` Server Action — validate inputs, call `executeLaunch`, return `{ deploymentId, ttydPort }`.

### Task 24: End session endpoint

**Files:**
- Create: `packages/web/app/api/v1/deployments/[id]/end/route.ts`

POST endpoint. Wraps `endSession` Server Action logic. Accepts `{ owner, repo, issueNumber }` in body for validation.

### iOS Tasks (issuectl-ios repo)

### Task 25: Active Sessions tab

**Files:**
- Create: `IssueCTL/Views/Sessions/SessionListView.swift`
- Create: `IssueCTL/Views/Sessions/SessionRowView.swift`

Live-updating list of active deployments. Auto-refreshes on a timer (~10s). Each row shows repo/issue, title, running duration (computed from `launchedAt`). Tap opens terminal, swipe to end session.

### Task 26: Terminal WKWebView

**Files:**
- Create: `IssueCTL/Views/Terminal/TerminalView.swift`

Full-screen modal with WKWebView loading `{serverURL}/api/terminal/{port}/`. Toolbar with session name, duration, end session button, dismiss.

### Task 27: Launch flow sheet

**Files:**
- Create: `IssueCTL/Views/Launch/LaunchView.swift`

Sheet with form:
- Workspace mode picker (segmented control)
- Branch name field (pre-filled)
- Comment selection (toggleable list)
- Preamble text editor
- Launch button

### Task 28: Wire launch and terminal into issue detail

**Files:**
- Modify: `IssueCTL/Views/Issues/IssueDetailView.swift`
- Modify: `IssueCTL/App/ContentView.swift`

Add launch button to issue detail toolbar. Wire terminal modal presentation. Wire Active Sessions tab to `SessionListView`.

---

## Phase 3: Push Notifications

**Goal:** Phone buzzes when sessions complete. Tap to land in context.

### Server-Side Tasks (issuectl repo)

### Task 29: Devices table and endpoints

**Files:**
- Modify: `packages/core/src/db/schema.ts` — add `devices` table (migration 12)
- Create: `packages/core/src/db/devices.ts` — CRUD for device tokens + preferences
- Create: `packages/web/app/api/v1/devices/route.ts` — POST (register), DELETE (unregister)
- Create: `packages/web/app/api/v1/devices/[token]/route.ts` — PATCH (update prefs)

### Task 30: APNs push sender

**Files:**
- Create: `packages/core/src/push/apns.ts` — APNs HTTP/2 client (JWT signing, payload construction)
- Create: `packages/core/src/push/send.ts` — `sendPush(db, event, payload)` — looks up devices with matching preference, sends to each

### Task 31: Hook push triggers into events

**Files:**
- Modify: `packages/web/lib/actions/launch.ts` — send push after session end
- Modify: `packages/core/src/lifecycle/reconcile.ts` — send push on PR detection

### iOS Tasks (issuectl-ios repo)

### Task 32: Push notification registration

**Files:**
- Create: `IssueCTL/Services/PushNotificationService.swift`
- Modify: `IssueCTL/App/IssueCTLApp.swift` — register for remote notifications

### Task 33: Notification preferences UI

**Files:**
- Modify: `IssueCTL/Views/Settings/SettingsView.swift` — add notification toggles section

### Task 34: Deep linking

**Files:**
- Create: `IssueCTL/App/DeepLinkHandler.swift`
- Modify: `IssueCTL/App/ContentView.swift` — handle notification tap navigation

---

## Phase 4: Mutations & Polish

**Goal:** Feature parity with web dashboard for mobile use cases. Ready for TestFlight.

### Server-Side Tasks (issuectl repo)

### Task 35: Issue mutation endpoints

**Files:**
- Create: `packages/web/app/api/v1/issues/[owner]/[repo]/route.ts` — POST (create)
- Modify: `packages/web/app/api/v1/issues/[owner]/[repo]/[number]/route.ts` — PATCH (update)
- Create: `packages/web/app/api/v1/issues/[owner]/[repo]/[number]/close/route.ts` — POST (close)

### Task 36: Comment mutation endpoints

**Files:**
- Create: `packages/web/app/api/v1/issues/[owner]/[repo]/[number]/comments/route.ts` — POST (add)
- Create: `packages/web/app/api/v1/comments/[owner]/[repo]/[commentId]/route.ts` — PATCH (edit), DELETE (remove)

### Task 37: Repo management endpoints

**Files:**
- Modify: `packages/web/app/api/v1/repos/route.ts` — POST (add repo)
- Create: `packages/web/app/api/v1/repos/[owner]/[repo]/route.ts` — DELETE (remove repo)

### Task 38: Settings and refresh endpoints

**Files:**
- Create: `packages/web/app/api/v1/settings/route.ts` — GET (branch pattern, cache TTL, etc.)
- Create: `packages/web/app/api/v1/refresh/route.ts` — POST (force cache invalidation)

Settings endpoint wraps `getSettings()` from core. Returns JSON array of key-value pairs.

### iOS Tasks (issuectl-ios repo)

### Task 39: Issue mutations in app

**Files:**
- Create: `IssueCTL/Views/Issues/CreateIssueView.swift`
- Modify: `IssueCTL/Views/Issues/IssueDetailView.swift` — add edit/close actions
- Modify: `IssueCTL/Views/Issues/CommentView.swift` — add edit/delete for own comments

### Task 40: Error states and offline handling

**Files:**
- Create: `IssueCTL/Views/Components/OfflineBanner.swift`
- Create: `IssueCTL/Views/Components/ErrorRetryView.swift`
- Modify: all list views — add empty state, error state, offline indicator

### Task 41: Repo management in Settings

**Files:**
- Modify: `IssueCTL/Views/Settings/SettingsView.swift` — add repo list with add/remove

### Task 42: Cloudflare tunnel testing

Manual testing phase:
- Configure Cloudflare tunnel to expose issuectl server
- Test all API endpoints through tunnel
- Test WebSocket terminal proxy through tunnel
- Fix any issues with headers, timeouts, or WSS upgrade

---

## Notes

- **Testing strategy for iOS:** Use XCTest + Swift Testing. Unit tests for APIClient (mock URLProtocol), UI tests for navigation flows. Tests run via XcodeBuildMCP `test_sim`.
- **Testing strategy for server:** Existing Vitest setup. Add route handler tests using direct function calls (Next.js test utilities) rather than HTTP-level testing.
- **Phases 1–4 tasks will be expanded** to bite-sized steps (matching Phase 0's granularity) when you're ready to begin each phase. This keeps the plan readable while ensuring nothing is vague when you start implementation.
