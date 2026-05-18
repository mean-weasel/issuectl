# 04 End Session Cancel And Confirm

## Purpose

Verify that canceling the End confirmation is local-only and confirming End removes the session consistently.

## Preconditions

- Use a safe active test session.
- The session appears in the left Active sessions drawer.

## Steps

1. Open `/workbench`.
2. Select the test repo.
3. Locate the test session card.
4. Click `End` to open the confirmation.
5. Click `Cancel`.
6. Verify no endpoint was called and no navigation/reload occurred.
7. Verify the session card is still present.
8. Click `End` again.
9. Click `End session`.
10. Verify the end endpoint is called exactly once.
11. Verify the card disappears.
12. Verify the issue row no longer appears in the Running filter.
13. Verify the terminal focus clears if it was selected.
14. Verify backend/process state is ended/cleaned for the test session.

## Playwright Checks

- Track `page.on("framenavigated")`; cancel must not add a main-frame navigation.
- Track requests; cancel must not call `/api/v1/deployments/<id>/end`.
- After cancel: `getByLabel("Session #<issue>")` count is `1`.
- Confirm end calls `/api/v1/deployments/<id>/end` exactly once.
- After confirm: `getByLabel("Session #<issue>")` count is `0`.
- Running issue filter count decrements by one.
- If the ended deployment was selected, terminal iframe disappears or focus falls back to repo overview.

## Process Checks

- After confirm: deployment row has non-null `ended_at`.
- After confirm: tmux session is gone.
- After confirm: ttyd listener for the prior port is gone.

## Acceptance Criteria

- Cancel is non-mutating: no endpoint call, no reload, card remains.
- Confirm is mutating exactly once: endpoint called once, card removed once.
- The UI and backend agree that the session ended.
- No stale session card remains after confirm or refresh.

## Stop Conditions

- Cancel triggers any end request.
- Cancel causes a full-page reload.
- Confirm succeeds but session card remains.
- Confirm affects a non-test session.
