# Fix Issue 506/507 Implementation Gaps

## Objective

Close the remaining implementation gaps from the independent #506/#507 audit in successive safe, verified slices until the repo behavior matches the intended webhook, auto-session, PR review, and operator UX outcomes.

## Original Request

Use GoalBuddy goal-prep to make a plan to fix all gaps found in issues 506 and 507.

## Intake Summary

- Input shape: `existing_plan`
- Audience: issuectl maintainer/operator and future users of webhook auto-sessions.
- Authority: `requested`
- Proof type: `test`
- Completion proof: focused core/web/cli tests, typechecks, lint/build checks for touched packages, and a final audit mapping every known gap to a fixed, blocked-by-policy, or explicitly-deferred outcome.
- Goal oracle: a final Judge/PM audit over the #506/#507 gap list, current diff, and verification output that records `full_outcome_complete: true`.
- Likely misfire: only polishing UI or only adding tests while leaving high-risk backend/session safety gaps unresolved.
- Blind spots considered: direct PR push semantics, credential isolation limits, PR review recovery, incremental range correctness, boot-time webhook reconciliation, replay lineage, and UX scope that may be product-polish rather than blocker.
- Existing plan facts: preserve and validate the ten-gap audit from the prior analysis; prioritize backend/security/session correctness before UX polish; do not treat planning as completion.

## Goal Oracle

The oracle for this goal is:

`A final audit proves each known #506/#507 gap is either fixed with tests and package verification, intentionally deferred with a recorded product decision, or blocked with a precise external requirement; no required Worker tasks remain queued or active.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Execute the first full gap-closure tranche. Validate the audit, choose the largest safe useful implementation slice, fix it, verify it, then continue through the remaining high-priority slices until the complete known gap list is resolved or explicitly deferred by product decision.

## Non-Negotiable Constraints

- Work from the repo’s current branch/worktree unless the operator asks for a different branch.
- Do not revert unrelated user changes.
- Preserve project conventions from `CLAUDE.md` and `AGENTS.md`.
- Use diagnostics-first reasoning for launch, terminal, ttyd, tmux, session, and workbench failures.
- Prefer focused package checks for touched code and broader checks before completion.
- Keep Worker scopes bounded with explicit `allowed_files`, verification commands, and stop conditions.
- Do not claim completion while any known #506/#507 gap remains unaddressed or undecided.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if safe Worker work can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

A Worker should finish the whole assigned slice. A Judge should judge the whole assigned slice. A PM should reorient the board when tasks are safe but not moving the outcome.

Tiny tasks are allowed when the failure is isolated, the risk is high, the scope is unknown, or the tiny task unlocks a larger slice. Tiny tasks are bad when they keep happening, do not change behavior, only add wrappers/contracts/proof files, or avoid the real milestone.

## Canonical Board

Machine truth lives at:

`docs/goals/fix-506-507-gaps/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/fix-506-507-gaps/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
4. Work only on the active board task.
5. Assign Scout, Judge, Worker, or PM according to the task.
6. Write a compact task receipt.
7. Update the board.
8. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
9. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries.
10. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
