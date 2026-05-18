# 07 Session Regression Matrix

## Purpose

Maintain a matrix that proves every Workbench session lifecycle behavior has automated and/or manual evidence.

## Matrix

| Behavior | Automated evidence required | Manual workflow required | Acceptance criteria |
| --- | --- | --- | --- |
| Launch issue session | Playwright mocked launch plus optional live launch | 01 | One card appears, terminal opens, right drawer closes, no duplicate deployment |
| Return after browser refresh | Playwright reload/open existing session | 02 | Same deployment id/card, no launch call, terminal opens |
| Reconnect stopped ttyd | Playwright/API mocked respawn and/or live ttyd kill | 03 | ttyd listener returns, tmux preserved, card count remains one |
| Cancel end | Playwright no-navigation/no-endpoint assertion | 04 | Cancel closes confirmation only; card remains |
| Confirm end | Playwright endpoint/card/removal assertion | 04 | Card removed, issue not running, backend ended |
| End already-ended deployment | Mocked endpoint response or backend unit test | 05 | UI converges without stale active card |
| Deployment not found/already ended | Mocked ensure-ttyd stale response | 05 | Card removed or demoted deterministically |
| Terminal session ended | Mocked ensure-ttyd stale response | 05 | UI state matches refresh state |
| Web app restart with live tmux | Manual or Playwright-driven restart workflow | 06 | Existing session can be reopened |
| Web app restart with missing tmux | Manual or mocked startup payload check | 06 | Stale card does not appear |

## Steps

1. After tests/workflows are implemented, fill in artifact paths and command outputs for each behavior.
2. Confirm every row has at least one automated evidence item.
3. Confirm risky process-state rows have manual receipts or an explicit deferred rationale.
4. Confirm final verification commands pass.

## Acceptance Criteria

- No matrix row is missing evidence.
- Stale cases are not covered only by happy-path tests.
- Manual workflows name screenshots/logs/artifacts where applicable.
- Final audit can map the matrix to `state.yaml` receipts.

## Stop Conditions

- Any behavior has no planned automated coverage.
- Any destructive manual workflow lacks a safe test target.
- Matrix evidence depends only on a passing broad test command without naming the scenario.
