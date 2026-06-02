# iOS Parity Next Tranche

## Objective

Close the remaining current-main iOS parity gaps after the completed iOS/web parity conveyor: route-focused Board/Sessions/Review navigation, public webhook base URL editing, webhook health clarity, stream refresh coalescing, and any small workbench-first-read consistency work that a Judge approves as safe.

## Original Request

"OK, set this up."

Context: the prior request asked for a fresh worktree, a deep analysis of the web app, webhooks, dashboard/workbench interface, previous sessions, GoalBuddy usage, and a detailed plan to bring the iOS app up to date with current web behavior.

## Intake Summary

- Input shape: `existing_plan`
- Audience: issuectl maintainers and iOS users
- Authority: `requested`
- Proof type: `test`
- Completion proof: current-main iOS closes every real gap listed in `docs/superpowers/plans/2026-06-01-ios-web-parity-next-tranche.md`, passes focused Apple/web/core verification, records simulator or UI evidence for visible changes, and a final Judge/PM audit maps receipts back to the tranche oracle.
- Goal oracle: a source-backed current-main gap matrix plus verified implementation receipts proving Board/Sessions/Review routes focus correctly, webhook base URL and health states are handled on iOS, stream refreshes are not bursty, and any deferred Today/Issues workbench consistency is explicitly justified.
- Likely misfire: reimplementing already-merged workbench, repo automation, diagnostics, or PR review APIs because an older dirty checkout or stale board made iOS look further behind than `origin/main`.
- Blind spots considered: stale root checkout drift, completed-board drift, missing `packages/web/node_modules` in fresh worktrees, Xcode simulator availability, UI test reliability for deep links, webhook health states that are unknown rather than unhealthy, and low-priority terminal backend override parity.
- Existing plan facts: use `docs/superpowers/plans/2026-06-01-ios-web-parity-next-tranche.md` as the plan artifact; start from `origin/main` at `86248bc` or newer; do not continue the completed `ios-web-parity-conveyor` board.

## Goal Oracle

The oracle for this goal is:

`A fresh origin/main-based worktree records a source-backed current-main gap matrix, implements the Judge-selected safe vertical slices from docs/superpowers/plans/2026-06-01-ios-web-parity-next-tranche.md, passes focused and final verification, and produces simulator/UI evidence for route and settings behavior before a final audit records full_outcome_complete: true.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Start with read-only current-main reconciliation and a gap matrix. Then a Judge must select the largest safe useful vertical slice with exact `allowed_files`, verification commands, and stop conditions. Expected first candidates are:

1. Preserve and consume Board/Sessions/Review route context on iOS.
2. Expose `public_webhook_base_url` editing and make `unknown` webhook health distinct.
3. Coalesce automation stream refreshes.
4. Conditionally share workbench issue summaries with Today/Issues only if the existing data flow can do so without a new app-wide state architecture.
5. Remove stale comments/docs that imply automation endpoints are fixture-driven.

Do not stop after the first slice if safe local work remains.

## Non-Negotiable Constraints

- Use a fresh worktree based on `origin/main`; record the SHA before implementation and before final completion.
- Treat `/Users/neonwatty/Desktop/issuectl/.worktrees/ios-web-parity-plan-20260601` as the setup worktree unless the PM records a newer execution worktree.
- Do not overwrite or revert unrelated user changes from `/Users/neonwatty/Desktop/issuectl`.
- Do not reimplement already-merged workbench, repo automation settings, diagnostics, PR review runs, or sessions overview APIs.
- Follow `CLAUDE.md` and `AGENTS.md`; use diagnostics-first debugging for launch/session/ttyd/workbench failures.
- Use existing SwiftUI, APIClient, model decoding, mock server, and test patterns.
- Use `rg` for source search and `apply_patch` for manual edits.
- Keep Worker packages bounded, reversible, and verified.
- Parallel Workers require disjoint worktrees and disjoint `allowed_files`.
- If web tests are required in a fresh worktree, install dependencies or record the missing dependency as explicit verification setup, not a pass.

## Stop Rule

Stop only when a final audit proves the full tranche outcome is complete.

Do not stop after planning, discovery, or Judge selection if safe local Worker work can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated helper or cosmetic cleanup. Put same-shape route, settings, or stream-refresh work into coherent vertical packages and review the package as a whole.

If a slice needs owner input, credentials, production access, destructive operations, or policy decisions, mark that exact slice blocked with a receipt, create the smallest safe local follow-up, and continue all local non-destructive work that can still move the goal toward completion.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

The Judge should reject helper-only slices when enough scaffolding exists for visible iOS behavior. The first implementation package should ideally produce a user-visible improvement with tests.

## Canonical Board

Machine truth lives at:

`docs/goals/ios-parity-next-tranche/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/ios-parity-next-tranche/goal.md.
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
10. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries.
11. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
