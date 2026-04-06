# issuectl -- Implementation Plan

**Date:** 2026-04-06
**Companion doc:** `2026-04-06-issuectl-design.md`
**Mockup reference:** `../mockups/web.html`

---

## Phase 0: Monorepo Scaffolding + Tooling

### Goal
A buildable, lintable monorepo with three empty packages wired together. No runtime code yet -- just plumbing.

### Files to create

```
issuectl/
  package.json                  # Root: workspaces, devDependencies (typescript, turbo, eslint, prettier)
  pnpm-workspace.yaml           # packages: ["packages/*"]
  turbo.json                    # Pipeline: build, dev, lint, typecheck
  tsconfig.base.json            # Shared TS config (strict, ESM, path aliases)
  .gitignore                    # node_modules, dist, .next, .turbo, *.db
  .npmrc                        # shamefully-hoist=true (better-sqlite3 native binding)

  packages/core/
    package.json                # @issuectl/core -- "type": "module", tsup for build
    tsconfig.json               # extends ../../tsconfig.base.json
    tsup.config.ts              # entry: ["src/index.ts"], format: esm, dts: true
    src/index.ts                # Barrel export (empty for now)

  packages/cli/
    package.json                # @issuectl/cli -- "bin": { "issuectl": "./dist/index.js" }
    tsconfig.json               # depends on @issuectl/core
    tsup.config.ts              # entry: ["src/index.ts"], format: esm, banner: #!/usr/bin/env node
    src/index.ts                # Placeholder: console.log("issuectl")

  packages/web/
    package.json                # @issuectl/web -- next, react, react-dom, depends on @issuectl/core
    tsconfig.json               # extends ../../tsconfig.base.json, Next.js paths
    next.config.ts              # transpilePackages: ["@issuectl/core"]
    app/layout.tsx              # Root layout (html/body shell, global CSS import)
    app/page.tsx                # Placeholder: <h1>issuectl</h1>
    app/globals.css             # CSS variables from mockup (:root vars, base resets)
```

### Key decisions

| Decision | Choice |
|---|---|
| Node target | 20+ (LTS, native fetch, stable ESM) |
| Module format | ESM throughout (`"type": "module"` in every package.json) |
| TS target | `es2022` |
| Bundler for core/cli | `tsup` (fast, handles DTS) |
| Turbo pipeline | `build` depends on `^build` (core first), `dev` is persistent |

### Dependencies to install

**Root devDependencies:**
`typescript`, `turbo`, `@types/node`, `eslint`, `prettier`, `tsup`

**packages/core:**
_(no deps yet -- added in Phase 1)_

**packages/cli:**
`commander` (CLI framework)

**packages/web:**
`next`, `react`, `react-dom`, `@types/react`, `@types/react-dom`

### Done criteria
- `pnpm install` succeeds
- `pnpm turbo build` compiles all three packages without errors
- `pnpm turbo typecheck` passes
- `node packages/cli/dist/index.js` prints "issuectl"
- `cd packages/web && pnpm dev` serves the placeholder page on localhost:3000

---

## Phase 1: Core Package -- Database Layer

### Goal
SQLite database with full schema, migrations, and typed CRUD operations for repos, settings, deployments, and cache. No GitHub API yet -- just the local data layer.

### Files to create/modify

```
packages/core/
  src/
    db/
      connection.ts       # getDb(): Database -- singleton, creates ~/.issuectl/ dir if needed
      schema.ts           # initSchema(db): void -- CREATE TABLE IF NOT EXISTS for all 4 tables + version table
      migrations.ts       # runMigrations(db): void -- sequential migration runner using schema_version table
      repos.ts            # addRepo, removeRepo, getRepo, listRepos, updateRepo
      settings.ts         # getSetting, setSetting, getSettings (bulk), seedDefaults
      deployments.ts      # recordDeployment, getDeploymentsForIssue, getDeploymentsByRepo, updateLinkedPR
      cache.ts            # getCached, setCached, isFresh(key, ttlSeconds), clearCache
    types.ts              # Repo, Setting, Deployment, CacheEntry -- shared types
    index.ts              # Re-export everything from db/* and types
  package.json            # Add dependency: better-sqlite3, @types/better-sqlite3
```

### Schema (from design spec)

```sql
CREATE TABLE IF NOT EXISTS repos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner         TEXT NOT NULL,
  name          TEXT NOT NULL,
  local_path    TEXT,
  branch_pattern TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner, name)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deployments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id          INTEGER NOT NULL REFERENCES repos(id),
  issue_number     INTEGER NOT NULL,
  branch_name      TEXT NOT NULL,
  workspace_mode   TEXT NOT NULL,  -- "existing" | "worktree" | "clone"
  workspace_path   TEXT NOT NULL,
  linked_pr_number INTEGER,
  launched_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cache (
  key        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);
```

### Key function signatures

```typescript
// db/connection.ts
export function getDb(): Database;
export function getDbPath(): string;   // ~/.issuectl/issuectl.db
export function dbExists(): boolean;

// db/repos.ts
export function addRepo(db: Database, repo: { owner: string; name: string; localPath?: string; branchPattern?: string }): Repo;
export function removeRepo(db: Database, id: number): void;
export function getRepo(db: Database, owner: string, name: string): Repo | undefined;
export function getRepoById(db: Database, id: number): Repo | undefined;
export function listRepos(db: Database): Repo[];
export function updateRepo(db: Database, id: number, updates: Partial<Pick<Repo, 'localPath' | 'branchPattern'>>): Repo;

// db/settings.ts
export function getSetting(db: Database, key: string): string | undefined;
export function setSetting(db: Database, key: string, value: string): void;
export function seedDefaults(db: Database): void;

// db/cache.ts
export function getCached<T>(db: Database, key: string): { data: T; fetchedAt: Date } | null;
export function setCached(db: Database, key: string, data: unknown): void;
export function isFresh(db: Database, key: string, ttlSeconds: number): boolean;
export function clearCache(db: Database, keyPattern?: string): void;
```

### Default settings seed values
| Key | Default Value |
|---|---|
| `branch_pattern` | `issue-{number}-{slug}` |
| `terminal_app` | `ghostty` |
| `terminal_mode` | `window` |
| `cache_ttl` | `300` |
| `worktree_dir` | `~/.issuectl/worktrees/` |

### Done criteria
- Unit tests pass for all CRUD operations (repos, settings, deployments, cache)
- `getDb()` creates `~/.issuectl/` directory and database file if they don't exist
- `seedDefaults()` is idempotent (running it twice doesn't duplicate/error)
- Cache freshness check works correctly with configurable TTL
- All functions use prepared statements (not string interpolation)

---

## Phase 2: Core Package -- GitHub Client

### Goal
Typed Octokit wrapper that authenticates via `gh auth token` and provides functions for all GitHub operations needed by the app: issues, PRs, labels, and comments.

### Files to create/modify

```
packages/core/
  src/
    github/
      client.ts           # getOctokit(): Octokit -- authenticates via `gh auth token`
      auth.ts             # getGhToken(): string, checkGhAuth(): { ok, username?, error? }
      issues.ts           # listIssues, getIssue, createIssue, updateIssue, closeIssue, addComment, getComments
      pulls.ts            # listPulls, getPull, getPullChecks, findLinkedPRs
      labels.ts           # listLabels, addLabel, removeLabel, ensureLifecycleLabels
      types.ts            # GitHubIssue, GitHubPull, GitHubComment, GitHubLabel, GitHubCheck -- mapped types
    index.ts              # Add re-exports for github/*
  package.json            # Add dependencies: @octokit/rest, @octokit/types
```

### Key function signatures

```typescript
// github/auth.ts
export async function getGhToken(): Promise<string>;
// Runs `gh auth token` via execFile, throws if gh is not installed or not authenticated

export async function checkGhAuth(): Promise<{ ok: boolean; username?: string; error?: string }>;

// github/client.ts
export async function getOctokit(): Promise<Octokit>;  // Singleton, calls getGhToken()

// github/issues.ts
export async function listIssues(octokit: Octokit, owner: string, repo: string): Promise<GitHubIssue[]>;
export async function getIssue(octokit: Octokit, owner: string, repo: string, number: number): Promise<GitHubIssue>;
export async function createIssue(octokit: Octokit, owner: string, repo: string, data: { title: string; body?: string; labels?: string[] }): Promise<GitHubIssue>;
export async function updateIssue(octokit: Octokit, owner: string, repo: string, number: number, data: { title?: string; body?: string; labels?: string[] }): Promise<GitHubIssue>;
export async function closeIssue(octokit: Octokit, owner: string, repo: string, number: number): Promise<void>;
export async function getComments(octokit: Octokit, owner: string, repo: string, number: number): Promise<GitHubComment[]>;
export async function addComment(octokit: Octokit, owner: string, repo: string, number: number, body: string): Promise<GitHubComment>;

// github/pulls.ts
export async function listPulls(octokit: Octokit, owner: string, repo: string, state?: 'open' | 'closed' | 'all'): Promise<GitHubPull[]>;
export async function getPull(octokit: Octokit, owner: string, repo: string, number: number): Promise<GitHubPull>;
export async function getPullChecks(octokit: Octokit, owner: string, repo: string, ref: string): Promise<GitHubCheck[]>;
export async function findLinkedPRs(octokit: Octokit, owner: string, repo: string, issueNumber: number): Promise<GitHubPull[]>;

// github/labels.ts
export async function ensureLifecycleLabels(octokit: Octokit, owner: string, repo: string): Promise<void>;
export async function addLabel(octokit: Octokit, owner: string, repo: string, issueNumber: number, label: string): Promise<void>;
export async function removeLabel(octokit: Octokit, owner: string, repo: string, issueNumber: number, label: string): Promise<void>;
```

### Lifecycle label definitions

```typescript
const LIFECYCLE_LABELS = [
  { name: 'issuectl:deployed',  color: 'd29922', description: 'Launched to Claude Code via issuectl' },
  { name: 'issuectl:pr-open',   color: '58a6ff', description: 'PR referencing this issue is open' },
  { name: 'issuectl:done',      color: '3fb950', description: 'PR merged and issue closed' },
];
```

### PR-issue linking detection
`findLinkedPRs` searches for PRs whose body contains patterns:
- `Closes #N`
- `Fixes #N`
- `Resolves #N`

(case-insensitive, with optional leading `owner/repo` prefix)

### Technical notes
- `getGhToken()` uses `execFile('gh', ['auth', 'token'])` (not `exec` with shell string) -- throws a descriptive error if `gh` is not installed or not authenticated
- `checkGhAuth()` runs `execFile('gh', ['auth', 'status', '--show-token'])` and parses the output for the username
- All list functions handle Octokit pagination automatically via `octokit.paginate()`
- The `GitHubIssue` / `GitHubPull` types are slimmed-down versions of Octokit's types, containing only the fields the app needs (avoids leaking the full Octokit type surface)

### Done criteria
- `checkGhAuth()` correctly reports auth status
- `listIssues` and `listPulls` return paginated results for a real repo
- `ensureLifecycleLabels` creates labels idempotently (no error on second run)
- `findLinkedPRs` correctly matches `Closes #N` patterns in PR bodies
- All functions accept an Octokit instance (not global state) for testability

---

## Phase 3: Core Package -- Cached Data Access Layer

### Goal
A thin layer that composes the GitHub client (Phase 2) with the SQLite cache (Phase 1) to implement stale-while-revalidate fetching. This is what the web app and CLI will call -- they never call the GitHub client or cache directly.

### Files to create/modify

```
packages/core/
  src/
    data/
      issues.ts           # Cached issue operations with SWR
      pulls.ts            # Cached PR operations with SWR
      repos.ts            # Repo dashboard data (combines DB repos + GitHub stats)
      comments.ts         # Cached comments (SWR)
      settings.ts         # Direct passthrough to db/settings (no caching needed)
    index.ts              # Add re-exports for data/*
```

### Key function signatures

```typescript
// data/issues.ts
export async function getIssues(owner: string, repo: string, options?: { forceRefresh?: boolean }): Promise<{
  issues: GitHubIssue[];
  fromCache: boolean;
  cachedAt: Date | null;
}>;

export async function getIssueDetail(owner: string, repo: string, number: number, options?: { forceRefresh?: boolean }): Promise<{
  issue: GitHubIssue;
  comments: GitHubComment[];
  deployments: Deployment[];
  linkedPRs: GitHubPull[];
  referencedFiles: string[];
  fromCache: boolean;
}>;

// data/pulls.ts
export async function getPulls(owner: string, repo: string, options?: { forceRefresh?: boolean }): Promise<{
  pulls: GitHubPull[];
  fromCache: boolean;
  cachedAt: Date | null;
}>;

export async function getPullDetail(owner: string, repo: string, number: number): Promise<{
  pull: GitHubPull;
  checks: GitHubCheck[];
  linkedIssue: GitHubIssue | null;
}>;

// data/repos.ts
export async function getDashboardData(options?: { forceRefresh?: boolean }): Promise<{
  repos: Array<Repo & {
    issueCount: number;
    prCount: number;
    deployedCount: number;
    labels: Array<{ name: string; count: number }>;
    oldestIssueAge: number;  // days
  }>;
  totalIssues: number;
  totalPRs: number;
  cachedAt: Date | null;
}>;
```

### SWR behavior
1. Check cache freshness via `isFresh(key, ttl)`
2. If fresh: return cached data with `fromCache: true`
3. If stale: return cached data immediately with `fromCache: true`, then trigger a background fetch
4. If no cache: fetch from GitHub, store in cache, return with `fromCache: false`
5. If `forceRefresh: true`: skip cache, fetch from GitHub, update cache

### Referenced file path extraction
The `referencedFiles` field in `getIssueDetail` is populated by scanning the issue body for:
- Inline code spans matching file path patterns: backtick-wrapped strings containing `/` and a file extension (e.g., `` `src/lib/engine.ts` ``)
- GitHub blob URLs: `https://github.com/{owner}/{repo}/blob/{ref}/{path}`

Regex patterns:
```typescript
const FILE_PATH_PATTERN = /`([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,10})`/g;
const GITHUB_BLOB_PATTERN = /https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\/([^\s)]+)/g;
```

### Done criteria
- SWR logic returns cached data when available, even if stale
- `forceRefresh` bypasses cache and updates stored data
- `getIssueDetail` correctly extracts referenced file paths from issue body markdown
- `getDashboardData` aggregates issue/PR counts across all tracked repos
- Background revalidation doesn't block the initial response

---

## Phase 4: CLI -- `issuectl init` and `issuectl web`

### Goal
Two working CLI commands: `issuectl init` for first-time setup and `issuectl web` to start the dashboard. Also `issuectl repo` for managing repos from the command line.

### Files to create/modify

```
packages/cli/
  src/
    index.ts              # Commander program setup, register commands
    commands/
      init.ts             # issuectl init
      web.ts              # issuectl web [--port]
      repo.ts             # issuectl repo add/remove/list/update
    utils/
      prompts.ts          # Interactive prompts (inquirer or built-in readline)
      logger.ts           # Styled console output (chalk)
  package.json            # Add dependencies: commander, chalk, inquirer (or @inquirer/prompts)
```

### `issuectl init` flow

```
1. Print banner: "issuectl v0.1.0 -- first-time setup"
2. Check `gh auth status`:
   - If not authenticated: print error with fix instructions, exit 1
   - If authenticated: print "Authenticated as {username} via gh"
3. Check if ~/.issuectl/issuectl.db already exists:
   - If exists: "Database already exists. Re-initialize? (y/N)"
   - If not: create ~/.issuectl/ directory
4. Create database, run schema, seed defaults
5. Interactive prompt: "Add your first repository?"
   - Owner/name: text input (e.g., "mean-weasel/seatify")
   - Local path: text input with default "~/Desktop/{name}" (optional, can skip)
   - Validate: warn if path doesn't exist, but allow saving
6. Print summary: "Setup complete. Run `issuectl web` to start the dashboard."
```

### `issuectl web` flow

```
1. Check that ~/.issuectl/issuectl.db exists
   - If not: print "No database found. Run `issuectl init` first." and exit 1
2. Check gh auth status
   - If not authenticated: print error with fix instructions, exit 1
3. Resolve port (default 3847, --port flag overrides)
4. Start Next.js dev server as a child process:
   - Spawn `next dev --turbopack --port {port}` pointing at packages/web
5. Auto-open browser: use execFile('open', [`http://localhost:${port}`]) on macOS
6. Print "Dashboard running at http://localhost:{port} -- press Ctrl+C to stop"
```

### `issuectl repo` subcommands

```
issuectl repo add <owner/repo> [--path <local-path>]
  - Parse owner/repo, validate format
  - If --path not provided: prompt interactively
  - Warn if path doesn't exist or isn't a git repo
  - Insert into repos table
  - Print confirmation

issuectl repo remove <owner/repo>
  - Look up repo in DB
  - Confirm removal
  - Delete from repos table
  - Print confirmation

issuectl repo list
  - Print table: owner/repo | local path | branch pattern

issuectl repo update <owner/repo> --path <new-path>
  - Look up repo, update local_path
  - Print confirmation
```

### Technical notes
- The `web` command starts Next.js in dev mode with Turbopack for fast startup. The CLI spawns `next dev` as a child process, not via the Next.js programmatic API.
- Port 3847 chosen to avoid conflicts with common dev ports.
- Browser auto-open uses `execFile('open', [url])` on macOS.

### Done criteria
- `issuectl init` creates the database, seeds defaults, and walks through interactive repo add
- `issuectl init` fails gracefully when `gh` is not installed or not authenticated
- `issuectl web` starts the Next.js dev server and opens the browser
- `issuectl web` errors helpfully when the DB doesn't exist
- `issuectl repo add/remove/list/update` all work correctly
- All commands handle Ctrl+C gracefully

---

## Phase 5: Web -- Dashboard Page (Repo Cards)

### Goal
The main dashboard page showing repo cards with issue/PR/deployment counts, plus the sidebar navigation. This is the first real web UI work.

### Dependencies
- Phase 1 (database layer)
- Phase 2 (GitHub client)
- Phase 3 (cached data access)
- Phase 4 (CLI commands to start the server)

### Files to create/modify

```
packages/web/
  app/
    layout.tsx              # Root layout: sidebar + main content area
    page.tsx                # Dashboard: Server Component that calls getDashboardData()
    globals.css             # Full CSS variable set from mockup design tokens
    loading.tsx             # Dashboard loading skeleton

  components/
    sidebar/
      Sidebar.tsx           # Full sidebar: logo, nav items, repo list, auth footer
      SidebarRepoList.tsx   # Repo list in sidebar with colored dots and counts
    dashboard/
      RepoCard.tsx          # Individual repo card (stats, bar chart, tags)
      RepoGrid.tsx          # Grid layout for repo cards
      CacheBar.tsx          # "cached 2m ago - 49 issues - 12 PRs - refresh now"
    ui/
      Button.tsx            # Reusable button variants (primary, secondary, ghost, launch)
      Badge.tsx             # Label badge component
      PageHeader.tsx        # Shared page header (title, actions, breadcrumb)

  lib/
    actions/
      refresh.ts            # Server Action: revalidate dashboard data (forceRefresh)
```

### Sidebar navigation structure (from mockup)
```
[logo] issuectl v0.1.0
-----------------------
* Dashboard              (active indicator)
  Issues          49
  Pull Requests   12
  Settings
-----------------------
REPOSITORIES
  * seatify        17    (colored dot per repo)
  * bugdrop         6
  * mybody-scans    6
  ...
-----------------------
[auth dot] neonwatty via gh auth
```

### Data flow for the dashboard page
```
page.tsx (Server Component)
  -> getDashboardData() from @issuectl/core
    -> For each repo in DB: fetch issues + PRs (cached)
    -> Aggregate counts, compute stats
  -> Render <RepoGrid repos={data.repos} />
  -> Render <CacheBar cachedAt={data.cachedAt} stats={...} />
```

### Repo card layout (from mockup)
```
[dot] seatify                      mean-weasel
17 Issues    3 PRs    2 Deployed
[======bugs======][====enhancements====][==other==]  (proportional bar)
4 bugs    11 enhancements    oldest: 14d
```

### CSS approach
Use CSS modules (`.module.css` files) for component-scoped styles. Global design tokens in `globals.css`. No Tailwind for v1 -- the mockup has a very specific design system that's easier to match with custom CSS.

### Done criteria
- Dashboard renders all tracked repos as cards
- Cards show issue count, PR count, deployed count
- Cards show label breakdown bar and tags
- Cache bar shows last fetch time and totals
- "Refresh" button triggers server action that bypasses cache
- Sidebar shows navigation items and repo list
- Clicking a repo card navigates to `/[owner]/[repo]` (404 is fine for now)
- Loading skeleton shows while data is being fetched
- Empty state shows when no repos are configured (links to settings)

---

## Phase 6: Web -- Repo Detail Page (Issues + PRs Tables)

### Goal
The repo detail view with two tabs (Issues, PRs), filterable/searchable tables, and row actions.

### Files to create/modify

```
packages/web/
  app/
    [owner]/
      [repo]/
        page.tsx              # Repo detail: Server Component, fetches issues + PRs
        loading.tsx           # Loading skeleton for repo detail

  components/
    repo/
      RepoHeader.tsx          # Breadcrumb + title + action buttons (New Issue, Label, Close)
      IssuesTable.tsx         # Issues table with columns: Issue, Labels, Lifecycle, Age, Actions
      PullsTable.tsx          # PRs table with columns: PR, Status, Linked Issue, Changes, Age
      TableToolbar.tsx        # Search input + filter chips + cache/refresh indicator
      IssueRow.tsx            # Single issue row with lifecycle dot, labels, launch button
      PullRow.tsx             # Single PR row with status badge, linked issue, diff stats
      TabBar.tsx              # Issues / Pull Requests tab selector (client component)
    ui/
      LifecycleIndicator.tsx  # Colored dot + text for lifecycle state (New, Deployed, PR open, Done)
      FilterChips.tsx         # Toggle filter chip group (client component)
      SearchInput.tsx         # Search input with icon (client component)
```

### URL routing
```
/[owner]/[repo]                 -> Repo detail page
/[owner]/[repo]?tab=prs        -> Repo detail, PRs tab active
```

The route uses `[owner]` and `[repo]` as two dynamic segments. The page resolves the repo from the database using `getRepo(db, owner, repo)`.

### Issues table columns (from mockup)
| Column | Content |
|---|---|
| Issue | State dot (green=open) + title + `#number - opened X days ago` |
| Labels | Colored badges (bug, enhancement, etc.) |
| Lifecycle | Dot + text: New / Deployed / PR #N open / Done |
| Age | Monospace date `8d` |
| Actions | Launch/Re-launch button + overflow menu (visible on hover) |

### PRs table columns (from mockup)
| Column | Content |
|---|---|
| Pull Request | State dot (green=open, purple=merged) + title + `#number - by author` |
| Status | Badge: Open / Merged / Draft |
| Linked Issue | `Closes #N` link |
| Changes | `+847 -124 12 files` |
| Age | Monospace date |

### Filter behavior
- Issues: All (default), bug, enhancement, deployed -- client-side filter on loaded data
- PRs: All (default), Open, Merged, Review -- client-side filter
- Search: client-side text filter on title + number
- Default sort: last updated (most recent first)

### Launch/Re-launch logic
- "Launch" if the issue has no `issuectl:deployed` label
- "Re-launch" if the issue has the `issuectl:deployed` label
- Both open the launch confirmation modal (Phase 11)
- For now (before Phase 11), the button is rendered but clicking it does nothing

### Done criteria
- Repo detail page loads and displays issues in a table
- Tabs switch between Issues and PRs views
- Filter chips filter the displayed rows client-side
- Search input filters by title text
- Issues sort by last updated (most recently active first)
- Lifecycle column correctly shows state based on labels + deployment history
- "Launch" vs "Re-launch" text is correct per issue
- Breadcrumb navigation works (back to dashboard)
- Loading skeleton while fetching data

---

## Phase 7: Web -- Issue Detail Page

### Goal
Full issue detail view with rendered markdown body, comment thread, sidebar with deployment history and launch card, and action buttons.

### Files to create/modify

```
packages/web/
  app/
    [owner]/
      [repo]/
        issues/
          [number]/
            page.tsx          # Issue detail: Server Component
            loading.tsx       # Loading skeleton

  components/
    issue/
      IssueBody.tsx           # Rendered markdown body (use react-markdown or similar)
      CommentThread.tsx       # List of comment cards + "Add comment" form at bottom
      CommentCard.tsx         # Single comment: avatar, author, date, body
      CommentForm.tsx         # Textarea + Submit button (client component)
      IssueSidebar.tsx        # Right sidebar container
      LaunchCard.tsx          # "Launch to Claude Code" card with branch name + context summary
      DeploymentTimeline.tsx  # Timeline of deployments (launched, PR opened, etc.)
      ReferencedFiles.tsx     # List of referenced file paths from issue body
      IssueDetails.tsx        # Metadata card: repo, opened date, author, linked PR

  lib/
    actions/
      comments.ts             # Server Action: addComment(owner, repo, number, body)
      issues.ts               # Server Action: closeIssue, updateIssue
    markdown.ts               # Markdown rendering utility (shared config)
```

### Sidebar layout (from mockup)
```
[Launch to Claude Code card]
  branch: issue-515-guest-data-pipeline
  context: issue + 3 comments + 3 files
  [Re-launch button]

[Lifecycle card]
  enhancement  deployed  pr-open

[Deployment History]
  * PR #522 opened          Apr 3
    issue-515-guest-data-pipeline
  * Launched to Claude Code  Apr 2
    issue-515-guest-data-pipeline

[Referenced Files]
  src/lib/optimization/engine.ts
  src/components/rsvp/QuizForm.tsx
  src/app/api/guests/route.ts

[Details]
  Repo     mean-weasel/seatify
  Opened   Mar 28, 2026
  Author   neonwatty
  PR       #522
```

### Comment form behavior
- Textarea with placeholder "Add a comment..."
- Submit button calls Server Action `addComment`
- After submission, revalidate the page data
- Optimistic UI: show the comment immediately with a "posting..." indicator

### Issue body markdown rendering
Use `react-markdown` with:
- GFM support (tables, strikethrough, task lists)
- Code syntax highlighting via `rehype-highlight` or similar
- Inline code styled with the mockup's cyan color
- Links open in new tab

### Done criteria
- Issue detail page renders the full issue body as formatted markdown
- Comments display in chronological order with author, date, avatar
- "Add comment" form posts a comment via Server Action and updates the view
- Deployment timeline shows all launches and linked PRs for this issue
- Referenced files are extracted and displayed in the sidebar
- "Launch to Claude Code" card shows in sidebar with correct branch name preview
- Edit button opens edit mode (Phase 13 -- for now, button is rendered but nonfunctional)
- Close button triggers confirmation dialog, then closes the issue via Server Action
- Breadcrumb: Dashboard > seatify > #515

---

## Phase 8: Web -- PR Detail Page

### Goal
PR detail view with rendered body, review comments, CI checks sidebar, linked issue, and files changed list.

### Files to create/modify

```
packages/web/
  app/
    [owner]/
      [repo]/
        pulls/
          [number]/
            page.tsx          # PR detail: Server Component
            loading.tsx       # Loading skeleton

  components/
    pr/
      PRBody.tsx              # Rendered markdown PR body
      PRSidebar.tsx           # Right sidebar container
      CIChecks.tsx            # CI check list with pass/fail dots and durations
      LinkedIssue.tsx         # Linked issue card (clickable, navigates to issue detail)
      FilesChanged.tsx        # List of changed files with +/- indicators
      PRStats.tsx             # +additions -deletions, files changed count, base/head branches
```

### PR sidebar layout (from mockup)
```
[CI Checks]
  * Build          1m 23s   (green)
  * Lint           0m 18s   (green)
  * Unit Tests     2m 41s   (green)
  * E2E Tests      4m 02s   (red)

[Linked Issue]
  [green dot] #515  End-to-end guest data pipeline

[Branch]
  issue-515-guest-data-pipeline

[Files Changed (12)]
  + src/components/rsvp/QuizForm.tsx
  + src/components/planner/TableEditor.tsx
  ~ src/lib/optimization/engine.ts
  ...
```

### Data flow
```
page.tsx (Server Component)
  -> getPullDetail(owner, repo, number) from @issuectl/core
    -> Fetch PR + checks + linked issue
  -> Render PR body + sidebar
```

### Done criteria
- PR detail page renders the full PR body as markdown
- CI checks display with pass/fail status and duration
- Linked issue shows and links to the issue detail page
- Branch name displays
- Files changed list shows with add/modify indicators
- Diff stats (+/- counts, file count) show at the top
- Review comments display
- Breadcrumb: Dashboard > seatify > PR #522

---

## Phase 9: Web -- Settings Page

### Goal
Settings page with tracked repo management, default configuration, terminal settings, worktree cleanup, and auth status display.

### Files to create/modify

```
packages/web/
  app/
    settings/
      page.tsx                # Settings page: Server Component for reads, Client Components for forms

  components/
    settings/
      TrackedRepos.tsx        # Repo list with edit/remove actions + "Add Repo" button
      RepoRow.tsx             # Single repo row: dot, name, path, actions
      AddRepoForm.tsx         # Form: owner/repo input + local path input (client component)
      DefaultsForm.tsx        # Branch pattern + cache TTL inputs (client component)
      TerminalSettings.tsx    # Read-only "Ghostty" display + window/tab mode selector
      WorktreeCleanup.tsx     # List stale worktrees + delete button
      AuthStatus.tsx          # Authenticated as X via gh auth (with green dot)

  lib/
    actions/
      repos.ts                # Server Actions: addRepo, removeRepo, updateRepo
      settings.ts             # Server Actions: updateBranchPattern, updateCacheTTL, updateTerminalMode
      worktrees.ts            # Server Action: listWorktrees, cleanupWorktree
```

### Settings sections (from mockup)

**Tracked Repositories**
- Table/list of repos with: colored dot, `owner/name`, local path (mono font), Edit / Remove buttons
- Repos without a local path: dashed border, yellow "no local path -- will prompt to clone" text
- "+ Add Repo" button opens inline form or modal

**Defaults**
- Branch pattern: text input, default `issue-{number}-{slug}`
- Cache TTL: number input, default `300` (seconds)

**Terminal**
- Read-only display: "ghostty"
- Window / Tab mode toggle

**Worktrees** (if any exist)
- List of worktrees at `~/.issuectl/worktrees/`
- Each shows: path, linked repo, linked issue, whether the PR is merged (stale)
- "Delete" button per worktree
- "Clean all stale" bulk action

**Authentication**
- Green dot + "Authenticated as **neonwatty** via `gh auth`"
- Read-only display

### Worktree cleanup logic
```
Server Action: listWorktrees
  1. Read ~/.issuectl/worktrees/ directory
  2. For each directory, parse the repo-issue-{number} naming pattern
  3. Check if the linked PR is merged (via GitHub API)
  4. Return list with stale/active status

Server Action: cleanupWorktree(path)
  1. Run `git worktree remove {path}` on the parent repo via execFile
  2. Run `git worktree prune` on the parent repo via execFile
  3. Remove the directory if it still exists
```

### Done criteria
- All tracked repos display with correct info
- "Add Repo" form validates owner/repo format
- "Add Repo" warns (but allows) if local path doesn't exist
- Remove repo shows confirmation dialog
- Edit repo allows changing local path and branch pattern
- Branch pattern and cache TTL save on change
- Terminal mode selector works
- Auth status displays correctly
- Worktree list shows (empty state if no worktrees)
- Worktree cleanup works correctly

---

## Phase 10: Core -- Launch Flow

### Goal
The complete launch flow: context assembly, branch creation/checkout, workspace preparation, temp file writing, deployment recording, and Ghostty terminal spawning.

### Dependencies
- Phase 1 (database: deployments table)
- Phase 2 (GitHub client: labels)
- Phase 3 (cached data: issue detail, file paths)

### Files to create/modify

```
packages/core/
  src/
    launch/
      context.ts            # assembleContext(): build the full prompt from issue data
      branch.ts             # createBranch(), checkoutBranch(), branchExists()
      workspace.ts          # prepareWorkspace(): existing / worktree / clone
      ghostty.ts            # openGhosttyWindow(), openGhosttyTab()
      launch.ts             # executeLaunch(): orchestrates the full flow
    index.ts                # Add re-exports for launch/*
```

### Key function signatures

```typescript
// launch/context.ts
export interface LaunchContext {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  comments: Array<{ author: string; body: string; createdAt: string }>;
  referencedFiles: string[];
  preamble?: string;
  closesInstruction: string;  // "Include 'Closes #515' in any PR created."
}

export function assembleContext(data: LaunchContext): string;  // Returns the full markdown prompt
export function writeContextFile(context: string, issueNumber: number): string;  // Writes to /tmp, returns path

// launch/branch.ts
export async function branchExists(repoPath: string, branchName: string): Promise<boolean>;
export async function createOrCheckoutBranch(repoPath: string, branchName: string): Promise<void>;
export function generateBranchName(pattern: string, issueNumber: number, issueTitle: string): string;

// launch/workspace.ts
export type WorkspaceMode = 'existing' | 'worktree' | 'clone';

export interface WorkspaceResult {
  path: string;
  mode: WorkspaceMode;
  created: boolean;  // true if worktree/clone was newly created
}

export async function prepareWorkspace(options: {
  mode: WorkspaceMode;
  repoPath: string;
  owner: string;
  repo: string;
  branchName: string;
  issueNumber: number;
  worktreeDir: string;
}): Promise<WorkspaceResult>;

// launch/ghostty.ts
export function openGhosttyWindow(workspacePath: string, contextFilePath: string): void;
export function openGhosttyTab(workspacePath: string, contextFilePath: string): void;

// launch/launch.ts
export interface LaunchOptions {
  owner: string;
  repo: string;
  issueNumber: number;
  branchName: string;
  workspaceMode: WorkspaceMode;
  selectedComments: number[];   // indices of comments to include
  selectedFiles: string[];      // file paths to include
  preamble?: string;
  terminalMode: 'window' | 'tab';
}

export async function executeLaunch(options: LaunchOptions): Promise<{
  deploymentId: number;
  branchName: string;
  workspacePath: string;
  contextFilePath: string;
}>;
```

### Launch execution steps (in order)

```
executeLaunch(options):
  1. Fetch issue detail (getIssueDetail)
  2. Filter comments/files based on selections
  3. Assemble context string
  4. Write context to /tmp/issuectl-launch-{issueNumber}.md
  5. Get repo local_path from DB
  6. Prepare workspace:
     - existing: git checkout main && git pull && git checkout -b {branch} (or checkout existing)
     - worktree: git worktree add {path} -b {branch} (from parent repo)
     - clone: git clone --depth=1 {url} {path} && cd {path} && git checkout -b {branch}
  7. Apply issuectl:deployed label (ensureLifecycleLabels first)
  8. Record deployment in DB
  9. Open Ghostty terminal
  10. Return result
```

### Ghostty integration
The exact Ghostty CLI interface needs investigation (see technical risks). The assumed approach uses `execFile` to spawn a detached Ghostty process:

```
New window:
  ghostty -e bash -c 'cd {workspacePath} && cat {contextFile} | claude'

New tab (if supported):
  ghostty --new-tab -e bash -c '...'
```

All git operations (checkout, pull, worktree add, clone) use `execFile` with explicit argument arrays to avoid shell injection.

### Context file format

```markdown
## Issue #{number}: {title}

{issue body}

---

## Comments

**{author}** ({date}):
{comment body}

**{author}** ({date}):
{comment body}

---

## Referenced Files

- {file path 1}
- {file path 2}
- {file path 3}

---

{custom preamble, if any}

---

**Important:** Include `Closes #{number}` in any PR you create for this issue.
```

### Technical risks

1. **Ghostty CLI interface.** The exact flags for spawning a new Ghostty window/tab with a command need verification. Ghostty's CLI may use different syntax than assumed. Investigate `ghostty --help` and Ghostty docs before implementing.

2. **Piping context to Claude Code.** The mechanism `cat file | claude` needs verification. Claude Code may accept input via stdin pipe, or it may need a `--prompt-file` flag or similar. Check Claude Code docs/help.

3. **Git operations in existing repos.** Switching branches in a user's existing repo could discard uncommitted changes. The launch flow should check for a clean working tree (`git status --porcelain`) and warn/error if dirty.

4. **Worktree creation.** `git worktree add` requires the branch to not already be checked out elsewhere. Handle the case where the branch exists and is checked out in the main worktree.

### Done criteria
- `assembleContext` produces the correct markdown format
- `writeContextFile` writes to `/tmp/issuectl-launch-{number}.md`
- `generateBranchName` correctly slugifies: `issue-515-end-to-end-guest-data-pipeline`
- `prepareWorkspace` handles all three modes (existing, worktree, clone)
- `executeLaunch` orchestrates all steps in the correct order
- Ghostty opens with Claude Code in the correct directory
- Context is piped to Claude Code successfully
- Deployment is recorded in the database
- `issuectl:deployed` label is applied to the issue

---

## Phase 11: Web -- Launch Modal + Launch Active View

### Goal
The launch confirmation modal (branch name, workspace mode, context toggles, custom preamble) and the post-launch progress view showing step-by-step status.

### Dependencies
- Phase 10 (core launch flow)

### Files to create/modify

```
packages/web/
  components/
    launch/
      LaunchModal.tsx         # Full launch confirmation modal (client component)
      BranchInput.tsx         # Editable branch name with "exists" indicator
      WorkspaceModeSelector.tsx  # Radio group: Existing / Worktree / Clone
      ContextToggles.tsx      # Checkboxes for issue body, comments, files
      PreambleInput.tsx       # Optional textarea for custom preamble
      LaunchProgress.tsx      # Step-by-step progress view (after launch initiated)
      LaunchActiveBanner.tsx  # "Claude Code session active" banner
      ClonePromptModal.tsx    # Modal for repos without a local path

  app/
    [owner]/
      [repo]/
        issues/
          [number]/
            launch/
              page.tsx        # Launch active view (shows progress + context preview)

  lib/
    actions/
      launch.ts               # Server Action: executeLaunch -- calls core launch flow
```

### Launch modal layout (from mockup)

```
[Header] Launch to Claude Code                    [X]

[Issue summary card]
  * #515 - End-to-end guest data pipeline
    mean-weasel/seatify

[Branch]
  issue-515-guest-data-pipeline                   (editable input)
  "Existing branch will be checked out"

[Workspace]
  (*) Existing repo        ~/Desktop/seatify
  ( ) Git worktree         ~/.issuectl/worktrees/seatify-515/
  ( ) Fresh clone          /tmp/issuectl-seatify-515/

[Context]
  [x] Issue body                    always included
  [x] Comment: neonwatty (6d ago)
  [x] Comment: neonwatty (4d ago)
  [x] Comment: neonwatty (2d ago)
  --------------------------------
  [x] src/lib/optimization/engine.ts
  [x] src/components/rsvp/QuizForm.tsx
  [x] src/app/api/guests/route.ts

[Custom preamble]
  (optional textarea)

[Footer]                              [Cancel] [Launch]
```

### Launch progress view

After clicking "Launch", the web app navigates to `/{owner}/{repo}/issues/{number}/launch` and shows:

```
Launching #515 to Claude Code

[spinner] Claude Code session active
Opened in Ghostty - branch: issue-515-guest-data-pipeline

  [check] Assembled issue context
          issue + 3 comments + 3 referenced files

  [check] Checked deployment history
          Previous: PR #522 open - Apr 2

  [check] Checked out branch
          issue-515-guest-data-pipeline (existing)

  [check] Applied lifecycle label
          issuectl:deployed

  [spin]  Claude Code running
          Session opened in Ghostty at ~/Desktop/seatify

[Context preview box]

[Back to issue] [Back to seatify]
```

### Server Action for launch

```typescript
// lib/actions/launch.ts
'use server';

import { executeLaunch } from '@issuectl/core';

export async function launchIssue(formData: {
  owner: string;
  repo: string;
  issueNumber: number;
  branchName: string;
  workspaceMode: 'existing' | 'worktree' | 'clone';
  selectedCommentIndices: number[];
  selectedFilePaths: string[];
  preamble?: string;
}): Promise<{ success: boolean; deploymentId?: number; error?: string }>;
```

### Clone prompt modal
When launching an issue on a repo without a local path, show the clone prompt modal before the launch modal:

```
[Header] Repository not cloned                   [X]

[Warning banner]
  joshuayoes/ios-simulator-mcp has no local path configured.
  To launch Claude Code, the repo needs to be cloned locally.

[Clone to]
  ~/Desktop/ios-simulator-mcp                    (editable input)

[Footer]                         [Cancel] [Clone & Launch]
```

### Done criteria
- Launch modal opens with correct issue data pre-filled
- Branch name is editable and shows "exists" / "new" indicator
- Workspace mode radio buttons show correct paths
- Context toggles allow deselecting individual comments and files
- Custom preamble field accepts text
- "Launch" button triggers server action and navigates to progress view
- Progress view shows step-by-step completion status
- Clone prompt modal appears for repos without local paths
- After launch, the issue detail page shows the deployment in the timeline

---

## Phase 12: Core -- Lifecycle Label Management

### Goal
Automatic lifecycle label management: apply `issuectl:deployed` on launch (already done in Phase 10), detect PRs and apply `issuectl:pr-open`, detect merges and apply `issuectl:done`.

### Files to create/modify

```
packages/core/
  src/
    lifecycle/
      reconcile.ts          # reconcileIssueLifecycle(): check PR state, update labels
      detect.ts             # detectLinkedPRs(): find PRs that reference an issue
    index.ts                # Add re-exports
```

### Key function signatures

```typescript
// lifecycle/reconcile.ts
export async function reconcileIssueLifecycle(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<{
  labelsAdded: string[];
  labelsRemoved: string[];
  linkedPR: { number: number; state: string } | null;
}>;

export async function reconcileRepoLifecycle(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<void>;  // Reconciles all deployed issues in a repo
```

### Reconciliation logic

For each issue with the `issuectl:deployed` label:

```
1. Find linked PRs (body contains "Closes #N" / "Fixes #N")
2. If a linked PR exists and is open:
   - Add issuectl:pr-open if not present
3. If a linked PR is merged:
   - Remove issuectl:pr-open if present
   - Add issuectl:done if not present
4. If no linked PR found:
   - Keep issuectl:deployed (no change)
5. Update deployments.linked_pr_number in DB
```

### When reconciliation runs
- **On page load** in the web app: when fresh data arrives (not from cache), reconcile deployed issues
- **Not on manual refresh**: the "Refresh" button only refreshes data, not labels (per design spec)
- **Not in the background**: no polling or webhooks in v1

### Integration with web app

In `data/issues.ts`, modify `getIssueDetail`: after fetching fresh issue data (not from cache), run `reconcileIssueLifecycle`. This updates labels on GitHub and returns the updated state.

In `data/repos.ts`, modify `getDashboardData`: after fetching fresh data for a repo, run `reconcileRepoLifecycle`. This ensures dashboard stats reflect current lifecycle state.

### Done criteria
- `issuectl:pr-open` is added when a linked PR is detected and open
- `issuectl:pr-open` is removed when the linked PR is merged
- `issuectl:done` is added when the linked PR is merged and the issue is closed
- Reconciliation only runs on fresh fetches (not cached data)
- `deployments.linked_pr_number` is updated when a PR is detected
- Labels are auto-created on repos that don't have them yet

---

## Phase 13: Web -- Create Issue, Edit Issue, Close Issue

### Goal
Full issue mutation flows: create issue modal, inline edit, and close with confirmation.

### Files to create/modify

```
packages/web/
  components/
    issue/
      CreateIssueModal.tsx    # Full create issue modal (client component)
      EditIssueForm.tsx       # Inline edit mode for title + body
      CloseIssueDialog.tsx    # Confirmation dialog for closing
      LabelSelector.tsx       # Toggle existing labels on/off (shared between create + edit)
    ui/
      ConfirmDialog.tsx       # Reusable confirmation dialog component
      Modal.tsx               # Reusable modal overlay component

  lib/
    actions/
      issues.ts               # Update with: createIssue, updateIssue, closeIssue, toggleLabel
```

### Create issue modal (from mockup)

```
[Header] Create Issue                             [X]

[Repository]
  [dot] mean-weasel/seatify                    change

[Title]
  (text input)

[Description (markdown)]
  (textarea)

[Labels]
  [enhancement] [bug] [documentation] [good first issue]
  (toggleable chips -- selected ones are highlighted)

[Footer]                          [Cancel] [Create Issue]
```

### Server Actions

```typescript
// lib/actions/issues.ts
'use server';

export async function createIssueAction(data: {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
}): Promise<{ success: boolean; issueNumber?: number; error?: string }>;

export async function updateIssueAction(data: {
  owner: string;
  repo: string;
  number: number;
  title?: string;
  body?: string;
}): Promise<{ success: boolean; error?: string }>;

export async function closeIssueAction(data: {
  owner: string;
  repo: string;
  number: number;
}): Promise<{ success: boolean; error?: string }>;

export async function toggleLabelAction(data: {
  owner: string;
  repo: string;
  number: number;
  label: string;
  action: 'add' | 'remove';
}): Promise<{ success: boolean; error?: string }>;
```

### Edit mode behavior
- "Edit" button on issue detail page switches the title + body to editable form
- Title becomes a text input pre-filled with current title
- Body becomes a textarea pre-filled with current markdown
- "Save" and "Cancel" buttons appear
- Save calls `updateIssueAction` and revalidates the page

### Close confirmation
- "Close" button opens `ConfirmDialog` with: "Close issue #515?"
- "Close" / "Cancel" buttons
- Close calls `closeIssueAction`, revalidates, and optionally navigates back to repo detail

### Label management
- Issue detail sidebar shows current labels
- Clicking a label or the "Label" button opens a label selector
- Available labels are fetched from the GitHub repo's label list
- Toggle a label on/off per issue
- `issuectl:*` lifecycle labels are read-only (managed automatically, not manually toggleable)

### Done criteria
- Create issue modal opens from repo detail page "New Issue" button
- Create issue modal shows repo selector (defaults to current repo)
- Created issue appears in the issues table after creation
- Edit mode allows changing title and body
- Close issue shows confirmation dialog
- Label selector shows repo labels and allows toggling
- Lifecycle labels (`issuectl:*`) are not manually toggleable
- All mutations show success/error feedback
- Page data revalidates after any mutation

---

## Phase 14: Web -- Onboarding + Auth Error Edge States

### Goal
First-run experience (no repos configured) and auth error screen (gh not authenticated).

### Files to create/modify

```
packages/web/
  app/
    page.tsx                    # Modify: check for repos, show onboarding if empty
    auth-error/
      page.tsx                  # Auth error page (or render conditionally in layout)

  components/
    onboarding/
      WelcomeScreen.tsx         # Full welcome screen with "Add your first repository" form
    auth/
      AuthErrorScreen.tsx       # Auth error with step-by-step fix instructions
      AuthGuard.tsx             # Wrapper component that checks auth status

  lib/
    auth.ts                     # checkAuth(): called in layout or middleware
```

### Onboarding screen (from mockup)

```
        [ic logo, large]
   Welcome to issuectl

   Manage GitHub issues and PRs across all your
   repos from one place. Launch any issue directly
   into Claude Code with a single click.

   +----------------------------------+
   | Add your first repository        |
   |                                  |
   | Repository                       |
   | [owner/repo input]               |
   |                                  |
   | Local path (optional)            |
   | [~/Desktop/repo input]           |
   |                                  |
   | [    Add Repository    ]         |
   +----------------------------------+

   Or run `issuectl repo add owner/repo` from the CLI
```

### Auth error screen (from mockup)

```
        [! icon, red]
   GitHub authentication required

   issuectl uses the GitHub CLI for authentication.
   It looks like `gh` is not authenticated.

   +----------------------------------+
   | To fix this:                     |
   |                                  |
   |  1  Install the GitHub CLI       |
   |     brew install gh              |
   |                                  |
   |  2  Authenticate                 |
   |     gh auth login                |
   |                                  |
   |  3  Restart issuectl             |
   |     Refresh this page or restart |
   +----------------------------------+

   [Try again]
```

### Auth checking approach
- In `app/layout.tsx` (or a layout-level Server Component wrapper), call `checkGhAuth()` from `@issuectl/core`
- If auth fails: render `AuthErrorScreen` instead of the normal layout
- If auth succeeds but no repos: render `WelcomeScreen` on the dashboard page
- "Try again" button on auth error page reloads the page (re-runs the Server Component)

### Done criteria
- When `gh` is not authenticated, the auth error screen renders instead of the dashboard
- "Try again" re-checks auth status
- When no repos are configured, the welcome/onboarding screen shows
- Adding a repo from the onboarding screen transitions to the dashboard
- Both screens match the mockup design

---

## Phase 15: Polish -- Stale-While-Revalidate UX, Loading States, Error Handling

### Goal
Complete the stale-while-revalidate user experience, add proper loading skeletons, error boundaries, and handle edge cases throughout the app.

### Files to create/modify

```
packages/web/
  app/
    error.tsx                   # Root error boundary
    not-found.tsx               # 404 page
    [owner]/
      [repo]/
        error.tsx               # Repo-level error boundary
        not-found.tsx           # Repo not found

  components/
    ui/
      LoadingSkeleton.tsx       # Reusable skeleton placeholder component
      ErrorMessage.tsx          # Reusable error display with retry button
      CacheIndicator.tsx        # "cached Xm ago - updating..." indicator
      Toast.tsx                 # Success/error toast notifications for mutations
    dashboard/
      CacheBar.tsx              # Update: show "updating..." state during revalidation

  lib/
    hooks/
      useSWR.ts                 # Client-side hook for background revalidation with UI updates
```

### SWR UX flow

```
Page load:
  1. Server Component returns cached data (fast)
  2. Page renders immediately with cached data
  3. CacheIndicator shows "cached 2m ago"
  4. If stale: client component triggers revalidation via Server Action
  5. CacheIndicator updates to "cached 2m ago - updating..."
  6. When fresh data arrives: page re-renders, CacheIndicator shows "just now"
```

### Implementation approach
- Server Components return the cached data with `cachedAt` and `isStale` flags
- A client component (`<Revalidator>`) checks `isStale` and triggers a Server Action to refresh
- The Server Action fetches fresh data, updates the cache, and calls `revalidatePath()` or `revalidateTag()`
- Next.js re-renders the Server Component with fresh data

### Loading skeletons
Every page needs a `loading.tsx` file with appropriate skeleton UI:
- Dashboard: grid of skeleton repo cards
- Repo detail: skeleton table rows
- Issue detail: skeleton body block + sidebar cards
- PR detail: skeleton body + sidebar
- Settings: skeleton form fields

### Error handling
- **Network errors** (GitHub API down): Show error message with retry button
- **Auth expired** (token revoked mid-session): Redirect to auth error page
- **Rate limiting**: Show rate limit message with reset time
- **Repo not found** (deleted from GitHub): Show helpful message, suggest removing from settings
- **DB errors** (corrupted/missing): Show error with "re-run `issuectl init`" instructions

### Mutation feedback
- Success: brief toast notification ("Issue created", "Comment posted")
- Error: error toast with details ("Failed to close issue: {reason}")
- Loading: button shows spinner/disabled state while Server Action executes

### Done criteria
- All pages show loading skeletons during data fetch
- Cache indicator shows correct state (fresh / stale / updating)
- Background revalidation updates the page without full reload
- Error boundaries catch and display errors gracefully
- 404 pages show for invalid routes
- Mutation success/error feedback works via toasts
- Rate limit errors are handled with user-friendly messages
- Auth errors mid-session redirect to the auth error page

---

## Dependency Graph

```
Phase 0: Scaffolding
  |
  v
Phase 1: Core DB -----> Phase 4: CLI (init, web, repo)
  |                        |
  v                        v
Phase 2: Core GitHub     (web server is running)
  |                        |
  v                        v
Phase 3: Core Cached --> Phase 5:  Dashboard
  |                        |
  |                        v
  |                     Phase 6:  Repo Detail
  |                        |
  |                        v
  |                     Phase 7:  Issue Detail
  |                        |
  |                        v
  |                     Phase 8:  PR Detail
  |                        |
  |                        v
  |                     Phase 9:  Settings
  |                        |
  v                        v
Phase 10: Core Launch -> Phase 11: Launch Modal + Progress
  |                        |
  v                        v
Phase 12: Lifecycle ----> (integrated into data layer)
                           |
                           v
                        Phase 13: Issue Mutations
                           |
                           v
                        Phase 14: Edge States
                           |
                           v
                        Phase 15: Polish
```

### Parallelization opportunities
- Phases 1 + 0 are strictly sequential (1 depends on 0)
- Phases 2 + 3 are sequential (3 depends on 2, 2 depends on 1)
- Phase 4 can start as soon as Phase 1 is done (init only needs DB)
- Phases 5-9 are sequential for UI (each page builds on the previous layout/components)
- Phase 10 can be developed in parallel with Phases 5-9 (core package, no web dependency)
- Phase 12 can be developed in parallel with Phases 8-9
- Phases 13-15 are sequential cleanup/polish

---

## Technical Risks and Open Questions

### Must investigate before implementation

1. **Ghostty CLI interface for spawning windows/tabs.**
   The exact command-line flags for opening a new Ghostty window with a command need to be verified. The assumed syntax (`ghostty -e 'command'`) may not be correct.
   **Mitigation:** Check `ghostty --help` and Ghostty documentation during Phase 10.

2. **Piping context to Claude Code via stdin.**
   The assumption that `cat context.md | claude` works needs verification. Claude Code may require a different input mechanism (e.g., `--prompt-file`, `--resume`, or reading from a file path argument).
   **Mitigation:** Test Claude Code CLI interface during Phase 10. Fallback: write the context file and pass it as an argument.

3. **better-sqlite3 native bindings in the monorepo.**
   `better-sqlite3` has native (C++) bindings that can cause issues with monorepo tooling, especially with pnpm's symlink structure. The `.npmrc` `shamefully-hoist=true` setting should help, but may need additional configuration.
   **Mitigation:** Test the native binding immediately after Phase 1 setup. If it fails, try `pnpm.overrides` or a different SQLite library (`sql.js` for pure JS fallback).

4. **Next.js `transpilePackages` with ESM workspace dependencies.**
   Next.js needs to transpile `@issuectl/core` since it's a local workspace package. The `transpilePackages` config in `next.config.ts` should handle this, but there can be edge cases with ESM/CJS interop, especially with native modules like `better-sqlite3`.
   **Mitigation:** Test the import chain early in Phase 5. If issues arise, consider building `@issuectl/core` to CJS as well or using Next.js's `serverExternalPackages` for `better-sqlite3`.

5. **Git operations safety.**
   The launch flow switches branches and creates worktrees. Switching branches in a dirty working tree could cause data loss. Worktree creation fails if the branch is already checked out somewhere.
   **Mitigation:** Always check `git status --porcelain` before branch operations. If dirty, error with a message asking the user to commit or stash. For worktrees, handle the "branch already checked out" case by detaching the main worktree or prompting the user.

6. **Server Actions spawning OS processes.**
   The launch flow needs to spawn a Ghostty process from a Next.js Server Action. Server Actions run in the Node.js server process, so `execFile`/`spawn` should work, but the spawned process needs to be detached so it survives independently.
   **Mitigation:** Verify detached process behavior in Phase 10. Use `spawn` with `{ detached: true, stdio: 'ignore' }` and call `unref()` on the child process.

### Low risk but worth noting

7. **Octokit rate limiting.** GitHub's API rate limit is 5,000 requests/hour for authenticated users. With the caching layer (default 5-minute TTL), this should be more than sufficient. However, aggressive refreshing or tracking many repos could approach the limit.

8. **SQLite concurrent access.** The web server and potentially the CLI could access the SQLite database simultaneously. `better-sqlite3` uses WAL mode by default, which handles concurrent reads well. Concurrent writes are serialized but fast enough for this use case.

9. **Large issue bodies / comment threads.** Some GitHub issues have very long bodies or hundreds of comments. The context assembly should handle this gracefully (perhaps with a size limit on the generated context file).
