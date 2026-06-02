# iOS Workbench Automation Parity

## Objective

Bring the iOS app up to date with the current web workbench, cross-repo issue board, webhook automation, PR auto-review sessions, repo automation health, and diagnostics-first session failure model.

## Original Request

Make a GoalBuddy prep board to knock out the remaining iOS parity work after a deep analysis of the current web app, web hooks, new dashboard interface, automatic issue and PR working sessions via labels, and previous GoalBuddy usage.

## Intake Summary

- Input shape: `existing_plan`
- Audience: issuectl maintainers and iOS users
- Authority: `requested`
- Proof type: `test`
- Completion proof: From the iOS app alone, a user can see all tracked repo work, understand issue and PR automation/session state, configure or repair automation labels and webhooks, drive PR auto-review label workflows through stable REST contracts, open the correct issue or PR terminal sessions, and inspect diagnostics for failed launch/session states, with focused web and iOS checks passing.
- Goal oracle: iOS can answer, from the app alone, what work exists across tracked repos, which issues and PRs have active or completed automation sessions, whether webhook automation is healthy, how to apply or remove trigger labels safely, and how to diagnose failed launch, terminal, and session states.
- Likely misfire: GoalBuddy produces more analysis, a board-looking artifact, or a narrow model-only patch while the iOS app still cannot operate the web workbench and automation flows end to end.
- Blind spots considered: the root checkout is dirty with relevant WIP; PR label toggles appear web-only; diagnostics have CLI support but no discovered REST API; the simple native `Repo` model lags the server contract; planned `/api/v1/sessions/overview` was not found; webhook cleanup events can look like failures unless modeled carefully.
- Existing plan facts: `docs/superpowers/plans/2026-06-02-ios-workbench-automation-parity.md` is the current source-backed parity plan; the current checkout contains uncommitted web webhook-health and iOS PR-target session work; implementation should preserve that baseline before creating fresh worktrees; shared Workbench projections and missing REST contracts should land before broad UI work.

## Goal Oracle

The oracle for this goal is:

`The iOS app independently supports the current web workbench and automation model: cross-repo board visibility, issue and PR session state, PR auto-review labels through REST, repo automation setup and health, diagnostics-first launch/session failure inspection, and focused verification that tries to disprove each slice.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

This tranche should advance from the existing plan into implementation. The first gate is to preserve and validate the current dirty baseline, then complete the missing REST contracts and shared iOS projections that unblock the larger mobile UX work. After that, the PM should activate the largest safe verified UI packages, using separate worktrees or delegated agents only after write scopes are disjoint and the shared contract gate has passed.

## Non-Negotiable Constraints

- Follow `CLAUDE.md` and `AGENTS.md`, including diagnostics-first debugging and burden-of-proof verification.
- Do not revert or normalize unrelated dirty work. Treat current uncommitted changes as potential user/WIP changes until Scout/Judge classify them.
- Do not start implementation worktrees from `origin/main` until the current WIP baseline is preserved, committed, stashed, or otherwise intentionally accounted for.
- Prefer `/api/v1/workbench` and stable REST contracts as source of truth for iOS; do not let each SwiftUI view invent private interpretations of web state.
- Add or verify PR label REST support before requiring iOS to trigger PR auto-review label workflows.
- Add or verify diagnostics API support before claiming iOS diagnostics-first parity.
- Keep Worker slices large enough to change behavior, but bounded by explicit `allowed_files`, focused verification, and stop conditions.
- For every Worker package, try to disprove the change with a command, test, trace, diff, screenshot, or direct source inspection and record that evidence.

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

`docs/goals/ios-workbench-automation-parity/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/ios-workbench-automation-parity/goal.md.
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
10. If a problem, suggestion, or follow-up should become a repo artifact, create an approved issue/PR or ask the operator whether to create one.
11. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries; do not review every small Worker by habit.
12. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.

Issue and PR handoffs are supporting artifacts. `state.yaml` remains authoritative, and every external artifact decision must be recorded in a task receipt.
