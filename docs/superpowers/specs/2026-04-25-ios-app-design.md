# issuectl iOS App — Design Spec

**Date:** 2026-04-25
**Status:** Draft
**Scope:** Native SwiftUI iOS app + REST API layer for existing server

## Overview

A native iOS app for issuectl that provides full issue triage, Claude Code session launching, terminal interaction, and push notifications from iPhone. The app connects to the existing issuectl server (running on the user's MacBook) via the existing Cloudflare tunnel or local network.

### Why native iOS instead of PWA or web-only?

- **Native app lifecycle** — home screen presence, Face ID, proper app switching, iOS share sheet
- **Push notifications** — proactive alerts when sessions complete, PRs open, CI fails. Safari drops WebSocket connections on background; push notifications solve this completely.
- **Polish for distribution** — App Store presence is a credible product. A PWA on iOS Safari is not.
- **The user already uses issuectl more on iPhone than desktop** — the desktop terminal (Ghostty) handles Claude Code directly. The mobile experience is the primary interface for triage, launching, and monitoring.

### What this is NOT

- Not a replacement for the web dashboard — desktop users keep the existing Next.js app
- Not a mobile IDE or terminal emulator — terminal interaction uses an embedded WKWebView loading the existing xterm.js/ttyd setup
- Not a standalone app — requires the issuectl server running on a host machine

## Architecture

### Two-Repo Split

**Repo 1: `issuectl` (existing monorepo)**
- Gains REST API route handlers at `/api/v1/`
- Gains bearer token auth middleware
- Gains APNs push notification triggers
- Web dashboard unchanged — Server Components + Server Actions continue as-is
- Both frontends consume the same core package

**Repo 2: `issuectl-ios` (new repo)**
- Standard Xcode project, pure SwiftUI, iOS 17+
- Talks exclusively to the REST API
- Contains no business logic that duplicates core
- One-way dependency: iOS app -> REST API -> core package

### Connection Model

```
iOS App                    Cloudflare Edge              MacBook
(SwiftUI)                  (tunnel)                     (issuectl web)
                                                        
  HTTPS REST ──────────────▶ proxy ──────────────────▶ /api/v1/*
  WSS (WKWebView) ─────────▶ proxy ──────────────────▶ /api/terminal/{port}/ws
```

- **Local network:** App can hit `http://{macbook-ip}:3847` directly
- **Remote:** App hits the Cloudflare tunnel subdomain (e.g., `https://issuectl.yourdomain.com`)
- **Initial approach:** Always use the tunnel URL. Local-network optimization deferred.
- **Cloudflare tunnel setup** for the iOS app is out of scope for this spec and will be configured separately when ready.

### Authentication

- `issuectl init` generates a random API token, stored in SQLite `settings` table
- iOS app sends `Authorization: Bearer {token}` on every request
- Server middleware validates before routing
- Token entered once during iOS app onboarding, stored in iOS Keychain

### Prerequisites

- **Apple Developer Program** ($99/year) — required for push notifications (APNs), TestFlight distribution, and App Store submission. Not needed for simulator-only development in Phase 0–2.
- **Xcode** installed on the MacBook (for building the iOS target)
- **XcodeBuildMCP** configured (already available in the current environment)

## REST API Surface

All endpoints live at `/api/v1/` as Next.js Route Handlers in the existing web package. Each is a thin wrapper over an existing core function.

### Read Endpoints

| Method | Path | Core function | Notes |
|--------|------|---------------|-------|
| `GET` | `/api/v1/health` | — | Connectivity check, server version |
| `GET` | `/api/v1/repos` | `listRepos()` | All tracked repos with issue/PR counts |
| `GET` | `/api/v1/issues/:owner/:repo` | `listIssues()` | Filterable by state, assignee, label |
| `GET` | `/api/v1/issues/:owner/:repo/:number` | `getIssueDetail()` | Full issue: body, comments, linked PRs, deployments |
| `GET` | `/api/v1/pulls/:owner/:repo` | `listPulls()` | PR list with CI status |
| `GET` | `/api/v1/pulls/:owner/:repo/:number` | `getPullDetail()` | Full PR: diff stats, checks, linked issue |
| `GET` | `/api/v1/deployments` | `listDeployments()` | Active sessions across all repos |
| `GET` | `/api/v1/settings` | `getSettings()` | Branch pattern, cache TTL, etc. |

### Mutation Endpoints

| Method | Path | Core function | Notes |
|--------|------|---------------|-------|
| `POST` | `/api/v1/issues/:owner/:repo` | `createIssue()` | Title, body, labels, assignees |
| `PATCH` | `/api/v1/issues/:owner/:repo/:number` | `updateIssue()` | Partial update |
| `POST` | `/api/v1/issues/:owner/:repo/:number/close` | `closeIssue()` | Close with optional comment |
| `POST` | `/api/v1/issues/:owner/:repo/:number/comments` | `addComment()` | New comment |
| `PATCH` | `/api/v1/comments/:owner/:repo/:commentId` | `editComment()` | Edit existing |
| `DELETE` | `/api/v1/comments/:owner/:repo/:commentId` | `removeComment()` | Delete |
| `POST` | `/api/v1/launch/:owner/:repo/:number` | `executeLaunch()` | Launch Claude Code session |
| `POST` | `/api/v1/deployments/:id/end` | `endSession()` | Kill ttyd, mark ended |
| `POST` | `/api/v1/repos` | `addRepo()` | Track new repo |
| `DELETE` | `/api/v1/repos/:owner/:repo` | `removeRepo()` | Untrack |
| `POST` | `/api/v1/refresh` | `refreshData()` | Force cache invalidation |

### Device Registration (Push Notifications)

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/v1/devices` | Register device token + notification preferences |
| `PATCH` | `/api/v1/devices/:token` | Update notification preferences |
| `DELETE` | `/api/v1/devices/:token` | Unregister device |

### Terminal Access

No new REST endpoints. The iOS app's WKWebView loads the existing terminal proxy directly:
```
{serverUrl}/api/terminal/{port}/
```

### What the API Does NOT Expose

- SQLite internals — the iOS app never sees DB schema
- Process management — no direct ttyd/tmux control, only launch/end abstractions
- GitHub tokens — the server handles all Octokit auth
- File system paths — workspace management stays server-side

## iOS App Structure

```
issuectl-ios/
├── IssueCTL.xcodeproj
├── IssueCTL/
│   ├── App/
│   │   ├── IssueCTLApp.swift              # Entry point, app lifecycle
│   │   └── ContentView.swift              # Root tab view
│   ├── Models/                            # Codable structs matching API responses
│   ├── Services/
│   │   ├── APIClient.swift                # HTTP client, auth, base URL
│   │   ├── CacheService.swift             # SwiftData local cache
│   │   └── PushNotificationService.swift  # APNs registration + deep links
│   ├── Views/
│   │   ├── Issues/                        # Issue list + detail
│   │   ├── PullRequests/                  # PR list + detail
│   │   ├── Sessions/                      # Active sessions dashboard
│   │   ├── Terminal/                      # WKWebView wrapper
│   │   ├── Launch/                        # Launch configuration sheet
│   │   ├── Settings/                      # Server URL, repos, notifications, prefs
│   │   └── Onboarding/                    # First-launch server setup
│   └── Resources/
│       └── Assets.xcassets
├── CLAUDE.md
└── README.md
```

## Screens & Navigation

### Tab Bar (4 tabs)

| Tab | Label | Icon | Content |
|-----|-------|------|---------|
| 1 | Issues | list icon | Issue list grouped by repo, filterable by state |
| 2 | PRs | git-merge icon | PR list with CI status indicators |
| 3 | Active | play icon | Cross-repo active deployment dashboard |
| 4 | Settings | gear icon | Server connection, repos, notifications, prefs |

### Issues Tab

**Issue List:**
- Grouped by repo
- Each row: issue number, title, labels (colored pills), assignee avatar, time since update
- Swipe right: Launch Claude Code session
- Swipe left: Close issue
- Filter bar: Open / Closed / Running / All
- Pull-to-refresh

**Issue Detail (push navigation):**
- Header: title, state badge, assignee, labels
- Body: rendered markdown (native `AttributedString`)
- Comments: threaded list, own comments editable/deletable
- Deployments: active sessions with "Open Terminal" / "End Session"
- Toolbar: Launch button

### PRs Tab

**PR List:**
- CI status indicator (green/red/yellow)
- Diff stats (+/- line counts)
- Linked issue number (tappable)

**PR Detail (push navigation):**
- Merge status, CI checks list
- Diff stats summary
- Linked issue (navigates to issue detail)
- Comments

### Active Sessions Tab

Cross-repo view of all running Claude Code sessions:
- Repo + issue number, issue title
- Running duration (live-updating)
- Tap to open terminal
- Swipe to end session

This tab has no equivalent in the web dashboard — it's a mobile-first addition optimized for glance-and-go usage.

### Terminal View

Full-screen modal presented from any "Open Terminal" action:
- Top toolbar: session name, duration, "End Session" button, dismiss
- WKWebView filling remaining screen, loading `{serverUrl}/api/terminal/{port}/`
- iOS keyboard appears when tapping into the terminal

### Launch Flow

Native iOS sheet presented from issue detail or swipe action:
1. Workspace mode picker (existing repo / worktree / clone)
2. Branch name (pre-filled from pattern, editable)
3. Comment selection (checkboxes for which comments to include as context)
4. Preamble text field (optional custom instructions)
5. Launch button

### Settings

- **Server:** URL, auth token, connection status indicator
- **Repos:** Tracked repo list (add/remove)
- **Notifications:** Per-event-type toggles (session ended, PR opened, CI completed, session stalled) — all default OFF for new event types
- **Preferences:** Default branch pattern, cache TTL
- **About:** App version, server version

## iOS Local Caching

**Strategy:** Client-side SWR, mirroring the server's own SWR pattern against GitHub.

```
GitHub API ──(5min TTL)──▶ Server Cache ──(response)──▶ iOS Local Cache
```

**Behavior:**
1. On first fetch — response cached locally via SwiftData
2. On subsequent opens — show cached data immediately, fetch in background, update UI on arrival
3. Offline — show cached data with subtle "offline" indicator; mutations fail gracefully with toast

**Per-data caching strategy:**

| Data | Strategy | Rationale |
|------|----------|-----------|
| Repo list | Cache until explicitly changed | Rarely changes, small |
| Issue lists | SWR — show stale, refresh background | Changes often, stale is fine briefly |
| Issue detail + comments | SWR | User needs instant render on tap |
| PR list + detail | SWR | Same reasoning |
| Active deployments | Short TTL (~10s) or skip cache | Status accuracy matters |
| Settings | Cache until changed | Almost never changes |

**Not cached:** Terminal sessions (live WebSocket), launch actions (mutations), health checks.

## Push Notifications

### Registration Flow

1. iOS app requests notification permission on first launch
2. Apple returns a device token
3. App sends token + notification preferences to `POST /api/v1/devices`
4. Server stores in new `devices` SQLite table (device_token, preferences JSON, created_at, last_seen)
5. On events, server checks preferences then sends via APNs HTTP/2 API

### Notification Events

| Event | Trigger | Example text |
|-------|---------|-------------|
| Session ended | ttyd process exits | "api #42 — session ended after 34m" |
| PR opened | Lifecycle reconciliation detects linked PR | "api #42 — PR #98 opened" |
| CI completed | PR check status changes | "api #98 — CI passed" / "CI failed" |
| Session stalled | Deployment active but process gone | "api #42 — session may have crashed" |

### Configurability

Each event type is independently toggleable in Settings. Preferences stored server-side — filtering happens before the APNs call. New event types added in the future default to OFF.

### Deep Linking

Tapping a notification navigates to the relevant screen:
- Session ended → issue detail (showing completed deployment)
- PR opened → PR detail
- CI completed → PR detail
- Session stalled → issue detail

## Development Phasing

Each phase delivers a usable app. Phases can stop at any point and the result is still a useful tool.

### Phase 0: Foundation

**issuectl repo:** Auth middleware, token generation, `/api/v1/health`, `/api/v1/repos`

**issuectl-ios repo:** Xcode project, SwiftUI skeleton, onboarding screen, APIClient with auth + caching layer, tab bar, repo list on first tab

**Exit criteria:** Open the app, enter server URL, see tracked repos.

### Phase 1: Read-only issues & PRs

**issuectl repo:** Issue list, issue detail, PR list, PR detail endpoints

**issuectl-ios repo:** Issues tab (list + detail with markdown + comments), PRs tab (list + detail with CI status), SWR caching, pull-to-refresh

**Exit criteria:** Triage issues and review PRs entirely from the phone.

### Phase 2: Launch & terminal

**issuectl repo:** Launch endpoint, deployments list, end session endpoint

**issuectl-ios repo:** Active Sessions tab, launch flow sheet, terminal WKWebView modal, end session action

**Exit criteria:** Full launch workflow from phone on local network — find issue, launch, watch terminal, end session.

### Phase 3: Push notifications

**issuectl repo:** Devices table, registration endpoint, APNs integration, event hooks, preference filtering

**issuectl-ios repo:** Notification permission + registration, preferences in Settings, deep-link handling

**Exit criteria:** Phone buzzes when session finishes, tap lands in terminal view.

### Phase 4: Mutations & polish

**issuectl-ios repo:** Create/edit/close issues, add/edit/delete comments, repo management, offline indicators, error states, empty states

**Cloudflare tunnel:** Test and fix any issues with remote access

**Exit criteria:** Feature parity with web dashboard for mobile use cases. Ready for TestFlight.

## Development Tooling

**iOS development uses XcodeBuildMCP** — build, run on simulator, screenshot, test, and inspect UI hierarchy without opening Xcode directly. Day-to-day iteration happens in Claude Code:

1. Claude Code writes SwiftUI code
2. XcodeBuildMCP builds + runs on iOS Simulator
3. XcodeBuildMCP screenshots for visual verification
4. Iterate via conversation

**Xcode is needed only for:** Initial project creation, signing/provisioning for physical device, App Store submission.

## Non-Goals (for this spec)

- iPad-specific layout (universal app but phone-optimized)
- Widget / Live Activity (future enhancement)
- Watch app
- Local network auto-discovery (Bonjour/mDNS)
- Multiple server connections
- Offline mutation queuing (mutations fail gracefully, not queued)
- Custom dark mode theming (SwiftUI inherits system appearance automatically; custom theme work deferred)
