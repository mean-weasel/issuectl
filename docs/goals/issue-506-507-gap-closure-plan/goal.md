# Issue 506/507 Gap Closure Plan

## Objective

Close the remaining implementation gaps between the current issuectl app and GitHub issues #506 and #507, using successive safe verified slices until a final audit can prove both specs are fully satisfied or explicitly document any owner-approved deviations.

## Original Request

Use GoalBuddy goal-prep to make a detailed plan to fix the remaining gaps found by the three-agent comparison against issues 506 and 507.

## Intake Summary

- Input shape: `existing_plan`
- Audience: issuectl maintainers/operators
- Authority: `requested`
- Proof type: `review`
- Completion proof: A final Judge/PM audit maps implemented receipts and verification back to issues #506 and #507, confirms no required gap remains, and records `full_outcome_complete: true`.
- Goal oracle: A gap matrix derived from issues #506/#507 plus the three independent audit reports, refreshed against current code after each Worker slice, with targeted tests passing for touched packages.
- Likely misfire: Treating existing broad coverage as completion while leaving crash recovery, notifications, redaction, timestamp correctness, or UX/detail parity gaps unfixed.
- Blind spots considered: Spec conflicts between #506 user-supplied tunnel and #507 cloudflared automation; security-sensitive credential isolation; raw payload privacy; route/API/CLI parity; UI polish versus functional correctness; migrations on existing databases; tests that pass despite missing product behavior.
- Existing plan facts:
  - Three independent agents already audited current code against #506/#507.
  - Highest-priority gaps include PR review lifecycle recovery, kill-switch notifications, PR review timestamp units, raw payload redaction, webhook child issue/PR budgets, completion result richness, CLI/API parity, and several #507 UX/detail deltas.
  - The current branch is `codex/issue-506-507-gap-fixes`.
  - Implementation should follow repo conventions in `CLAUDE.md` and `AGENTS.md`.

## Goal Oracle

The oracle for this goal is:

`A refreshed issue-506/507 gap matrix with each gap marked fixed, intentionally deferred with owner-approved rationale, or not applicable, backed by targeted core/web/cli tests and a final Judge audit recording full_outcome_complete: true.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

This tranche is execution-oriented: validate and prioritize the audit findings, then implement the largest safe useful slices until the remaining #506/#507 gaps are closed. Start with a read-only Scout to refresh the gap matrix against current code and separate true blockers from acceptable spec deviations. Then use Judge to select a safe vertical Worker package and continue through implementation, verification, and final audit.

## Non-Negotiable Constraints

- Follow `CLAUDE.md` and `AGENTS.md`; for launch/terminal/ttyd/tmux/workbench failures, inspect diagnostics first.
- Do not regress existing webhook receiver, auto-launch, PR review, diagnostics, CLI, web, or Apple-client behavior.
- Preserve user changes in the working tree; never revert unrelated edits.
- Prefer existing patterns, Server Actions for web mutations, Server Components for reads, strict TypeScript, ESM, functional style, and CSS Modules.
- Treat webhook secrets, signatures, tokens, raw payloads, and local credentials as sensitive.
- Make security and lifecycle fixes before cosmetic UX parity when sequencing conflicts.
- Run focused tests for touched packages; broaden verification for shared schema, launch, webhook, session, or review changes.
- Record any intentional deviation from issue #506/#507 explicitly in a task receipt and final audit.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if safe Worker work can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

For this goal, preferred Worker slices are vertical fixes such as "PR review lifecycle recovery and notification consistency", "payload privacy and retention configurability", "review timestamp and review-detail behavior correctness", or "repo/webhook API and CLI parity", not one helper per task.

## Canonical Board

Machine truth lives at:

`docs/goals/issue-506-507-gap-closure-plan/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/issue-506-507-gap-closure-plan/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries; do not review every small Worker by habit.
11. Finish only with a Judge/PM audit receipt that maps receipts and verification back to #506/#507 and records `full_outcome_complete: true`.
