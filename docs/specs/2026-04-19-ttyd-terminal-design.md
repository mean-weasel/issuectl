# ttyd Embedded Terminal — Design Spec

**Date:** 2026-04-19
**Status:** Approved
**Issue:** #149

## Summary

Replace the terminal app launcher system (Ghostty / iTerm2 / Terminal.app) with
ttyd-based embedded terminals in the issuectl dashboard. Each launched issue gets
a ttyd child process serving Claude Code over HTTP + WebSocket. The user
interacts with the terminal via a full-viewport slide-out panel on the issue
detail page.

This eliminates the dependency on macOS terminal applications, simplifies the
codebase, and enables future remote access via Cloudflare tunnel.

## Motivation

The original launcher opens a native terminal window and pipes context into
Claude Code. That approach is fire-and-forget — issuectl loses visibility once
the window opens. It also ties the user to the machine running the terminal.

ttyd wraps any command in a web-accessible terminal (xterm.js over WebSocket).
By embedding ttyd in the dashboard:

- The terminal is visible alongside issue context in the browser
- issuectl owns the process lifecycle (spawn, monitor, kill)
- Remote access becomes possible by proxying the ttyd port through a tunnel
- No native terminal app dependency — works on any machine with ttyd installed

## What gets removed

### Files deleted

- `packages/core/src/launch/terminal.ts` — `TerminalLauncher` interface, `SupportedTerminal` type, `getTerminalLauncher()`
- `packages/core/src/launch/terminals/ghostty.ts` — Ghostty launcher and helpers
- `packages/core/src/launch/terminals/iterm2.ts` — iTerm2 launcher
- `packages/core/src/launch/terminals/macos-terminal.ts` — Terminal.app launcher
- `packages/core/src/launch/terminals/ghostty.test.ts` — unit tests
- `packages/core/src/launch/terminals/ghostty.integration.test.ts` — integration tests
- `packages/core/src/launch/terminal.test.ts` — interface tests

### Settings removed

- `terminal_app` — no longer choosing between terminals
- `terminal_window_title` — no window to title
- `terminal_tab_title_pattern` — no tab to name

These are removed from `DEFAULT_SETTINGS` in `db/settings.ts`, from the
`SettingKey` type in `types.ts`, and from the Settings page UI.

### What stays

- `buildClaudeCommand()` and the `claude_extra_args` setting — ttyd still runs
  `claude` and the user still configures extra args
- The `cd {workspace} && cat {context} | claude` shell pattern — reused by ttyd

## What gets added

### Core — ttyd process manager

New module: `packages/core/src/launch/ttyd.ts`

**Port allocation:**

- Range: 7700–7799 (100 concurrent sessions)
- `allocatePort(db)` scans active deployments for used ports, probes each
  candidate with `net.connect()` to catch ports used by non-issuectl processes,
  returns the lowest free port
- Throws if all 100 ports are taken

**Spawning:**

```
ttyd -W -p {port} -q /bin/bash -lic "cd {workspace} && cat {context} | claude {extra_args} ; exit"
```

- `-W` — writable (clients can type)
- `-q` — exit when all clients disconnect
- `-p {port}` — listen on allocated port
- `/bin/bash -lic` — interactive login shell for PATH and aliases
- `; exit` — when Claude exits, bash exits, ttyd exits. No lingering raw shell.

`spawnTtyd(options)` spawns the process detached and returns `{ pid, port }`.

**Verification:**

`verifyTtyd()` runs `which ttyd`, throws a helpful error if not installed
(`"ttyd is not installed. Run: brew install ttyd"`).

**Killing:**

`killTtyd(pid)` sends SIGTERM. Handles ESRCH (already dead) gracefully.

**Health check:**

`isTtydAlive(pid)` — `process.kill(pid, 0)` check, returns boolean.

### Database changes — migration v11

```sql
ALTER TABLE deployments ADD COLUMN ttyd_port INTEGER;
ALTER TABLE deployments ADD COLUMN ttyd_pid INTEGER;
```

### Type changes

`Deployment` type gains:

```typescript
ttydPort: number | null;
ttydPid: number | null;
```

`LaunchResult` gains:

```typescript
ttydPort: number;
```

### Core — launch flow changes

`executeLaunch()` revised flow:

1. Verify ttyd is installed (`verifyTtyd()`)
2. Fetch issue detail (unchanged)
3. Filter comments/files (unchanged)
4. Assemble context string (unchanged)
5. Write context to temp file (unchanged)
6. Get repo local path from DB (unchanged)
7. Prepare workspace (unchanged)
8. Apply `issuectl:deployed` label (unchanged)
9. Record deployment as pending (unchanged, port/pid null initially)
10. **Spawn ttyd:** allocate port, spawn process, update deployment row with port + PID
11. Activate deployment (unchanged)
12. Return result with `ttydPort`

If ttyd spawn fails at step 10, the pending deployment is rolled back (same
pattern as today's terminal launch failure).

### Core — end session changes

`endSession()` revised flow:

1. Look up deployment to get `ttyd_pid`
2. Kill the ttyd process (`killTtyd(pid)`) — non-fatal if already dead
3. Update `ended_at` in DB (existing)
4. Revalidate cache (existing)

### Core — orphan reconciliation

On server startup (during DB initialization), scan active deployments and check
which PIDs are still alive. Mark dead ones with `ended_at` so the UI does not
show stale "Open Terminal" buttons for dead sessions.

```typescript
function reconcileOrphanedDeployments(db: Database.Database): void
```

Called once from `getDb()` / connection initialization.

### Web — TerminalPanel component

`"use client"` component: `packages/web/components/terminal/TerminalPanel.tsx`

- **Full-viewport slide-out** from the right edge
- **Slide-back handle** on the left edge — thin bar or chevron, click or drag to
  close the panel (slides right to left to close)
- **Header bar:** Issue `#{number} — {title}`, "End Session" button
- **Terminal iframe:** `src="http://localhost:{ttydPort}"`, fills remaining height
- **CSS animation:** `translateX(100%)` → `translateX(0)` with transition

Styles in `TerminalPanel.module.css`.

### Web — OpenTerminalButton component

Renders on the `LaunchActiveBanner` when the deployment has a live ttyd process
(`ttydPort` is set and `isTtydAlive()` returns true).

Clicking opens the `TerminalPanel`.

### Web — endSession server action

Updated to call `killTtyd()` before the DB update.

## Security model

| Threat | Mitigation |
|---|---|
| Claude exits → raw shell exposed | `; exit` terminates bash → ttyd exits |
| ttyd lingers after crash | `-q` exits on disconnect; reconciliation cleans up |
| Port guessing on LAN | Cloudflare Access gates all traffic (future); ttyd on localhost only |
| Shell injection via extra_args | `buildClaudeCommand()` metachar check (existing) |
| Stale port in DB | `allocatePort()` probes actual port before assigning |

## Lifecycle

- **Launch** → spawn ttyd → "Open Terminal" appears on issue detail page
- **Close panel** → session keeps running, reconnect anytime via "Open Terminal"
- **End Session** → kill ttyd + claude, update DB, panel closes
- **Claude exits naturally** → bash exits → ttyd exits → reconciliation cleans DB
- **Server restart** → orphan reconciliation marks dead sessions as ended
- **Machine reboot** → same reconciliation pass

## Known limitations (v1)

- **Local only.** Terminal iframe points to `localhost:{port}`. Remote access via
  Cloudflare tunnel requires proxying ttyd ports through the Next.js server or
  tunneling the port range separately. This is a follow-up.
- **No terminal theming.** ttyd serves its own xterm.js page. The terminal
  appearance is ttyd's default, not matched to the dashboard's Paper design
  tokens. Acceptable — users expect terminals to look like terminals.
- **macOS only.** ttyd is available via Homebrew on macOS. Linux support works
  but is untested. Windows is not supported (same as today).
