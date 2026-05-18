# 02 Return To Active Session

## Purpose

Verify that an existing active session survives browser refresh and can be reopened from the left Active sessions drawer without creating a duplicate deployment.

## Preconditions

- Complete workflow 01 or use a known safe active test session.
- The tmux session still exists.
- The deployment row is active with `ended_at IS NULL`.

## Steps

1. Open `/workbench`.
2. Select the test repo.
3. Confirm the left Active sessions drawer shows the existing session card.
4. Refresh the browser.
5. Select the test repo again if needed.
6. Confirm the same session card is still visible.
7. Click the session card.
8. Confirm the terminal focus opens.
9. Confirm no launch endpoint is called.
10. Confirm `ensure-ttyd` is called and returns a terminal token.

## Playwright Checks

- Session card count for the issue remains `1` before and after refresh.
- `POST /api/v1/launch/...` call count remains `0`.
- `POST /api/v1/deployments/<id>/ensure-ttyd` call count is `1` for the click path.
- right drawer closes: `data-issues-pane="collapsed"`.
- left drawer remains visible: `data-instances-pane="visible"`.
- terminal iframe is visible and in viewport.

## Process Checks

- The tmux session name before refresh equals the tmux session name after refresh.
- The deployment id before refresh equals the deployment id after refresh.
- The ttyd port before refresh equals the terminal iframe port after refresh unless ttyd was intentionally respawned.

## Acceptance Criteria

- Browser refresh does not remove the active session card.
- Reopening the session does not create a second deployment.
- Reopening the session does not show `Deployment not found or already ended`.
- The terminal iframe opens from the existing session card.
- No unexpected full-page navigation occurs beyond the requested refresh.

## Stop Conditions

- The active deployment disappears before refresh.
- Reopening the session calls the launch endpoint.
- `ensure-ttyd` reports ended/not found for a deployment expected to be active.
- A duplicate session card appears.
