# Close Issue 506/507 Remaining Gaps

## Objective

Fill the remaining concrete gaps found by the three-agent audit against GitHub issues #506 and #507, using safe verified implementation slices until the app, CLI, UX, and coverage match the intended shipped scope or have explicit documented deferrals.

## Original Request

Make a detailed plan using GoalBuddy to fill the gaps found by the three independent sub-agents comparing the app to issues 506 and 507.

## Intake Summary

- Input shape: `specific`
- Audience: issuectl maintainers and operators using GitHub webhook auto-sessions.
- Authority: `requested`
- Proof type: `test`
- Completion proof: focused core/web/cli tests pass, route/WebSocket coverage exists for the new operator surfaces, UX/CLI gaps are implemented or explicitly documented as deferred, and a final Judge/PM audit maps receipts back to every reported gap.
- Goal oracle: a source-backed final audit over task receipts, dirty diff, and verification commands proving each reported gap is fixed, intentionally deferred with docs/UI clarity, or no longer valid.
- Likely misfire: implementing only the quickest UI tweaks or only adding tests while leaving CLI onboarding/removal, operator override commands, and route/live-tail proof unresolved.
- Blind spots considered: CLI operations may need GitHub credentials and network access; route/live-tail E2E may need seeded DB/API token setup; operator override commands may require a product decision between implementation and explicit deferral; Add Repo verification/preamble may overlap existing Server Action flows.
- Existing plan facts: preserve the six immediate gaps and one lower-priority gap from the three-agent audit; do not count Apple mirroring, push notifications, or direct local PR fix-push as gaps for this tranche.

## Goal Oracle

The oracle for this goal is:

`A final audit receipt that lists each sub-agent-reported gap and points to either implemented code plus passing focused verification, or an explicit deferral decision recorded in docs/UI/tests.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`specific`

## Current Tranche

Complete successive safe verified work packages for the current issue #506/#507 gap closure:

1. Validate the reported gaps against current source and decide which are implementation gaps versus deferrals.
2. Implement the highest-confidence bounded UX fixes.
3. Implement CLI parity and/or explicit operator-command deferrals.
4. Add missing route/WebSocket coverage and fix any defects it reveals.
5. Run focused checks for touched packages.
6. Final-audit every original gap against receipts and verification.

## Non-Negotiable Constraints

- Follow `CLAUDE.md` and repo conventions: ESM, strict TypeScript, Server Actions for mutations, Server Components for reads, CSS Modules, and diagnostics journal for relevant mutations.
- Keep implementation edits scoped to `packages/web`, `packages/cli`, `packages/core`, tests, and docs directly involved in the reported gaps.
- Do not weaken webhook security, replay protection, target-aware diagnostics, mutation budgets, or PR review safety gates.
- Treat real GitHub network operations as best-effort/credential-dependent; tests should use mocks or focused local fixtures where possible.
- Do not count explicitly deferred scope as incomplete unless the app or docs still imply it exists.
- Do not complete the goal until all required Worker tasks are done, blocked with receipts, or replaced by a safer task.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

A Worker should finish the whole assigned slice. A Judge should judge the whole assigned slice. A PM should reorient the board when tasks are safe but not moving the outcome.

Tiny tasks are allowed when the failure is isolated, the risk is high, the scope is unknown, or the tiny task unlocks a larger slice. Tiny tasks are bad when they keep happening, do not change behavior, only add wrappers/contracts/proof files, or avoid the real milestone.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue.

## Canonical Board

Machine truth lives at:

`docs/goals/issue-506-507-gap-closure/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/issue-506-507-gap-closure/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake, likely misfire, and gap list.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries.
11. Finish only with a Judge/PM audit receipt that maps receipts and verification back to every reported gap and records `full_outcome_complete: true`.
