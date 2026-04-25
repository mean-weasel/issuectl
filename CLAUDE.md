# issuectl

Cross-repo GitHub issue command center with Claude Code launch integration.

## Project overview

- **Monorepo:** pnpm workspaces + Turborepo
  - `packages/core` — shared business logic (SQLite, Octokit, launch flow)
  - `packages/cli` — CLI entry point (`issuectl init`, `issuectl web`, `issuectl repo`)
  - `packages/web` — Next.js App Router dashboard (Server Components + Server Actions)
- **Spec:** `docs/specs/2026-04-06-issuectl-design.md`
- **Implementation plan:** `docs/specs/2026-04-06-implementation-plan.md`
- **Mockups:** `docs/mockups/web.html` (primary reference), `docs/mockups/index.html` (gallery)

## Key technology

| Layer | Choice |
|---|---|
| Package manager | pnpm (workspaces) |
| Build orchestration | Turborepo |
| Bundler (core/cli) | tsup (ESM, DTS) |
| Web framework | Next.js App Router |
| Data mutations | Server Actions |
| GitHub API | Octokit (`@octokit/rest`) |
| Auth | `gh auth token` (no separate login) |
| Database | SQLite via `better-sqlite3` at `~/.issuectl/issuectl.db` |
| Terminal | ttyd (web-based, embedded in dashboard) |
| Styling | CSS Modules + global design tokens (no Tailwind) |

## Code conventions

- **ESM everywhere.** All packages use `"type": "module"`. No CJS.
- **Strict TypeScript.** `strict: true` in all tsconfig files.
- **No classes.** Use plain functions and objects. The codebase is functional.
- **Explicit DB parameter.** Core DB functions accept a `Database` argument — no global/singleton DB access inside core. The caller (CLI or web server) creates the connection and passes it in.
- **Octokit as parameter.** GitHub functions accept an `Octokit` instance — no global Octokit. Same pattern as the DB.
- **Server Actions for all mutations.** The web app never calls core functions directly from Client Components. All writes go through Server Actions in `packages/web/lib/actions/`.
- **Server Components for reads.** Pages are Server Components that call core data functions directly.
- **CSS Modules for component styles.** One `.module.css` file per component. Global tokens in `app/globals.css`. Match the design tokens from the mockup HTML files.

## Build and run

```bash
pnpm install                    # Install all dependencies
pnpm turbo build                # Build all packages (core first, then cli/web)
pnpm turbo typecheck            # Type-check all packages
pnpm turbo dev                  # Dev mode (core watch + web dev server)
issuectl init                   # First-time setup (creates DB)
issuectl web                    # Start dashboard (localhost:3847)
```

## Logging

The web server writes structured JSON logs via pino to **two destinations simultaneously**:

| Destination | Purpose |
|---|---|
| stdout | Live view in the terminal running `issuectl web` |
| `~/.issuectl/logs/web.log` | Durable file — survives terminal close, process crash |

The log file rotates at **10 MB**, keeping one `.1` backup (`web.log.1`).

**Key log events:**

| `msg` field | Level | What it tells you |
|---|---|---|
| `server_start` | info | Server boot with port, mode, log file path |
| `server_shutdown` | info | Graceful shutdown initiated |
| `http_request` | debug | Every HTTP request: method, url, status, duration (ms) |
| `heartbeat` | debug | Every 30s: heap/RSS memory (MB), active WebSocket count |
| `ws_connect` | info | WebSocket proxy opened: port, client IP, active count |
| `ws_close` | info | WebSocket proxy closed: reason, duration, frame stats |
| `ws_tick` | debug | Per-connection frame stats every 5s |
| `ws_upstream_error` | error | ttyd WebSocket errored |
| `ws_client_error` | error | Client-side WebSocket errored |
| `uncaught_exception` | fatal | Unhandled error — logged before process exits |
| `unhandled_rejection` | fatal | Unhandled promise rejection — logged before process exits |

**Reading logs:**

```bash
# Tail live (raw JSON)
tail -f ~/.issuectl/logs/web.log

# Pretty-print with jq
tail -f ~/.issuectl/logs/web.log | jq .

# Filter for errors and fatals
cat ~/.issuectl/logs/web.log | jq 'select(.level >= 50)'

# Show only WebSocket events
cat ~/.issuectl/logs/web.log | jq 'select(.msg | startswith("ws_"))'
```

## Quality gates

### After writing code — ALWAYS run these

1. **`/simplify`** — Run after completing any logical chunk of code (a new file, a feature, a bug fix). This catches unnecessary complexity, redundant abstractions, and style drift before they accumulate. Do not skip this.

2. **Type-check:** `pnpm turbo typecheck` — Run after any code change. The project uses strict TypeScript; type errors must be fixed before moving on.

### After completing a logical step within a phase

3. **`code-reviewer` agent** — Run the code-reviewer agent after completing each logical step of work (e.g., finished a new module, wired up a page, implemented a server action). Don't wait until the whole phase is done. Review early, review often. This catches bugs, logic errors, security issues, and drift from project conventions while the code is still fresh.

### After completing a phase or major feature

4. **`/pr-review-toolkit:review-pr`** — Run a comprehensive PR review before considering any phase complete. This is the final gate. It reviews all changes holistically — cross-file issues, missed edge cases, convention violations across the full diff. Use the full review, not a quick scan. A `PreToolUse` hook in `hooks/enforce-pr-review.sh` enforces this — `gh pr create` is blocked until the review has run. Always run `/pr-review-toolkit:review-pr all` before creating a PR. Address every Critical and Important issue before proceeding.

5. **Validate the plugin/project structure** as needed — if you've added new packages, changed the monorepo structure, or modified build config, verify that `pnpm turbo build` still succeeds and all packages resolve correctly.

### When uncertain — ASK

5. **Use the `AskUserQuestion` tool liberally.** This project has specific design decisions documented in the spec and plan. When you encounter ambiguity, a judgment call, or a situation not covered by the docs:
   - **ASK** rather than guess. A 30-second question avoids a 30-minute rework.
   - Offer concrete options with trade-offs, not open-ended "what should I do?"
   - Common situations where you should ask:
     - The spec/plan doesn't cover a specific UI behavior or edge case
     - You're choosing between two reasonable implementation approaches
     - A technical risk from the plan (ttyd, better-sqlite3 bindings, etc.) materializes and needs a decision
     - You're about to deviate from the plan (different file structure, different API shape, etc.)
     - A dependency has an unexpected API or limitation
   - **Do not ask** about things you can verify yourself (does a function exist, does a type match, does a build pass).

## File reference patterns

When the spec or plan references a file, check if it exists before assuming its contents. The plan describes intended files — they may not exist yet or may have evolved during implementation.

## Testing

| Layer | Tool | Command |
|---|---|---|
| Unit / integration | Vitest | `pnpm turbo test` (all) or `pnpm --filter @issuectl/core test` |
| E2E | Playwright **CLI** | `pnpm --filter @issuectl/web test:e2e` (dev server must be running on :3847) |

- Test files live next to the code they test (`foo.test.ts` alongside `foo.ts`)
- E2E specs live in `packages/web/e2e/`
- Core package: unit tests for DB operations, GitHub client functions, launch flow, data aggregation
- Web package: integration tests for Server Actions, Playwright e2e for critical user flows
- **Playwright CLI only.** Use `@playwright/test` via the CLI (`playwright test`). Do NOT use the Playwright MCP server or browser-in-Claude approaches. All e2e tests run headless from the terminal.

## Browser access

**Never use the Claude in Chrome extension.** For any browser interaction — testing, visual verification, screenshots, UI auditing — always use the Playwright CLI. This applies to all contexts, not just E2E tests.

## QA

QA skills are available for targeted quality checks. All browser-based checks use the **Playwright CLI** — never the Playwright MCP server.

- **smoke-tester** — Quick pass/fail check of app workflows via Playwright CLI
- **ux-auditor** — Visual/interaction quality audit against Paper design system
- **mobile-ux-auditor** — Mobile-specific audit at 393x852 viewport
- **performance-profiler** — Web Vitals and static code anti-pattern scan
- **adversarial-breaker** — Edge cases, bad inputs, auth bypass attempts

## Git

- Branch naming: `phase-{N}-{short-description}` for implementation work
- Commit messages: concise, imperative, focused on the "why"
- One commit per logical change, not one commit per file
