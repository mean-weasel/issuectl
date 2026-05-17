# T020 Named Shells Decision

## Decision

`disabled_v1`

Named plain shells should not be implemented in this `/workbench` goal. The v1 workbench should ship the current honest unavailable state:

- `Named shells 0` remains visible in the instance pane.
- The disabled/unavailable new-shell affordance remains visible where present.
- The UI must not fake named shells as issue deployments.
- Issue sessions continue to be the only runnable terminal instances in this goal.

## Rationale

Current app APIs and persistence support repo setup, issues, issue launch, active deployments, terminal preview/ttyd, PRs, settings, worktrees, and global workbench views. They do not support issue-independent shell records, plain-shell lifecycle APIs, shell-scoped ttyd preview, or repo-scoped shell listing.

Task 15 would require a separate schema/core layer, new shell APIs, ttyd/preview integration, UI wiring, and named-shell e2e proof. That is a different backend feature slice from the current `/workbench` assembly, and adding it now would materially increase PR batch risk after the main workbench surface is already implemented and under QA.

The controlling plan explicitly allows this outcome: if Task 15 is deferred, production `/workbench` must keep `New named shell` disabled with visible text `Named shells are not available yet`.

## V1 Acceptance Criteria

- The instance pane shows a collapsible `Named shells 0` section.
- The named-shell body text is `Named shells are not available yet`.
- No enabled `New named shell` control launches or attempts to launch a shell.
- Workbench aggregate payloads do not include fake named-shell fixture data.
- Session sorting can reserve kind/order semantics for future shells, but all live terminal rows in v1 are issue deployments.
- Responsive QA and final PR notes call out that named plain shells are intentionally unavailable in v1.

## Follow-up Goal Recommendation

Create a separate `workbench-named-shells` goal from plan Task 15 when ready. Suggested task split:

1. 15A: shell schema/core helpers and migration tests.
2. 15B: shell create/list/end/ensure-ttyd APIs.
3. 15C: shell preview and ttyd integration.
4. 15D: workbench UI wiring for named shells.
5. 15E: named-shell Playwright/e2e and QA proof.

## Board Impact

Skip conditional tasks T021 through T025 for this goal. Proceed to T026 responsive desktop QA with named-shell disabled-v1 evidence included.
