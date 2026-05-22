# PTY Bridge Rollout Hardening

## Original Request

Use GoalBuddy to plan the next PTY bridge stabilization slice after the terminal diagnostics UI landed.

## Outcome

Harden the feature-flagged PTY bridge path so maintainers can confidently keep experimenting with it for issue launch terminal sessions. The next tranche should use the diagnostics journal and workbench UI evidence to identify and fix the highest-value stability gaps around launch, attach, reconnect, stale session cleanup, and close behavior.

## Oracle

The tranche is complete only when current evidence proves:

- PTY bridge remains feature-flagged behind `ISSUECTL_PTY_BRIDGE=1`;
- real launch and manual QA stay restricted to the approved issuectl test repositories;
- diagnostics journal events make PTY launch, attach, reconnect, close, and stale cleanup outcomes explainable without raw log spelunking first;
- the workbench can recover clearly from failed PTY attach/reconnect attempts without leaving misleading active sessions;
- stale or missing PTY/tmux processes are reconciled consistently with visible session state;
- focused automated tests cover the selected hardening behavior, including at least one failure or stale-session path;
- Playwright or CLI evidence against a local server proves the hardened behavior in the UI and diagnostics journal;
- final audit maps every changed behavior to diagnostics evidence and user-visible state.

## Constraints

- Keep TTYD as the default path unless a separate rollout decision changes it.
- Keep PTY bridge behind `ISSUECTL_PTY_BRIDGE=1`.
- Do not launch real sessions outside the approved issuectl test repositories.
- Use the diagnostics journal first when investigating session failures.
- Prefer a narrow, behavior-changing stabilization slice over broad rewrites or architecture churn.
- Do not add a full diagnostics browser unless Scout/Judge evidence shows the compact diagnostics UI and CLI workflow are insufficient.

## Likely Misfire

The likely wrong solution is to add more labels or tests around already-working happy paths while leaving the actual instability modes unexplained. Another likely miss is to paper over PTY attach/reconnect failures in the UI without recording enough diagnostics to debug the next failure quickly.

## Enough For This Tranche

This tranche is enough when one high-value PTY bridge reliability gap is selected from current evidence, fixed end-to-end, and proven through focused tests plus local browser/diagnostics evidence against an approved test repo.
