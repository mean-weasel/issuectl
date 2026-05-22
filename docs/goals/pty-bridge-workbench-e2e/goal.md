# PTY Bridge Workbench E2E

## Objective

Plan and execute the next focused tranche for the feature-flagged PTY bridge experiment: prove that a workbench issue launch using `ISSUECTL_PTY_BRIDGE=1` creates, displays, attaches to, preserves, and closes a PTY bridge terminal session correctly.

## Original Request

"plan it out with $goalbuddy:goal-prep" for the next PTY bridge client-side slice after PR #497 merged.

## Intake Summary

- Input shape: `specific`
- Audience: issuectl maintainers debugging launch/session reliability
- Authority: `requested`
- Proof type: `test`
- Completion proof: Focused automated tests and a local manual walkthrough demonstrate that a workbench issue launch with `terminalBackend: "pty_bridge"` and `ttydPort: null` routes through the PTY websocket path, remains usable across issue navigation, and records useful diagnostics.
- Goal oracle: Run the targeted web/core tests plus a local flagged manual launch walkthrough and diagnostics inspection.
- Likely misfire: Adding more type or helper coverage while never proving the workbench launch-to-terminal handoff actually works with `ttydPort: null`.
- Blind spots considered: Existing PTY bridge server skeleton may work in isolation while the workbench UI rejects null ports, stale deployment state, terminal recovery, or navigation persistence.
- Existing plan facts: PR #497 merged the server/core PTY bridge launch skeleton and response plumbing; next tranche should focus on workbench tests and local manual verification.

## Goal Oracle

The oracle for this goal is:

`With ISSUECTL_PTY_BRIDGE=1, a workbench launch can be tested and manually exercised from issue launch through PTY terminal attachment, navigation away/back, close/recovery behavior, and diagnostics journal inspection without falling back to ttyd assumptions.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`specific`

## Current Tranche

Complete the client-side and local verification slice for the PTY bridge experiment. The expected path is: map existing workbench terminal tests, add the missing focused coverage for PTY bridge launch/session behavior, run targeted checks, then perform a local flagged manual launch walkthrough and inspect diagnostics.

## Non-Negotiable Constraints

- Keep the experiment gated by `ISSUECTL_PTY_BRIDGE=1`.
- Do not remove or weaken the existing ttyd path.
- Restrict any real issue creation, terminal session launch, and cleanup used by tests to the approved issuectl test repositories.
- Use diagnostics-first debugging for launch, terminal, ttyd, tmux, session, or workbench failures.
- Keep implementation slices bounded and verified before expanding scope.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

## Canonical Board

Machine truth lives at:

`docs/goals/pty-bridge-workbench-e2e/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/pty-bridge-workbench-e2e/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Work only on the active board task.
5. Assign Scout, Judge, Worker, or PM according to the task.
6. Write a compact task receipt.
7. Update the board.
8. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
9. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
