# Webhook Auto-Sessions Gap Closure

## Objective

Close the remaining implementation gaps in issue #506 after PR #510 by executing successive safe, verified slices until GitHub webhooks can drive issue auto-launch and the repo is structurally ready for later PR auto-review, comment commands, notifications, UI, and docs.

## Original Request

Use `$goalbuddy:goal-prep` to make a detailed plan covering all remaining gaps found by independent subagent audits of the current repo and issue #506.

## Intake Summary

- Input shape: `existing_plan`
- Audience: issuectl maintainers and the user operating webhook-triggered sessions.
- Authority: `requested`
- Proof type: `test`
- Completion proof: a final Judge/PM audit maps all issue #506 requirements and subagent-identified gaps to completed receipts, passing focused package tests/typechecks/lints, and any deliberately deferred work captured as explicit follow-up issues or blocked tasks.
- Goal oracle: the issue #506 gap matrix remains current and every Worker receipt either closes a gap with tests or records why the gap is blocked/deferred; final audit records `full_outcome_complete: true` only when no required Worker task remains queued.
- Likely misfire: implementing only another foundation slice or writing docs while issue #506 still lacks working issue auto-launch, lifecycle controls, security gates, or user-facing configuration.
- Blind spots considered: webhook worker scheduling, diagnostics, repository/hook binding, retention, launch safety, target/session model, PR mutation security, completion protocol, comment-command auth, UI/API/CLI exposure, and docs.
- Existing plan facts: PR #510 landed Phase 1 receiver/storage basics. Four read-only subagent audits identified remaining Phase 1 cleanup, Phase 2 issue auto-launch, Phase 3 target/session refactor, Phases 4-6 PR review/comment-command security work, and Phase 7 UI/docs/notifications gaps.

## Goal Oracle

The oracle for this goal is:

`A maintained issue #506 gap matrix plus passing verification for each implemented tranche: focused unit/integration tests, package typecheck/lint, and a final audit proving all required issue #506 gaps are implemented, blocked with explicit reason, or converted into approved follow-up artifacts.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

This is a continuous execution goal. The first tranche validates the post-PR #510 gap inventory and freezes a phase map. Then the PM should complete the largest safe useful Worker packages in order:

1. Phase 1.5 receiver hardening.
2. Phase 2 issue auto-launch vertical slice.
3. Completion/lifecycle diagnostics and notification substrate.
4. Target/session model decision and implementation for PR readiness.
5. PR review safety and state-machine foundation.
6. Comment commands.
7. Dashboard/API/CLI/docs polish.
8. Final audit and issue #506 disposition.

## Non-Negotiable Constraints

- Preserve repo conventions from `CLAUDE.md` and `AGENTS.md`.
- Do not regress the merged PR #510 receiver foundation.
- Webhook secrets, signatures, and raw payloads must not be logged or exposed through status/export APIs.
- Do not ship PR auto-review until the target/session model and mutation-security gates are resolved.
- Do not use fake issue numbers for PRs.
- Webhook-triggered mutation authority must be daemon-mediated or otherwise least-privilege; agent prompts are not a security boundary.
- Every lifecycle transition added for webhooks must be testable, recoverable, and diagnostic.
- Use focused package tests/typecheck/lint for packages touched; run broader checks before PR/merge boundaries.
- At most one write-capable Worker may be active unless a later parallel plan proves disjoint write scopes.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package when issue #506 still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not mark the goal done while any queued or active Worker task remains required for issue #506. Complete it, block it with a receipt, or replace it with the actual required Worker task before completion.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good Worker task should complete a coherent vertical slice: storage plus handler plus worker plus tests, or CLI/API plus tests, rather than one helper at a time. Judge should merge repeated same-shape fixes into one Worker package when write scope and verification are clear.

## Canonical Board

Machine truth lives at:

`docs/goals/webhook-auto-sessions-gap-closure/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/webhook-auto-sessions-gap-closure/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Work only on the active board task.
5. Preserve the issue #506 gap matrix as the live oracle.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries.
11. Finish only with a Judge/PM audit receipt that maps receipts and verification back to issue #506 and records `full_outcome_complete: true`.
