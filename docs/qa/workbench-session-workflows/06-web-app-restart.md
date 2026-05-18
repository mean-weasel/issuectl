# 06 Web App Restart

## Purpose

Verify that restarting the web app does not strand active tmux/ttyd sessions or show stale sessions after startup reconciliation.

## Preconditions

- Use a safe active test session.
- The tmux session exists before restart.
- The deployment row is active before restart.

## Steps

1. Record the deployment id, issue number, tmux session name, ttyd port, and ttyd PID.
2. Stop and restart the web app.
3. Open `/workbench`.
4. Select the test repo.
5. Verify the session card appears if tmux still exists.
6. Click the session card.
7. Verify terminal focus opens.
8. If ttyd died during restart but tmux remains, verify `ensure-ttyd` respawns ttyd.
9. If tmux is gone before startup, verify Workbench does not show the stale session after reconciliation.

## Playwright Checks

- App responds with `HTTP/1.1 200 OK` for `/workbench` after restart.
- Session card count matches tmux state:
  - `1` when tmux exists and deployment active.
  - `0` when startup reconciliation ended the missing-tmux deployment.
- Clicking the session either opens terminal or produces deterministic stale reconciliation.
- No `500`, `Unauthorized`, or stale active card error appears.

## Process Checks

- Before restart: `tmux has-session -t <session-name>` succeeds.
- After restart: tmux state is checked again before asserting UI.
- ttyd listener may be same PID, new PID, or respawned; the required invariant is that terminal focus opens when tmux exists.

## Acceptance Criteria

- Restart does not destroy tmux-backed work.
- Workbench reflects backend reconciliation after restart.
- Active sessions can be reopened after restart.
- Missing tmux sessions do not remain active-looking after restart.

## Stop Conditions

- Restart would interrupt non-test work without approval.
- The server fails to restart.
- Startup reconciliation logs indicate an unrecovered DB or migration error.
