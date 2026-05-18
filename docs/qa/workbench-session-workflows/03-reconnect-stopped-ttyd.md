# 03 Reconnect Stopped ttyd

## Purpose

Verify that Workbench can reconnect when ttyd has exited but the tmux session still exists.

## Preconditions

- Use a safe active test session.
- The tmux session exists.
- The deployment row is active with a ttyd port and PID.
- This workflow may kill only the ttyd listener for the test deployment port. Do not kill tmux.

## Steps

1. Record deployment id, ttyd port, ttyd PID, repo, issue, and tmux session name.
2. Kill only the ttyd process/listener for the test deployment port.
3. Confirm tmux still exists with `tmux has-session`.
4. Open `/workbench`.
5. Select the test repo.
6. Click `Reconnect` on the session card.
7. Confirm `ensure-ttyd` returns `{ port, terminalToken, respawned: true }` or equivalent active terminal result.
8. Confirm Workbench focuses the terminal.
9. Confirm the session card remains present and no duplicate appears.
10. Confirm a new ttyd PID is recorded or a new listener exists on the same port.

## Playwright Checks

- `Reconnect` button is enabled before click.
- `POST /api/v1/deployments/<id>/ensure-ttyd` is called exactly once for the reconnect click.
- On success, terminal heading for the issue is visible.
- Terminal iframe `src` contains the expected port.
- Session card for the issue count remains `1`.
- No row error remains after success.

## Process Checks

- Before reconnect: `lsof -ti tcp:<port> -sTCP:LISTEN` returns no ttyd listener.
- Before reconnect: `tmux has-session -t <session-name>` succeeds.
- After reconnect: `lsof -ti tcp:<port> -sTCP:LISTEN` returns a listener.
- After reconnect: deployment row remains active with `ended_at IS NULL`.

## Acceptance Criteria

- Reconnect respawns ttyd without ending the deployment.
- The terminal opens using the same deployment id.
- The session card remains visible exactly once.
- The issue remains in the running issue filter.
- No launch endpoint is called.

## Stop Conditions

- tmux is missing before reconnect; use workflow 05 instead.
- The reconnect action ends the deployment despite tmux being alive.
- A different issue/repo session is affected.
- A duplicate ttyd listener or duplicate deployment appears.
