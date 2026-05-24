# Complete Issue 506 Gap Closure

## Objective

Fix every remaining implementation, lifecycle, CLI, UI, diagnostics, documentation, and verification gap found in the three-agent audit of closed GitHub issue #506.

## Original Request

Use `$goalbuddy:goal-prep` to make a plan to fix all remaining gaps from the issue #506 audit.

## Intake Summary

- Input shape: `existing_plan`
- Audience: issuectl maintainer and dogfooding user
- Authority: `requested`
- Proof type: `test`
- Completion proof: focused core/web/cli tests, typecheck/lint for touched packages, and a final audit that maps every audit gap to either a verified fix or a recorded blocker.
- Goal oracle: a final Judge/PM audit over the three-agent findings, current implementation, receipts, and verification output that records `full_outcome_complete: true`.
- Likely misfire: fixing only superficial CLI/UI naming gaps while leaving PR review lock wedging, target-aware diagnostics, PR workspace/push safety, and webhook lifecycle invariants incomplete.
- Blind spots considered: PR review sessions can wedge outside completion, settings mutations need kill-switch behavior, PR direct-push semantics may need a larger daemon-mediated Git object strategy, and UI work needs browser verification.
- Existing plan facts: the prior audit identified backend lifecycle, PR review, diagnostics, CLI, dashboard, docs, and verification gaps. Those findings are input facts, not proof of completion.

## Goal Oracle

The oracle for this goal is:

`A final audit confirms every remaining issue #506 gap from the three-agent audit is fixed, covered by focused tests or documented as explicitly blocked, and verified with package checks for all touched areas.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Complete the full gap-closure tranche. Start by validating and grouping the audit findings into the largest safe useful slices, then implement and verify those slices continuously until the oracle is satisfied.

## Non-Negotiable Constraints

- Preserve existing repository conventions from `CLAUDE.md` and `AGENTS.md`.
- Use diagnostics-first debugging for launch, terminal, ttyd, tmux, session, and workbench failures.
- Do not revert unrelated user changes.
- Keep Worker write scopes explicit and bounded.
- PR auto-review must not become less safe while closing functionality gaps.
- UI changes require focused browser or Playwright verification where practical.
- Completion requires evidence, not just updated docs or task receipts.

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

## Canonical Board

Machine truth lives at:

`docs/goals/issue-506-complete-gap-closure/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/issue-506-complete-gap-closure/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake, oracle, likely misfire, and audit findings.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
