# issuectl — Cross-Repo GitHub Issue Command Center

**Date:** 2026-04-06
**Status:** Draft (v1 scope finalized)

## Overview

`issuectl` is a local tool for managing GitHub issues and PRs across multiple repositories from a single interface. Its distinguishing feature is the ability to "launch" an issue directly into a Claude Code session — auto-creating a branch, gathering issue context (body, comments, referenced file paths), and opening a new Ghostty terminal with Claude Code pre-loaded with everything it needs to start working.

**v1 ships the web dashboard first.** The TUI and CLI subcommands are deferred to v2+. The web app runs locally only (no deployed/hosted mode).

## Goals

1. **Unified view** of all issues and PRs across a configurable set of GitHub repos
2. **Full issue management** (create, edit, label, close, comment) without leaving the tool
3. **Full PR visibility** across tracked repos (list, detail, review status)
4. **One-click Claude Code launch** with rich issue context and automatic branch creation
5. **Full lifecycle tracking** from issue creation through PR merge via GitHub labels
6. **Web dashboard** as the primary interface for v1

## Non-Goals (v1)

- Replacing GitHub for code review or PR merging
- Running multiple parallel Claude Code sessions
- Custom priority systems beyond GitHub labels
- Background/autonomous Claude Code sessions
- Deployed/hosted web app with GitHub OAuth
- TUI interface (deferred to v2)
- CLI subcommands beyond `init`, `web`, and `repo` (deferred to v2)
- Cross-repo flattened issue list in the web UI
- Keyboard shortcuts in the web dashboard
- Multi-terminal support (iTerm2, kitty, etc.)

---

## Architecture

### Monorepo Structure

TypeScript monorepo using pnpm workspaces and Turborepo:

```
issuectl/
├── packages/
│   ├── core/                  # @issuectl/core — shared business logic
│   │   ├── src/
│   │   │   ├── github/
│   │   │   │   ├── client.ts       # Octokit wrapper (uses gh auth token)
│   │   │   │   ├── issues.ts       # List, create, update, close issues
│   │   │   │   ├── pulls.ts        # List PRs, get PR detail
│   │   │   │   ├── labels.ts       # Manage lifecycle labels
│   │   │   │   └── search.ts       # Cross-repo search
│   │   │   ├── db/
│   │   │   │   ├── schema.ts       # SQLite schema + migrations
│   │   │   │   ├── repos.ts        # Repo CRUD
│   │   │   │   ├── settings.ts     # Settings read/write
│   │   │   │   ├── deployments.ts  # Deployment history
│   │   │   │   └── cache.ts        # API response cache
│   │   │   ├── launch/
│   │   │   │   ├── context.ts      # Build issue context (body + comments + file paths)
│   │   │   │   ├── branch.ts       # Create branch from naming pattern
│   │   │   │   └── ghostty.ts      # Open Ghostty terminal with Claude Code
│   │   │   └── types.ts            # Shared types
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── cli/                   # @issuectl/cli → published as `issuectl`
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── init.ts         # issuectl init — create DB + interactive setup
│   │   │   │   ├── web.ts          # issuectl web — start server + open browser
│   │   │   │   └── repo.ts         # issuectl repo add/remove/list/update
│   │   │   └── index.ts            # CLI entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                   # @issuectl/web → Next.js dashboard
│       ├── app/
│       │   ├── page.tsx       # Dashboard (repo cards)
│       │   ├── [repo]/
│       │   │   ├── page.tsx   # Repo detail (issues + PRs tabs)
│       │   │   ├── issues/[id]/page.tsx
│       │   │   └── pulls/[id]/page.tsx
│       │   └── settings/page.tsx
│       ├── package.json
│       └── next.config.ts
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── tsconfig.base.json
```

### Build Tooling

- **pnpm** — workspace management
- **Turborepo** — build orchestration (core first, cli/web in parallel)
- **tsup** — bundling core and cli packages
- **Next.js** — built-in build for web app

### Key Technology Choices

| Layer | Choice | Rationale |
|---|---|---|
| GitHub API | **Octokit** (`@octokit/rest`) | Type-safe, handles pagination and rate limiting |
| Auth | **`gh auth token`** | Zero separate login flow; piggybacks on existing gh CLI |
| Database | **SQLite** (via `better-sqlite3`) | Config, cache, and deployment history in one file |
| Web framework | **Next.js App Router + Server Actions** | Server Components for data fetching, Server Actions for mutations |
| Terminal | **Ghostty** (v1 only) | Hard-coded for v1; abstraction deferred |

---

## Data Layer

All persistent state lives in a single SQLite database at `~/.issuectl/issuectl.db`.

### Schema

```sql
-- Tracked repositories
repos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner         TEXT NOT NULL,
  name          TEXT NOT NULL,
  local_path    TEXT,                          -- nullable; prompts to clone if missing
  branch_pattern TEXT,                         -- overrides global default
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner, name)
)

-- Global settings (key-value)
settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
)
-- Default keys:
--   branch_pattern    = "issue-{number}-{slug}"
--   terminal_app      = "ghostty"
--   terminal_mode     = "window"
--   cache_ttl         = "300"
--   worktree_dir      = "~/.issuectl/worktrees/"

-- Deployment (launch) history
deployments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id         INTEGER NOT NULL REFERENCES repos(id),
  issue_number    INTEGER NOT NULL,
  branch_name     TEXT NOT NULL,
  workspace_mode  TEXT NOT NULL,                -- "existing" | "worktree" | "clone"
  workspace_path  TEXT NOT NULL,
  linked_pr_number INTEGER,                    -- populated when a PR is detected
  launched_at     TEXT NOT NULL DEFAULT (datetime('now'))
)

-- API response cache
cache (
  key           TEXT PRIMARY KEY,              -- e.g. "issues:mean-weasel/seatify"
  data          TEXT NOT NULL,                 -- JSON blob
  fetched_at    TEXT NOT NULL DEFAULT (datetime('now'))
)
```

### Database lifecycle

- **Created by `issuectl init`** — the command creates `~/.issuectl/issuectl.db` with the schema, seeds default settings, and interactively prompts to add the first repo (checks `gh auth` status first).
- **`issuectl web` requires the DB to exist** — errors with a helpful message if it doesn't.
- **Migrations** — handled via a version table and sequential migration scripts in `core/src/db/`.

---

## Authentication

### Local web app (v1)

Piggybacks on the existing `gh` CLI authentication. Retrieves the token via `gh auth token`. No separate login flow — if you're logged into `gh`, `issuectl` just works.

`issuectl init` verifies `gh auth` status and shows the auth error screen (as mockup'd) if not authenticated.

### Deployed web app (deferred)

Standard GitHub OAuth flow — "Sign in with GitHub" button. Out of scope for v1.

---

## Lifecycle Tracking

All lifecycle state lives in GitHub via labels. No local state for lifecycle — the SQLite `deployments` table tracks launch history, not issue state.

### Lifecycle labels

| Label | Applied when | Removed when |
|---|---|---|
| `issuectl:deployed` | Claude Code is launched on the issue | Never (historical record) |
| `issuectl:pr-open` | A PR referencing this issue is detected | PR is merged or closed |
| `issuectl:done` | PR is merged and issue is closed | Never |

### Label management

- **issuectl manages all three labels** — adds `:deployed` on launch, adds `:pr-open` when a linked PR is detected, removes `:pr-open` and adds `:done` when the PR is merged.
- **Labels are auto-created** — if the `issuectl:deployed`, `issuectl:pr-open`, or `issuectl:done` labels don't exist on a repo, issuectl creates them automatically with a consistent color scheme on first use. No user prompt needed.
- **Label reconciliation happens on page load** — when the web app fetches fresh data for an issue (via normal stale-while-revalidate or manual refresh), it checks PR state and updates labels accordingly.
- **Label management for user labels** — the web app supports applying and removing existing labels on issues, but does not support creating new labels. New labels are created on GitHub directly.

### PR ↔ Issue linking

The tool instructs Claude Code to include `Closes #123` in PR bodies. GitHub's native auto-close handles the rest on merge. issuectl detects linked PRs by searching for PRs whose body contains `Closes #N` or `Fixes #N` references.

### PR detection timing

PR linkage is detected **on page load and cache refresh** — whenever the web app fetches fresh issue/PR data, it checks for new PRs that reference deployed issues and updates the `deployments.linked_pr_number` column. No background polling.

---

## CLI Interface (v1 — minimal)

v1 ships three commands only. The full CLI with TUI and subcommands is deferred.

### `issuectl init`

Creates the SQLite database and walks through first-time setup:

1. Checks `gh auth` status — errors with instructions if not authenticated
2. Creates `~/.issuectl/` directory and `issuectl.db` with schema
3. Seeds default settings
4. Interactively prompts to add the first repo (owner/name, local path)

### `issuectl web`

Starts the Next.js web dashboard:

1. Checks that `~/.issuectl/issuectl.db` exists — errors with "Run `issuectl init` first" if not
2. Starts the Next.js server on `localhost:3847` (or configurable port)
3. Auto-opens the default browser to the dashboard

### `issuectl repo add/remove/list/update`

Manages tracked repos from the command line (same operations available in the web Settings page):

```bash
issuectl repo add mean-weasel/seatify                    # Interactive — prompts for path, pattern
issuectl repo add mean-weasel/seatify --path ~/Desktop/seatify  # Inline
issuectl repo remove mean-weasel/seatify
issuectl repo list
issuectl repo update mean-weasel/seatify --path ~/Projects/seatify
```

---

## Launch Flow

The core workflow — selecting an issue and launching Claude Code.

### Launch modal

The launch modal presents all configuration as **editable fields** (pre-filled with sensible defaults). Users rarely change these, but everything is adjustable:

- **Branch name** — pre-filled with `issue-{number}-{slug}`, editable. If the branch already exists, the user can keep it or edit to a fresh name (e.g., `issue-515-guest-data-pipeline-v2`).
- **Context toggles** — checkboxes to include/exclude individual comments and referenced file paths
- **Custom preamble** — optional text field for additional one-off instructions to prepend to the prompt (repos already have their own CLAUDE.md for persistent instructions)
- **Local path** — shows the configured repo path, editable
- **Workspace mode** — three options:
  - **Existing repo** (default) — uses the configured local path, creates branch there
  - **Git worktree** — creates an isolated linked worktree at `~/.issuectl/worktrees/{repo}-issue-{number}/`. Fast, shares `.git` history with the main repo. Ideal for working on issues without disrupting the main checkout.
  - **Fresh clone** — shallow clone to a temp directory. Fully isolated but slower. Use when the main repo is in a messy state.

### Launch steps

1. **Assemble context:** Issue title, body, selected comments (chronological), and selected referenced file paths (detected via regex matching file path patterns and GitHub blob URLs in the issue body)
2. **Check history:** If `issuectl:deployed` label exists, show deployment history (branch, linked PR number/status, review comments) and confirm re-launch
3. **Prepare workspace:** Depending on workspace mode:
   - *Existing repo:* checkout default branch, pull latest, create or checkout issue branch
   - *Worktree:* create worktree at configured path, checkout issue branch
   - *Fresh clone:* shallow clone repo to temp path, checkout issue branch
4. **Apply label:** Add `issuectl:deployed` to the issue on GitHub (auto-create label if it doesn't exist on the repo)
5. **Write context to temp file:** Write the assembled context to `/tmp/issuectl-launch-{issue-number}.md`
6. **Record deployment:** Insert a row into the `deployments` table
7. **Open terminal:** Launch Ghostty with Claude Code, piping the temp file as input

### Terminal configuration

Ghostty is the only supported terminal in v1. The terminal mode (window vs. tab) is configurable in settings (default: new window):
- **New window** — opens a brand new Ghostty window for the Claude Code session
- **New tab** — opens a new tab in the frontmost Ghostty window

The settings page shows the terminal as read-only ("Ghostty") with the mode selector.

### Context assembly

The prompt written to the temp file and sent to Claude Code includes:
- Issue title and number
- Full issue body (markdown)
- Selected comments in chronological order (all included by default, individually toggleable)
- Selected referenced file paths from the issue body (detected by regex matching file path patterns and GitHub blob URLs — paths only, not file contents; Claude Code reads files itself)
- Any custom preamble text the user added
- Instruction to include `Closes #{number}` in any PR created

**Deferred to v2:** Recent commits touching referenced files (limited to last 10).

### Repo without local path

If a tracked repo has no `path` configured, the launch flow:
1. Shows a modal: "Repo `org/name` has no local path configured. Clone to `~/Desktop/name`?" with an editable path field
2. Clones the repo to the chosen location
3. Updates the repo record in SQLite with the new path
4. Continues with the normal launch flow

### Path validation

- **On repo add (settings / CLI):** Warns if the path doesn't exist or isn't a git repo, but still allows saving (the repo might be cloned later).
- **On launch:** Errors if the path doesn't exist or isn't a git repo. The user must fix the path before launching.

---

## Web Dashboard

Next.js App Router application using Server Components for data fetching and Server Actions for mutations. Runs locally only.

### Startup

```bash
issuectl web              # Starts server on localhost:3847, auto-opens browser
issuectl web --port 4000  # Custom port
```

Requires `issuectl init` to have been run first. Errors with a helpful message if the database doesn't exist.

### Pages

**Dashboard (`/`):**
- Repo cards with issue count, PR count, deployed count
- Sorted by most issues (descending)
- Click a repo card to navigate to its detail view
- "Add Repo" button, "Refresh" button
- Cache status bar: "cached 2 minutes ago · 49 issues · 12 PRs · refresh now"

**Repo detail (`/[repo]`):**
- Two tabs: Issues and PRs
- **Issues tab:** Table with title, labels, lifecycle status, age, quick actions (Launch/Re-launch, overflow menu)
  - Default sort: **last updated** (most recently active first)
  - Search/filter bar with label filter chips
  - "New Issue" button opens create modal
- **PRs tab:** Table with title, status (open/merged/closed), linked issue, changes (+/-), age
  - Filter chips: All, Open, Merged, Review
- **Refresh button** in the toolbar to manually re-fetch from GitHub (data-only, bypasses cache TTL)

**Issue detail (`/[repo]/issues/[id]`):**
- Rendered markdown body
- Comment thread with ability to **read and post** comments
- Deployment history sidebar: previous launches, linked PRs, branch names (timeline view)
- Referenced files sidebar (file paths as listed in the issue body)
- Actions: Launch/Re-launch to Claude Code, Edit, Close (with confirmation dialog), Label
- "Launch to Claude Code" card in sidebar with branch name and context summary

**PR detail (`/[repo]/pulls/[id]`):**
- PR body rendered markdown, diff stats, review status
- CI checks sidebar with pass/fail status
- Linked issue sidebar (click to navigate)
- Branch name, files changed list

**Settings (`/settings`):**
- **Tracked repositories:** List with owner/name, local path, edit/remove actions. Dashed border for repos without local path. "+ Add Repo" button.
- **Defaults:** Branch pattern input, cache TTL input
- **Terminal:** Read-only display showing "Ghostty" with window/tab mode selector
- **Worktrees:** "Clean up worktrees" button that shows stale worktrees (from merged PRs) and lets the user delete them
- **Authentication:** Read-only display showing `gh auth` status and authenticated username

**Onboarding (first run, no repos configured):**
- Welcome screen with "Add your first repository" form
- Repository name input, local path input (optional)
- "Add Repository" button

**Auth error (gh not authenticated):**
- Error screen with step-by-step fix instructions: install gh, run `gh auth login`, restart issuectl
- "Try again" button to re-check

### Modals

**Create issue modal:**
- Repository selector (defaults to current repo context)
- Title input, description textarea (markdown), label toggles
- "Create Issue" / "Cancel" buttons

**Launch confirmation modal:**
- Issue summary (number, title, repo)
- Editable branch name field (pre-filled, suggests -v2 for re-launches)
- Workspace mode radio: Existing repo / Git worktree / Fresh clone (with path descriptions)
- Context toggles: checkboxes for issue body, each comment, each referenced file path
- Custom preamble textarea (optional)
- "Launch" / "Cancel" buttons

**Clone prompt modal (repos without local path):**
- Warning banner explaining the repo has no local path
- Editable "Clone to" path field (pre-filled with `~/Desktop/{name}`)
- "Clone & Launch" / "Cancel" buttons

**Close issue confirmation dialog:**
- "Close issue #N?" with issue title
- "Close" / "Cancel" buttons

### Mutations

All destructive actions (close issue, edit issue) show a **confirmation dialog** before executing. Non-destructive actions (add comment, add label) execute immediately.

### Launch from web app

The web app uses Server Actions to execute the launch flow server-side:
1. Server Action assembles context, creates branch, writes temp file
2. Server Action spawns Ghostty process (via `child_process`)
3. Web UI shows the "Launching" progress view with step-by-step status
4. After launch completes, shows the "Claude Code session active" banner

---

## Caching

SQLite-backed cache at `~/.issuectl/issuectl.db` (in the `cache` table):

- Each API response is cached with a `fetched_at` timestamp
- TTL is configurable in settings (default: 300 seconds / 5 minutes)
- Cache is per-endpoint (e.g., `issues:mean-weasel/seatify`, `pulls:mean-weasel/seatify`)
- **Stale-while-revalidate:** Pages show cached data immediately (even if stale), fetch fresh data in the background, and update the UI when it arrives. A "cached Xm ago · updating..." indicator shows the state.
- **Manual refresh:** The "Refresh" button bypasses cache TTL and fetches fresh data from GitHub. This is data-only — it does not trigger label reconciliation (labels are reconciled on normal page loads when fresh data arrives).
- Cache is shared between CLI and web app (both read/write the same SQLite file)

---

## Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│   Web App   │────▶│  @issuectl/  │────▶│  GitHub API    │
│  (Next.js)  │◀────│    core      │◀────│  (via Octokit) │
└─────────────┘     └──────────────┘     └────────────────┘
                           │
                    ┌──────┴──────┐
                    │   SQLite    │
                    │  ~/.issuectl│
                    │  /issuectl  │
                    │  .db        │
                    └─────────────┘
```

The web app calls `core` functions via Server Actions and Server Components. The core handles:
- Auth (via `gh auth token` → Octokit)
- API calls with automatic SQLite caching (stale-while-revalidate)
- Config and repo management (SQLite)
- Deployment history recording (SQLite)
- Branch creation and Ghostty terminal launching
- Lifecycle label management

---

## Worktree Management

Git worktrees are created at `~/.issuectl/worktrees/{repo}-issue-{number}/` when the user selects the "Git worktree" workspace mode during launch.

- **Worktrees persist** until the user manually cleans them up
- **Settings page** includes a "Clean up worktrees" section that lists existing worktrees, shows which are linked to merged PRs (stale), and lets the user delete them individually or in bulk
- **Cleanup runs `git worktree remove`** followed by `git worktree prune` on the parent repo

---

## Future Considerations (out of scope for v1)

- **TUI interface** with Ink (React for CLI) — three-panel layout, vim-style bindings
- **Full CLI subcommands** — `issuectl list`, `issuectl show`, `issuectl launch`, etc.
- **Deployed web app** with GitHub OAuth (architecture supports it, implementation deferred)
- **Additional terminal support** beyond Ghostty (iTerm2, VS Code terminal, kitty) — terminal adapter interface
- **Cross-repo flattened issue list** in the web dashboard
- **Webhook-based updates** instead of polling/TTL cache
- **Parallel Claude Code sessions** across repos
- **Smart prioritization** (auto-sort by age, label severity, activity)
- **Recent commits** in context assembly (last 10 commits touching referenced files)
- **File contents** in context assembly (currently paths-only; could include source with size limits)
- **Keyboard shortcuts** in the web dashboard (/, c, j/k, Enter)
- **Background PR detection polling** (currently on-page-load only)
