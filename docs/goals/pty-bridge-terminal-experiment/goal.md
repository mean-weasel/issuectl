# PTY Bridge Terminal Experiment

## Objective

Turn `docs/specs/2026-05-21-pty-bridge-terminal-design.md` into a concrete, verified implementation sequence for feature-flagged experimentation with an xterm.js + node-pty terminal bridge, while preserving ttyd as the default backend and tmux as the durable issue launch session.

## Original Request

Use GoalBuddy prep to break the PTY bridge terminal design into concrete implementation tasks.

## Intake Summary

- Input shape: `existing_plan`
- Audience: issuectl maintainers and agents debugging unreliable Codex/Claude issue launch terminal sessions
- Authority: `requested`
- Proof type: `test`
- Completion proof: the current tranche is complete when the repo has Phase 0 terminal diagnostics and the first feature-flagged PTY bridge slice planned or implemented with strong verification, without regressing current ttyd-backed launch/session behavior.
- Goal oracle: diagnostics and tests can distinguish where terminal launch/attach failures happen across the existing ttyd backend and the new experimental PTY bridge path, while default ttyd behavior remains green.
- Likely misfire: attempting a broad ttyd replacement before validating the design, recording backend state, protecting rollback, and improving current diagnostics.
- Blind spots considered: native `node-pty` dependency risk, token transport, multi-client write policy, DB naming, active ttyd session compatibility, Apple client parity, and live side-effecting test boundaries.
- Existing plan facts:
  - Keep tmux as the source of truth.
  - Keep ttyd as the default backend during experimentation.
  - Add Phase 0 telemetry to the current ttyd path before or alongside the bridge.
  - Add a terminal backend abstraction and record backend per deployment.
  - Build the PTY bridge as an additive feature-flagged path.
  - Route each active deployment according to the backend recorded at launch.
  - Do not log raw terminal input/output, tokens, context files, command strings, or environment variables.

## Goal Oracle

The oracle for this GoalBuddy tranche is:

`A verified implementation plan and first safe work packages exist for the PTY bridge experiment, starting with current ttyd telemetry and backend abstraction, with tests proving existing ttyd launch/session behavior remains green and diagnostics can localize terminal attach failures without recording terminal content.`

This is not a completion claim for full ttyd removal. The full migration remains intentionally phased.

## Goal Kind

`existing_plan`

## Current Tranche

Validate and operationalize the design doc into the first implementation tranche:

1. Baseline current ttyd terminal telemetry in the diagnostics journal.
2. Prepare backend abstraction and schema/API contracts without changing the default backend.
3. Define the first PTY bridge MVP slice behind a feature flag.
4. Keep rollback simple and existing ttyd deployments usable.

## Non-Negotiable Constraints

- Do not replace tmux in this tranche.
- Do not make PTY bridge the default backend in this tranche.
- Do not remove ttyd paths while dual-path rollout is still needed.
- Do not log raw terminal input, raw terminal output, terminal tokens, context file contents, command strings, or environment variables.
- Existing ttyd launch/session behavior and tests must remain green.
- Active deployments must route by the backend recorded at launch.
- Live side-effecting tests must remain explicitly opt-in and restricted to the approved issuectl test repos.
- No implementation work should proceed without a bounded Worker task with explicit `allowed_files`, verification commands, and stop conditions.

## Stop Rule

Stop only when a final Judge or PM audit proves the current tranche is complete against the oracle.

Do not stop after plan validation if a safe local Worker task can be activated.

Do not mark the full migration complete after Phase 0 telemetry or the first PTY bridge slice. This goal is about executing the first safe tranche of the experiment.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. A good task is the largest safe useful slice.

For this goal, useful slices should produce behavior or enforceable contracts:

- diagnostics emitted and queryable
- backend stored and returned through APIs
- feature flag selected but default unchanged
- PTY bridge attach path proven behind the flag
- parity tests proving ttyd remains unaffected

## Canonical Board

Machine truth lives at:

`docs/goals/pty-bridge-terminal-experiment/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/pty-bridge-terminal-experiment/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Compare the active task to `docs/specs/2026-05-21-pty-bridge-terminal-design.md`.
5. Preserve the design's tmux-first and feature-flagged rollout constraints.
6. Work only on the active board task.
7. Assign Scout, Judge, Worker, or PM according to the task.
8. Write a compact task receipt.
9. Update the board.
10. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
11. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the current tranche oracle and records whether the tranche, not the full migration, is complete.
