# issuectl

Cross-repo GitHub issue command center with Claude Code and Codex launch integration.

## Project overview

- **Monorepo:** pnpm workspaces + Turborepo
  - `packages/core` — shared business logic (SQLite, Octokit, launch flow)
  - `packages/cli` — CLI entry point (`issuectl init`, `issuectl web`, `issuectl repo`)
  - `packages/web` — Next.js App Router dashboard (Server Components + Server Actions)
  - `apple/` — native SwiftUI Apple clients: iOS app, macOS sidebar app, and shared Swift API/model layer
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
| Launch agents | Claude Code or Codex, selectable per launch or via settings |
| Styling | CSS Modules + global design tokens (no Tailwind) |
| Apple targets | iOS 18+ and macOS 15+, Swift 6.0, SwiftUI |
| Apple project gen | XcodeGen (`apple/project.yml`) |
| Apple client networking | URLSession async/await → server REST API (`/api/v1/`) |

## Code conventions

- **ESM everywhere.** All packages use `"type": "module"`. No CJS.
- **Strict TypeScript.** `strict: true` in all tsconfig files.
- **No classes.** Use plain functions and objects. The codebase is functional.
- **Explicit DB parameter.** Core DB functions accept a `Database` argument — no global/singleton DB access inside core. The caller (CLI or web server) creates the connection and passes it in.
- **Octokit as parameter.** GitHub functions accept an `Octokit` instance — no global Octokit. Same pattern as the DB.
- **Server Actions for all mutations.** The web app never calls core functions directly from Client Components. All writes go through Server Actions in `packages/web/lib/actions/`.
- **Server Components for reads.** Pages are Server Components that call core data functions directly.
- **CSS Modules for component styles.** One `.module.css` file per component. Global tokens in `app/globals.css`. Match the design tokens from the mockup HTML files.

### Apple client conventions (`apple/`)

- **SwiftUI first.** Keep platform-specific UIKit/AppKit bridges isolated to app-specific files.
- **No third-party dependencies.** Use only Apple frameworks.
- **Async/await everywhere.** No completion handlers.
- **@Observable macro** for state management.
- **XcodeGen for project generation.** `apple/project.yml` is the source of truth. Run `xcodegen generate` from the `apple/` directory after modifying it. The `.xcodeproj` is checked in for convenience.
- **File organization:** `apple/IssueCTL/` is the iOS app, `apple/IssueCTLMac/` is the macOS sidebar app, and `apple/IssueCTLShared/` contains shared Codable models, API services, and helpers used by both.

## Build and run

```bash
pnpm install                    # Install all dependencies
pnpm turbo build                # Build all packages (core first, then cli/web)
pnpm turbo typecheck            # Type-check all packages
pnpm turbo dev                  # Dev mode (core watch + web dev server)
issuectl init                   # First-time setup (creates DB)
issuectl web                    # Start dashboard (localhost:3847)
```

### iOS build & run

Use the `xcodebuildmcp` CLI for normal iOS build, test, run, and simulator operations. Avoid raw `xcodebuild`, `xcrun simctl`, or `simctl` unless a documented workflow below needs behavior the MCP wrapper does not expose reliably.

**Discovery pattern:**
```bash
xcodebuildmcp --help                     # top-level workflows
xcodebuildmcp <workflow> --help          # commands in a workflow
xcodebuildmcp <workflow> <command> --help # flags for a command
```

**Common commands:**
```bash
xcodebuildmcp simulator build-and-run    # build + install + launch (one-shot)
xcodebuildmcp simulator build            # compile only
xcodebuildmcp simulator test             # run XCTests
xcodebuildmcp simulator screenshot       # capture simulator screen
xcodebuildmcp simulator list             # available simulators
xcodebuildmcp ui-automation snapshot-ui  # view hierarchy with coordinates
xcodebuildmcp ui-automation tap --label "Button"  # tap by accessibility label
xcodebuildmcp ui-automation tap -x 200 -y 400     # tap by coordinates
xcodebuildmcp ui-automation swipe        # swipe gesture
xcodebuildmcp tools                      # list all 72 tools
```

**Rules:**
- Run `xcodebuildmcp setup` if `.xcodebuildmcp/config.yaml` doesn't exist yet
- Prefer `build-and-run` over separate build → install → launch steps
- Session defaults auto-fill `--scheme`, `--project-path`, `--simulator-name` from config
- All `--simulator-id` values come from `xcodebuildmcp simulator list`
- Use `--help` on any command to discover flags — don't guess

### iOS physical-device roles

Use these device roles for physical iPhone deploys and testing:

- `iPhone-preview`: the only/default iPhone for preview-app deployments, preview UI tests, physical-device performance timing, and future GitHub Actions runner work.
- `iPhone-prod`: the production iPhone. Use it only for production app installs and production validation.

Do not deploy `IssueCTL Preview`, run preview smoke tests, or run preview performance timing on `iPhone-prod` unless the user explicitly asks for a production-device check. When a workflow asks for a physical preview device, select `iPhone-preview` from `pnpm ios:list-devices`, Xcode destinations, or CoreDevice output and use that device's current identifier.

The required physical preview merge-queue check is `Physical iPhone Preview Smoke` in `.github/workflows/ios-physical-preview.yml`. It must run only on the repo-scoped self-hosted runner named `issuectl-iphone-preview` with labels `issuectl-ios` and `iphone-preview`, and it should use `IOS_DEVICE_NAME=iPhone-preview` instead of hard-coded device identifiers. The runner is installed at `~/issuectl-iphone-preview-runner`; manage it with `./svc.sh status`, `./svc.sh start`, and `./svc.sh stop` from that directory.

Before physical preview builds, run `pnpm ios:preview-runner-preflight`. The GitHub workflow runs the same script to unlock the signing keychain from `IOS_PREVIEW_KEYCHAIN_PASSWORD`, verify a visible Apple Development identity, verify Automation Mode, resolve `iPhone-preview`, and fail fast if the phone is locked. If the LaunchAgent runner reports `errSecInternalComponent` during `CodeSign`, treat it as a service keychain/signing-access failure first; do not switch preview tests to `iPhone-prod`.

Manual operational workflows:
- `iOS Preview Runner Health`: preflight only; use it to verify runner/signing/phone readiness without building.
- `iOS Preview Install`: installs `IssueCTL Preview` on `iPhone-preview` from a selected ref and can optionally run physical preview smoke.

### iOS performance timing

The iOS app has lightweight `PerformanceTrace` instrumentation for measuring app-side performance. It logs:

- `app_launch_usable` — app launch to first usable Today screen
- `today.load`
- `issues.load_all`
- `pulls.load_all`
- `sessions.load`
- `issues.prepare_launch`
- `image_attachment.upload`
- `api.request` and `api.check_health`

During UI tests, `PerformanceTrace` mirrors the same timings through `NSLog` with a `[PerformanceTrace]` prefix, guarded by `ISSUECTL_UI_TESTING=1`. This makes timings parseable from simulator or physical-device logs without affecting normal app launches.

Useful simulator capture pattern:

```bash
xcodebuild test \
  -project apple/IssueCTL.xcodeproj \
  -scheme IssueCTLPreview-UISmoke \
  -configuration Debug \
  -destination 'id=<simulator-id>' \
  -only-testing:IssueCTLPreviewUITests/IssueCTLUITests/testListToolbarActionsAreReachableFromTabs \
  -resultBundlePath /tmp/issuectl-perf-sim.xcresult

xcrun simctl spawn <simulator-id> log show --last 3m --style compact \
  --predicate 'eventMessage CONTAINS "[PerformanceTrace]"'
```

Useful physical-device capture pattern:

```bash
pnpm ios:preview-runner-preflight

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
perf_log="/tmp/issuectl-preview-perf-$stamp.log"
result_bundle="/tmp/issuectl-preview-perf-$stamp.xcresult"

eval "$(IOS_DEVICE_NAME=iPhone-preview ./scripts/ios-resolve-preview-device.sh shell)"
export IOS_DEVICE_NAME IOS_DEVICE_ID IOS_XCODE_DEVICE_ID IOS_DESTINATION

idevicesyslog -u "$IOS_XCODE_DEVICE_ID" -m '[PerformanceTrace]' --no-colors \
  > "$perf_log" 2>&1 &
log_pid=$!

IOS_XCODEBUILD_EXTRA_ARGS="-allowProvisioningUpdates -allowProvisioningDeviceRegistration -resultBundlePath $result_bundle" \
  pnpm ios:preview-device-smoke:fast

kill "$log_pid" 2>/dev/null || true
grep -n 'PerformanceTrace' "$perf_log"
```

Notes:

- Prefer `IssueCTLPreview-UISmoke` for repeatable timing runs because its mock server removes internet/GitHub variance.
- Prefer `pnpm ios:preview-device-smoke:fast` for quick before/after timing comparisons. Use `pnpm ios:preview-device-smoke:full` with the same log capture when broader preview-smoke coverage is needed.
- Use `iPhone-preview` for physical preview timing. Do not switch to `iPhone-prod` unless the user explicitly asks for a production-device check.
- If `xcodebuildmcp` device log capture fails with CoreDevice provider errors, `idevicesyslog` works for live physical-device timing logs without root. `/usr/bin/log collect --device-*` requires root on this machine.
- If `idevicesyslog` cannot attach by `IOS_XCODE_DEVICE_ID`, run `pnpm ios:list-devices` and use the physical device UDID shown for `iPhone-preview`.
- Restore `apple/IssueCTL/Generated/AppVersion.swift` after Xcode builds if it is modified by the build script.

## Logging

The web server writes structured JSON logs via pino to **two destinations simultaneously**:

| Destination | Purpose |
|---|---|
| stdout | Live view in the terminal running `issuectl web` |
| `~/.issuectl/logs/web.log` | Durable file — survives terminal close, process crash |

The log file rotates at **10 MB**, keeping one backup (named `YYYYMMDD-HHMM-01-web.log`).

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
| `ws_backpressure_start` | warn | Client send buffer exceeded threshold — shedding frames |
| `ws_backpressure_clear` | warn | Client send buffer drained — resuming normal forwarding |
| `ws_upstream_error` | error | ttyd WebSocket errored |
| `ws_client_error` | error | Client-side WebSocket errored |
| `wss_error` | error | WebSocketServer-level error |
| `ws_send_error` | error | Failed to send a frame (logged by safeSend helper) |
| `terminal_upgrade_failed` | error | Uncaught exception during WebSocket upgrade |
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

## Diagnostics journal

When debugging launch, terminal, ttyd, tmux, session, or workbench failures, check the diagnostics journal before digging through raw web logs. The journal records structured launch lifecycle events in `~/.issuectl/issuectl.db`, including correlation IDs, deployment IDs, issue references, tmux session names, ttyd ports/PIDs, statuses, and failure messages.

Use the local CLI through the workspace package:

```bash
# Recent diagnostic events
pnpm --dir packages/cli exec issuectl diag list --limit 50

# Chronological timeline for a deployment
pnpm --dir packages/cli exec issuectl diag show --deployment <deployment-id>

# Recent events for a GitHub issue
pnpm --dir packages/cli exec issuectl diag tail --issue <owner>/<repo>#<issue-number>

# Chronological timeline for a GitHub issue
pnpm --dir packages/cli exec issuectl diag show --issue <owner>/<repo>#<issue-number>
```

For a failed launch, start with the deployment timeline if the UI or API returned a deployment ID. If no deployment ID is available, list recent events and look for `launch.requested`, `deployment.recorded`, `ttyd.spawned`, `deployment.activated`, `reconcile.tmux_missing`, `liveness.tmux_missing`, `ensure_ttyd.failed`, or `launch.spawn_failed`. Use the correlation ID to connect events from the same launch attempt.

Read the timeline from top to bottom and identify the first failure or unexpected transition. For example, `ttyd.spawned` followed immediately by `reconcile.tmux_missing` means the launch API got past ttyd spawn and DB activation, but the tmux session disappeared before the UI could attach.

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
| Core real-process integration | Vitest | `pnpm --filter @issuectl/core test:integration` |
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
