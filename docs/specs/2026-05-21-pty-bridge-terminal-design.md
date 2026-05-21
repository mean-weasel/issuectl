# xterm.js + PTY Bridge Terminal Design

**Date:** 2026-05-21
**Status:** Proposed
**Motivation:** Improve launch-session stability and diagnostics by experimenting with an issuectl-owned terminal bridge instead of relying on ttyd as the browser terminal server.

## Summary

issuectl has consistent trouble getting issue launch terminal sessions up, attached, and recoverable. The current architecture has improved substantially: tmux is now the durable session layer, ttyd is treated as a disposable web frontend, the web server proxies ttyd through same-origin routes, and the diagnostics journal records launch and reconnect lifecycle events. Even with those improvements, the terminal interaction boundary is still largely owned by ttyd. That limits what issuectl can observe when the UI fails to attach, when ttyd accepts a process but the browser never sees output, or when websocket/proxy failures occur after launch activation.

This design proposes a feature-flagged experiment that keeps tmux as the durable work session but replaces ttyd, for opted-in launches, with:

- xterm.js in the browser
- a server-side WebSocket endpoint owned by issuectl
- node-pty attaching to `tmux attach-session -t <sessionName>`

The core rule is:

```text
Keep tmux as the source of truth. Replace ttyd as the browser/PTY bridge.
```

This gives issuectl much richer terminal telemetry without changing the most important stability invariant: closing, reloading, or crashing the browser terminal must not kill the agent session.

## Current Architecture

Today a launch flows through `executeLaunch` in `packages/core/src/launch/launch.ts`.

1. Record `launch.requested`.
2. Verify `ttyd` and `tmux`.
3. Fetch issue detail, write context, and prepare the workspace.
4. Insert a deployment row as `pending`.
5. Allocate and reserve a ttyd port.
6. `spawnTtyd` creates a detached tmux session running the agent command.
7. `spawnTtyd` starts `ttyd -W -i 127.0.0.1 -p <port> -q tmux attach-session -t <session>`.
8. The deployment row gets `ttyd_port` and `ttyd_pid`.
9. The deployment is activated.

Relevant files:

- `packages/core/src/launch/launch.ts`
- `packages/core/src/launch/ttyd.ts`
- `packages/core/src/db/deployments.ts`
- `packages/core/src/launch/launch-diagnostics.ts`

Workbench opens terminals through `TerminalFocus`:

1. Call `/api/v1/deployments/:id/ensure-ttyd`.
2. Ensure ttyd is alive, or respawn ttyd if tmux is still alive.
3. Create a short-lived terminal token.
4. Probe `/api/terminal/:port/`.
5. Render an iframe pointed at the proxied ttyd page.

Relevant files:

- `packages/web/components/workbench/TerminalFocus.tsx`
- `packages/web/lib/ensure-ttyd.ts`
- `packages/web/lib/terminal-auth.ts`
- `packages/web/lib/terminal-proxy.ts`
- `packages/web/lib/terminal-websocket.ts`
- `packages/web/server.ts`

The important existing invariant is that tmux is the liveness signal. ttyd may exit when all browser clients disconnect; issuectl can respawn it and reattach to the same tmux session.

## Telemetry Today

The diagnostics journal already records useful lifecycle events:

- `launch.requested`
- `workspace.prepared`
- `deployment.recorded`
- `ttyd.spawned`
- `deployment.activated`
- `launch.spawn_failed`
- `launch.activation_failed`
- `ensure_ttyd.alive`
- `ensure_ttyd.respawned`
- `ensure_ttyd.failed`
- `reconcile.tmux_missing`
- `liveness.tmux_missing`

The CLI can inspect those events through:

```sh
pnpm --dir packages/cli exec issuectl diag list --limit 50
pnpm --dir packages/cli exec issuectl diag show --deployment <deployment-id>
pnpm --dir packages/cli exec issuectl diag show --issue <owner>/<repo>#<issue-number>
```

This is a good base, but several high-value terminal states still live outside the diagnostics journal.

## Current Diagnostic Gaps

The current ttyd path is difficult to debug in these areas:

- `spawnTtyd` only checks that the ttyd PID survives for 300ms. It does not prove ttyd accepted HTTP, websocket, or first terminal output.
- ttyd child-process `error` handlers log to raw logs, not the diagnostics journal.
- The proxy websocket path records structured web logs for connect/close/backpressure, but those are not consistently journaled with deployment and issue IDs.
- Browser probe failures collapse into UI strings such as "Terminal proxy returned 502" without a durable attempt ID or terminal lifecycle event.
- Upgrade failures such as auth rejection, invalid port, upstream socket errors, and backpressure are hard to correlate from `diag show`.
- Activation failure is journaled, but an already-open tmux/ttyd pair may need manual cleanup.
- ttyd owns the terminal protocol boundary, so issuectl cannot directly observe first output, input activity timestamps, resize behavior, PTY exit, or attach process lifecycle.

## Options Considered

### Option 1: Full ttyd Replacement

Replace ttyd immediately with xterm.js and a server PTY bridge for all launches.

Pros:

- Removes the ttyd dependency quickly.
- Gives issuectl complete control over terminal UI, auth, resize, backpressure, and telemetry.
- Simplifies same-origin terminal serving by removing ttyd HTML rewriting and iframe proxying.

Cons:

- Highest risk to launch-session stability.
- Current DB fields, tests, UI, diagnostics, and routes are ttyd-shaped.
- A broad replacement could accidentally weaken the tmux durability model.
- Rollback would be harder if active deployments are migrated in place.

Decision: not recommended.

### Option 2: Telemetry-Only ttyd Improvements

Keep ttyd and add more diagnostics around the existing proxy, respawn, and browser attach flow.

Pros:

- Lowest behavior risk.
- Creates a baseline for current instability.
- Immediately improves diagnostics for existing users.

Cons:

- Does not remove the opaque ttyd terminal boundary.
- Still leaves issuectl dependent on ttyd HTML, websocket protocol, and process behavior.
- Cannot expose the same quality of PTY lifecycle telemetry as an owned bridge.

Decision: useful Phase 0, but not enough by itself.

### Option 3: Feature-Flagged Dual Path

Keep ttyd as the default backend and add an experimental `pty_bridge` backend for new opted-in deployments. Preserve tmux as the durable session and have node-pty attach to tmux.

Pros:

- Preserves existing launch/session behavior for normal users.
- Allows per-session rollback by choosing the backend at launch time.
- Lets both paths run side by side while tests and diagnostics prove parity.
- Provides the telemetry benefits of owning the browser/PTY boundary.

Cons:

- Temporarily duplicates terminal attach, ensure, UI, and testing paths.
- Requires native `node-pty` dependency management.
- Requires careful schema/API naming while old `ttyd_*` fields still exist.

Decision: recommended.

## Recommended Architecture

Add a terminal backend abstraction with at least two implementations:

```ts
type TerminalBackend = "ttyd" | "pty_bridge";
```

The default remains `ttyd`. The PTY bridge is enabled through an env flag or setting, then recorded per deployment when the launch is created.

### Durable Session Layer

Do not replace tmux in the first implementation.

Launch should still create a detached tmux session running the selected agent command. The PTY bridge should attach to that existing session:

```sh
tmux attach-session -t <sessionName>
```

This preserves:

- browser navigation persistence
- web app restart recovery
- shared session viewing
- session previews through tmux capture
- reconciliation through tmux liveness
- end-session cleanup semantics

### Browser Terminal

Replace the iframe path only for `pty_bridge` deployments.

Add a React terminal component that uses:

- `@xterm/xterm`
- `@xterm/addon-fit`
- optionally `@xterm/addon-web-links`

Client protocol:

```ts
// client -> server
{ type: "input"; data: string }
{ type: "resize"; cols: number; rows: number }

// server -> client
{ type: "ready" }
{ type: "output"; data: string }
{ type: "exit"; code?: number; signal?: string }
{ type: "error"; message: string }
```

The client must not log terminal input or output. It may record aggregate counters and lifecycle events.

### Server PTY Bridge

Add a WebSocket upgrade route such as:

```text
/api/terminal/pty/:deploymentId/ws
```

The handler should:

1. Validate the terminal token.
2. Load the active deployment.
3. Check that the deployment backend is `pty_bridge`.
4. Derive the tmux session name from repo and issue number.
5. Verify tmux is alive.
6. Spawn a node-pty child process for `tmux attach-session -t <sessionName>`.
7. Pipe xterm input to the PTY.
8. Pipe PTY output to the browser.
9. Apply backpressure protections.
10. On websocket close, kill only the attach PTY, not tmux.

This belongs beside the existing websocket bridge:

- Current ttyd bridge: `packages/web/lib/terminal-websocket.ts`
- New PTY bridge: `packages/web/lib/pty-terminal-websocket.ts`

The custom server in `packages/web/server.ts` can continue to own WebSocket upgrade routing.

### Backend Compatibility

The first version should keep the existing `ttyd_port` and `ttyd_pid` columns. For PTY bridge deployments they can be null.

Add only the minimum schema needed:

- `deployments.terminal_backend TEXT NOT NULL DEFAULT 'ttyd'`

Longer term, after ttyd is removed, rename or replace ttyd-specific fields with neutral terminal metadata. Do not do that in the experimental phase.

### API Shape

Rename concepts without breaking the ttyd path:

- `ensureTtydForDeployment` becomes or delegates to `ensureTerminalForDeployment`.
- The response includes backend-specific attach metadata.
- TTYD deployments return `{ backend: "ttyd", port, terminalToken }`.
- PTY bridge deployments return `{ backend: "pty_bridge", deploymentId, terminalToken, wsUrl }`.

Existing active ttyd deployments must continue to open through the old port route until they end.

## Diagnostics Design

Diagnostics are a first-class acceptance criterion. The PTY bridge should not log raw terminal input, raw terminal output, context file contents, command strings, environment variables, or terminal tokens.

Safe events:

| Event | When |
| --- | --- |
| `terminal.open_requested` | Browser asks to open any terminal backend |
| `terminal.token_issued` | A terminal token is created |
| `terminal.token_failed` | Token creation fails |
| `terminal.proxy_probe_succeeded` | Browser/server probe succeeds for ttyd |
| `terminal.proxy_probe_failed` | Browser/server probe fails for ttyd |
| `pty.bridge_attach_requested` | PTY websocket attach starts |
| `pty.bridge_attached` | node-pty attach process is ready |
| `pty.bridge_attach_failed` | Attach fails before ready |
| `pty.ws_connected` | Browser websocket accepted |
| `pty.first_output_seen` | First PTY output reaches server |
| `pty.resize` | Terminal size changes, sampled or rate-limited |
| `pty.backpressure_start` | Client buffering exceeds threshold |
| `pty.backpressure_clear` | Backpressure episode ends |
| `pty.ws_closed` | Browser websocket closes |
| `pty.process_exit` | Attach PTY exits |
| `pty.tmux_missing` | Deployment is active but tmux session is gone |
| `pty.auth_failed` | Auth fails, with reason category only |

Useful fields:

- `correlationId`
- `deploymentId`
- `owner`
- `repo`
- `issueNumber`
- `sessionName`
- `status`
- `message`
- `data.backend`
- `data.durationMs`
- `data.cols`
- `data.rows`
- `data.bytesToClient`
- `data.bytesFromClient`
- `data.framesToClient`
- `data.framesFromClient`
- `data.closeReason`
- `data.exitCode`
- `data.signal`

For privacy, client identity should be coarse. If a client IP is recorded, hash it or record only a category such as `local`, `lan`, or `remote`.

## Security

### Terminal Tokens

Current terminal tokens are signed with the API token, include a port, and expire after 10 minutes. For the PTY bridge:

- token payload should bind to `deploymentId`, `backend`, and expiration
- token validation should confirm the deployment is active
- token validation should confirm the deployment backend matches the requested route
- token should not be written to diagnostics or logs

Prefer moving token transport away from query strings when practical. A short-lived one-time ticket endpoint or WebSocket subprotocol would reduce URL/referrer exposure. Query-string compatibility is acceptable for the initial experiment if tokens remain short-lived and redacted from logs.

### Multi-Client Attach

tmux supports multiple clients. The PTY bridge should preserve this, but write access needs an explicit policy.

Initial policy:

- multiple clients may attach
- all authenticated clients may write, matching current ttyd behavior
- diagnostics record active attach count

Future policy:

- consider read-only secondary viewers
- consider focus ownership for write access

### Process Ownership

The web server will own node-pty attach children. It must track them and kill them on:

- websocket close
- auth/deployment invalidation
- end session
- server shutdown

Killing an attach PTY must not kill the tmux session unless the user explicitly ends the session.

### Backpressure

The current websocket bridge tracks frames, bytes, dropped frames, and backpressure. The PTY bridge must keep equivalent protections so a slow browser cannot grow memory unbounded.

## Phased Plan

### Phase 0: Baseline Current ttyd Telemetry

Before building the bridge, add journal events to the current path:

- terminal open requested
- token issued/failed
- proxy HEAD success/failure
- websocket connect/close
- upstream websocket open/error/close
- first output frame seen
- backpressure start/clear
- respawn start/success/failure
- tmux missing

This gives a before/after comparison and helps debug current launch failures immediately.

### Phase 1: Terminal Backend Abstraction

Add:

- `terminal_backend` deployment field
- backend selection setting or env flag
- shared `ensureTerminalForDeployment`
- shared terminal token model
- API response that can describe ttyd or PTY bridge attach metadata

Keep ttyd as default.

### Phase 2: PTY Bridge MVP

Add:

- xterm.js terminal component
- `/api/terminal/pty/:deploymentId/ws` upgrade handling
- node-pty attach to existing tmux sessions
- resize/input/output protocol
- PTY diagnostics
- attach cleanup on websocket close

Do not remove ttyd.

### Phase 3: Dual-Path Rollout

Allow opt-in per environment, repo, or launch session.

Requirements:

- active ttyd deployments continue using ttyd
- active PTY bridge deployments continue using PTY bridge
- switching the default affects only new deployments
- rollback is a setting/env change, not a DB migration

### Phase 4: Default Switch

Switch new deployments to PTY bridge only after:

- parity tests pass
- live Codex workbench E2E passes on PTY bridge
- diagnostics show attach failures are lower or easier to diagnose
- manual dogfooding confirms mobile and desktop terminal behavior

### Phase 5: ttyd Cleanup

Remove ttyd after a rollback window:

- remove ttyd install requirement
- remove ttyd HTTP proxy routes
- remove ttyd respawn code
- remove port allocation
- rename/remove ttyd-specific DB fields
- update docs and diagnostics event names

## Acceptance Criteria

The experiment is successful only if these are true:

- Closing the terminal UI does not end the agent session.
- Browser refresh and workbench navigation can reattach to the same tmux session.
- Server restart does not lose the durable session.
- Two browser clients can attach to the same session and see shared state.
- End Session kills attach PTYs, kills tmux, marks deployment ended, and removes UI session state.
- PTY bridge failures do not kill tmux unless the user explicitly ends the session.
- Existing ttyd deployments remain usable while the dual path exists.
- Diagnostics distinguish ttyd backend failures from PTY bridge failures.
- Diagnostics can identify whether a failure happened before tmux creation, after tmux creation, during attach, before first output, during websocket transport, or during cleanup.
- No raw terminal input or output is recorded.

## Test Plan

### Unit Tests

- backend selection from env/setting
- deployment backend persistence
- terminal token validation for ttyd vs PTY bridge
- invalid token, expired token, wrong backend, ended deployment
- PTY protocol message parsing
- resize validation and clamping
- liveness uses tmux, not bridge PID

### Integration Tests

- launch creates tmux before terminal attach
- pending deployment rolls back if tmux creation fails
- PTY attach failure does not kill tmux
- end session kills tmux and active attach PTYs
- startup reconciliation marks tmux-missing deployments ended

### Web Tests

- `ensureTerminalForDeployment` returns ttyd metadata for ttyd deployments
- `ensureTerminalForDeployment` returns PTY metadata for PTY bridge deployments
- TerminalFocus renders iframe for ttyd
- TerminalFocus renders xterm component for PTY bridge
- reconnect after navigation reuses the same deployment/session
- terminal unavailable states remain actionable

### E2E Tests

Mirror existing terminal coverage for the PTY bridge:

- terminal persistence across navigation
- raw respawn/reconnect equivalent, now attach-process restart
- shared terminal clients
- stale tmux reconciliation
- end-session cleanup
- opt-in live Codex workbench E2E using `ISSUECTL_LIVE_CODEX_WORKBENCH_E2E=1`

Keep current ttyd E2E tests while the dual path exists.

## Rollback

Rollback must be simple:

1. Set default backend back to `ttyd`.
2. Existing PTY bridge deployments continue until ended or can be ended manually.
3. Existing ttyd deployments are unaffected.
4. No DB surgery is required.
5. Do not migrate active sessions between backends.

If the PTY bridge has a severe bug, disabling new PTY bridge launches should be enough to stabilize the product while preserving active tmux sessions.

## Open Questions

- Should PTY bridge be selected by env flag only, by settings UI, or both?
- Should secondary browser clients be read-only in the first bridge implementation?
- Should terminal tokens move to one-time websocket tickets during Phase 2, or remain compatible with current signed query tokens until Phase 4?
- Should diagnostics journal schema add neutral `terminalBackend` / `terminalPid` fields, or keep backend-specific details inside `data_json` during the experiment?
- Should PTY bridge live in `packages/web` only, or should terminal backend abstractions move into `packages/core` for Apple client parity?

## Recommendation

Proceed with the feature-flagged dual path.

Start with Phase 0 telemetry because it improves current debugging immediately and gives us a baseline. Then implement the PTY bridge as an additive backend that attaches to tmux. This approach gives issuectl much better observability at the terminal boundary while preserving the durable-session architecture that already fixed the worst ttyd persistence failure mode.
