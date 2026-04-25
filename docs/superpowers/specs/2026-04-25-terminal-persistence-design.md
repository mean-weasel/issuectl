# Terminal Session Persistence

**Date:** 2026-04-25
**Status:** Approved
**Issue:** Terminal sessions are killed when the user navigates away from the issue detail page

## Problem

When a user opens the terminal panel and then navigates back to the issue list, the deployment is marked as ended even though Claude Code is still running inside the tmux session. The root cause is a three-step cascade:

1. **ttyd is spawned with `-q` (exit on all clients disconnect).** When the iframe unmounts on navigation, the WebSocket closes, ttyd has 0 clients, and ttyd exits.
2. **`checkSessionAlive` polls the ttyd PID.** When `process.kill(pid, 0)` returns ESRCH, it calls `coreEndDeployment()`, marking the deployment as ended.
3. **The tmux session (and Claude Code inside it) is still alive**, but the UI now says the session is over.

The fundamental error is using ttyd process liveness as the session liveness signal. ttyd is a disposable web frontend for tmux — it can die and be restarted without affecting the actual work session.

## Approach

**Keep `-q` (ttyd exits when last client disconnects), respawn ttyd on demand, check tmux for liveness.**

- ttyd is treated as a disposable view layer. It exits when nobody's watching and is respawned when someone wants to look again.
- Tmux session existence is the single source of truth for "is the session still running."
- No schema changes needed — session names are derivable via `tmuxSessionName(repo, issueNumber)`.

## Design

### 1. Core liveness: tmux replaces ttyd PID

**New function: `isTmuxSessionAlive(sessionName: string): boolean`**

Runs `tmux has-session -t <name>`. Returns `true` on exit code 0, `false` on exit code 1 (no session) or timeout.

**Callers that switch from ttyd PID to tmux session check:**

- **`checkSessionAlive` server action** — Renamed to `checkSessionAlive` to reflect the new semantics. Checks tmux session instead of ttyd PID. Returns `{ alive: true }` when the tmux session exists (even if ttyd has exited). Only ends the deployment when the tmux session is gone.
- **`reconcileOrphanedDeployments`** — Same switch. On startup, scans active deployments, ends only those whose tmux session no longer exists.
- **`endSession` server action** — Already calls `killTtyd(pid, sessionName)` which kills both. No change needed beyond ensuring tmux cleanup happens even if the ttyd PID is stale.

`isTtydAlive` remains as a private helper for the post-spawn health check inside `spawnTtyd` and for the `ensureTtyd` "is the web frontend up?" check. It is no longer the deployment liveness signal.

### 2. ttyd respawn on demand

**New server action: `ensureTtyd(deploymentId: number)`**

Called before opening the terminal panel. Returns `{ port }` on success or `{ alive: false }` if the session is truly over.

Flow:
1. Look up the deployment row (gets `ttydPort`, `ttydPid`, repo, issueNumber)
2. If deployment already ended (`endedAt` set), return `{ alive: false }`
3. Derive session name via `tmuxSessionName(repo, issueNumber)`
4. Check `isTtydAlive(pid)` — if alive, return `{ port }` immediately
5. Check `isTmuxSessionAlive(sessionName)` — if tmux is also gone, call `coreEndDeployment`, return `{ alive: false }`
6. Tmux alive but ttyd dead: call `respawnTtyd(port, sessionName)`, update `ttyd_pid` in DB, return `{ port, respawned: true }`

**New core function: `respawnTtyd(port: number, sessionName: string): Promise<{ pid: number }>`**

The spawn half of `spawnTtyd` without tmux creation:
```
spawn("ttyd", ["-W", "-i", "127.0.0.1", "-p", <port>, "-q",
  "tmux", "attach-session", "-t", <sessionName>])
```
Followed by the same 300ms health check. Returns the new PID.

**`OpenTerminalButton` changes:**
- Before setting `open=true`, calls `ensureTtyd(deploymentId)`
- If `alive: false`, triggers the "session ended" flow (close panel, refresh)
- If success, sets `open=true` — the iframe loads with ttyd guaranteed to be listening

### 3. Testing

Five testable behaviors:

**Test 1: `isTmuxSessionAlive` unit test** (packages/core, vitest)
- Mock `execFileSync` for `tmux has-session`
- `true` when exit code 0, `false` when exit code 1, `false` on timeout
- Throws on unexpected errors

**Test 2: `checkSessionAlive` decoupled from ttyd PID** (packages/web, vitest)
- Mock: deployment exists, `isTtydAlive` returns `false`, `isTmuxSessionAlive` returns `true`
- Assert: returns `{ alive: true }`, does NOT call `coreEndDeployment`
- Counter-case: both dead -> returns `{ alive: false }`, DOES end deployment

**Test 3: `ensureTtyd` respawns when ttyd dead but tmux alive** (packages/web, vitest)
- Mock: `isTtydAlive` false, `isTmuxSessionAlive` true, `respawnTtyd` returns new PID
- Assert: returns `{ port, respawned: true }`, DB row updated with new PID
- Counter-case: tmux also dead -> returns `{ alive: false }`, no respawn

**Test 4: `reconcileOrphanedDeployments` uses tmux check** (packages/core, vitest)
- Mock: two active deployments, one with live tmux, one without
- Assert: only the tmux-dead deployment gets ended

**Test 5: ttyd respawn integration test** (packages/web/e2e, Playwright)
- Skipped when ttyd/tmux unavailable (same pattern as `shared-terminal.spec.ts`)
- Create real tmux session, spawn ttyd with `-q`, connect WS client, disconnect -> ttyd dies
- Call `respawnTtyd` against same session name and port
- Connect new WS client -> verify terminal output from still-running tmux session

## Files changed

| File | Change |
|---|---|
| `packages/core/src/launch/ttyd.ts` | Add `isTmuxSessionAlive`, `respawnTtyd`. Keep `isTtydAlive` as internal helper. |
| `packages/core/src/launch/ttyd.test.ts` | Tests 1, 4: `isTmuxSessionAlive` unit tests, reconcile uses tmux check |
| `packages/web/lib/actions/launch.ts` | Rename `checkTtydAlive` → `checkSessionAlive`. Add `ensureTtyd` server action. Use tmux liveness. |
| `packages/web/lib/actions/launch.test.ts` | Tests 2, 3: `checkSessionAlive` decoupled, `ensureTtyd` respawn logic |
| `packages/web/components/terminal/OpenTerminalButton.tsx` | Call `ensureTtyd` before opening panel |
| `packages/web/e2e/terminal-respawn.spec.ts` | Test 5: real ttyd respawn integration test |
