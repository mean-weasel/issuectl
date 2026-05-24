# Issue 506 Follow-Up Gap Fixes

## Objective

Fix the remaining gaps found by the three-agent post-merge audit of issue #506 and prove that the merged webhook automation feature is complete in behavior, tests, and docs.

## Original Request

"create a detailed plan with $goalbuddy:goal-prep to fix all remaining gaps"

## Intake Summary

- Input shape: `specific`
- Audience: issuectl maintainers and users relying on webhook-triggered sessions and PR auto-review.
- Authority: `requested`
- Proof type: `test`
- Completion proof: a merged or ready PR whose receipts show every listed gap fixed or explicitly invalidated, with targeted tests plus package typecheck/lint/test/build passing.
- Goal oracle: targeted regression tests for each audit gap, full relevant package verification, and a final Judge audit that maps fixes back to the three-agent findings.
- Likely misfire: fixing only documentation or only one bug while leaving runtime launch/session-control gaps unresolved.
- Blind spots considered: comment-command semantics, PR tmux naming, launch shell syntax, daemon mutation discoverability, untrusted issue context serialization, docs drift, and stale GoalBuddy artifacts.
- Existing plan facts: three independent agents found broad completion of #506, but flagged follow-up gaps around tmux launch syntax, `/issuectl end` for PR targets, runaway controls, command flags, agent prompt integration, issue-context serialization, and docs/GoalBuddy drift.

## Goal Oracle

The oracle for this goal is:

`All audit gaps are either fixed with regression tests or rejected by a receipt with concrete code evidence; targeted tests for touched packages pass; core/web/cli typecheck and lint pass; web build passes if production code paths changed; final Judge records full_outcome_complete: true.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`specific`

## Current Tranche

Complete the remaining issue #506 follow-up fixes as successive safe, verified Worker packages. The expected work is narrow enough to execute directly, but each package must add or update regression coverage so the final audit can distinguish real fixes from cosmetic changes.

## Non-Negotiable Constraints

- Do not reopen broad issue #506 scope unless a gap proves larger than the follow-up tranche.
- Keep implementation changes focused on the audited gaps.
- Do not weaken webhook, PR, or daemon mutation safety gates.
- Preserve existing merged behavior unless a test proves it is wrong.
- Use focused tests for each regression, then run package-level typecheck/lint and relevant package tests.
- Do not mark complete with stale docs claiming contradictory GoalBuddy states.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if the user asked for working software or automation and a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

## Canonical Board

Machine truth lives at:

`docs/goals/issue-506-follow-up-gap-fixes/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/issue-506-follow-up-gap-fixes/goal.md.
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
