# 05 Stale Deployment Reconciliation

## Purpose

Verify deterministic behavior when Workbench has or receives a deployment card that the backend reports as ended, missing, or terminal-session-ended.

## Preconditions

- Prefer mocked Playwright routes for destructive stale cases.
- For live testing, use only a safe test session.
- Do not manually edit live DB rows unless the workflow runner has explicit approval and records the exact row.

## Stale Cases

Cover all of these with automated tests, and at least one with live/manual QA when safe:

1. `ensure-ttyd` returns `{ alive: false, error: "Deployment not found or already ended" }`.
2. `ensure-ttyd` returns `{ alive: false, error: "Terminal session has ended" }`.
3. Workbench payload initially includes a deployment that disappears after refresh.
4. End endpoint returns success for an already-ended deployment.

## Steps

1. Load `/workbench` with a session card visible.
2. Click the session card or Reconnect.
3. Force or observe one stale response.
4. Verify the UI reconciles the stale deployment deterministically.
5. Refresh Workbench.
6. Verify the stale card does not reappear if the backend no longer advertises it.

## Playwright Checks

- On ended/not-found response, the UI must do one of:
  - remove the session card; or
  - mark it stale with no active Reconnect/Open action and provide a refresh/remove path.
- Preferred acceptance: remove the session card and update the issue running state.
- `getByLabel("Session #<issue>")` eventually has count `0` after stale reconciliation.
- If the stale card is selected, terminal focus clears or shows a non-actionable stale state.
- Running issue filter count decrements.
- No repeated retry loop occurs; `ensure-ttyd` call count remains bounded.

## Process Checks

- If live tmux is gone, `tmux has-session -t <session-name>` fails.
- Deployment row has non-null `ended_at` or is absent.
- Workbench payload after refresh excludes the deployment.

## Acceptance Criteria

- Stale deployment state never leaves an actionable active-looking card with only a red row error.
- Workbench converges to the same state after refresh and without refresh.
- Reconnect and terminal-focus stale errors use the same reconciliation policy.
- No duplicate cards, duplicate endpoint calls, or infinite retry loops occur.

## Stop Conditions

- The stale scenario would require destructive DB/process mutation outside a test repo.
- The UI remains in the contradictory state: active-looking card plus ended/not-found error.
- The backend response is ambiguous enough that policy must be decided before implementation.
