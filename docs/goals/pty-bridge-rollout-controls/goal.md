# PTY Bridge Rollout Controls

## Objective

Plan the next PTY bridge stabilization tranche: make backend selection visible and safer for new launches, preserve ttyd as the default, and add enough comparison telemetry to dogfood PTY bridge without confusing active deployment behavior.

## Original Request

Plan the backend selection visibility and safer opt-in controls work with `$goalbuddy:goal-prep`.

## Intake Summary

- Input shape: `specific`
- Audience: issuectl maintainers dogfooding and debugging issue launch terminal sessions
- Authority: `requested`
- Proof type: `test`
- Completion proof: focused tests, Playwright/manual QA evidence, and diagnostics/telemetry output prove new launches clearly expose their selected terminal backend, active deployments keep their recorded backend, and maintainers can compare ttyd versus PTY bridge outcomes.
- Goal oracle: a maintainer can launch approved test-repo sessions under ttyd and PTY bridge, see which backend will be used before and after launch, verify changing the default affects only new deployments, and inspect diagnostics/reporting that compares attach/first-output/reconnect/cleanup signals by backend.
- Likely misfire: adding another hidden env flag or static label while users still cannot tell what backend a launch will use or whether changing the setting could affect active sessions.
- Blind spots considered: backend choice may belong in env, repo settings, launch UI, or all three; active deployments must be immutable by recorded backend; telemetry must avoid terminal I/O and secrets; Apple clients and CLI launches may need compatibility; live manual QA must stay within approved issuectl test repositories.
- Existing plan facts: ttyd remains the default; PTY bridge remains feature-flagged; existing PTY diagnostics, status strip, visual polish, stale cleanup, and tmux durability must be preserved; this is Phase 3 rollout control work from `docs/specs/2026-05-21-pty-bridge-terminal-design.md`.

## Goal Oracle

The oracle for this goal is:

`A verified ttyd/PT bridge launch comparison flow shows backend selection before launch, records backend per deployment, leaves active deployments on their original backend after setting changes, and exposes backend-grouped diagnostics/reporting without logging terminal input, output, tokens, command strings, context, or environment.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`specific`

## Current Tranche

Complete the next reversible Phase 3 rollout-controls tranche for the feature-flagged PTY bridge. The expected shape is: discover current backend selection and launch surfaces, choose the largest safe useful implementation slice, implement backend visibility/opt-in controls and comparison telemetry needed for dogfooding, verify with focused tests and Playwright/manual QA against approved test repos, then audit against the oracle.

## Non-Negotiable Constraints

- Keep ttyd as the default backend unless a later explicit rollout decision changes it.
- PTY bridge must remain opt-in and feature-flagged for this tranche.
- Changing a backend default or preference must affect only new launches, not active deployments.
- Active deployments must continue using the backend recorded at launch.
- Do not log raw terminal input, raw terminal output, terminal tokens, command strings, context file contents, or environment variables.
- Use diagnostics-first debugging for terminal/session failures.
- Do not launch real sessions outside the approved issuectl test repositories.
- Preserve existing ttyd behavior while the dual path exists.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

A Worker should finish the whole assigned slice. A Judge should judge the whole assigned slice. A PM should reorient the board when tasks are safe but not moving the outcome.

## Canonical Board

Machine truth lives at:

`docs/goals/pty-bridge-rollout-controls/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/pty-bridge-rollout-controls/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake, constraints, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
