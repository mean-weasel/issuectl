# 01 Create Issue Session

## Purpose

Verify that launching a Workbench issue creates one visible issue-backed session, opens the terminal focus, and keeps UI/process state consistent.

## Preconditions

- The local app is running at `http://localhost:3847/workbench`.
- Use a safe test repo, preferably `mean-weasel/issuectl-test-repo`.
- Use a test issue that is open and has no active deployment.
- If the repo has no `localPath`, Fresh clone must be selected by default.

## Steps

1. Open `/workbench`.
2. Select the test repo in the repo rail.
3. Select the test issue from the right Issues drawer.
4. Confirm Launch options:
   - Agent is visible.
   - Branch name is non-empty.
   - Workspace mode is enabled and valid.
   - Fresh clone is selected if there is no local path.
5. Click `Launch issue`.
6. Wait for a session card for the issue in the left Active sessions drawer.
7. Confirm the Workbench focus pane switches to terminal mode.
8. Confirm the right Issues drawer closes and the left Active sessions drawer remains open.
9. Confirm the terminal iframe is visible and inside the viewport.
10. Confirm a tmux session exists for the repo/issue.
11. Confirm a ttyd listener exists on the deployment port.

## Playwright Checks

- `getByLabel("Session #<issue>").toBeVisible()`
- `getByRole("main", { name: "Workbench" }).toHaveAttribute("data-instances-pane", "visible")`
- `getByRole("main", { name: "Workbench" }).toHaveAttribute("data-issues-pane", "collapsed")`
- `locator('iframe[title="Terminal for issue <issue>"]').toBeVisible()`
- iframe bounding box has `top >= 0`, `bottom <= viewport height`, `left >= 0`, `right <= viewport width`.
- `POST /api/v1/launch/<owner>/<repo>/<issue>` is called exactly once.
- `POST /api/v1/deployments/<id>/ensure-ttyd` returns `{ port, terminalToken }`.

## Process Checks

- `tmux has-session -t <session-name>` succeeds.
- `lsof -ti tcp:<ttyd-port> -sTCP:LISTEN` returns exactly one listener.
- The deployment row has `state = 'active'`, `ended_at IS NULL`, non-null `ttyd_port`, and non-null `ttyd_pid`.

## Acceptance Criteria

- Exactly one new session card appears for the issue.
- The issue row shows running or `Jump to session`.
- The terminal iframe is visible and in viewport.
- No duplicate deployment cards appear after waiting 5 seconds.
- No unexpected page navigation, full-page refresh, 401, or 500 occurs.
- The session can be selected from the left drawer after launch.

## Stop Conditions

- The issue already has an active deployment.
- Launch would target a non-test repo.
- Launch response lacks `deploymentId` or `ttydPort`.
- Terminal focus appears but iframe remains offscreen or missing.
- tmux or ttyd process state cannot be reconciled with the UI.
