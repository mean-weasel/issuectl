# Mac iOS Parity

## Objective

Execute the Mac app parity plan in `docs/specs/2026-05-14-mac-ios-parity-plan.md` through successive, PR-sized, verified slices until the macOS app can complete the same practical workflows as the mature iOS app without relying on the web or iOS clients.

## Original Request

Use `$goalbuddy` to plan from `docs/specs/2026-05-14-mac-ios-parity-plan.md`, including discussion of how to create PRs, monitor CI, and merge along the way to keep code changes manageable.

## Intake Summary

- Input shape: `existing_plan`
- Audience: issuectl maintainers and Mac app users
- Authority: `requested`
- Proof type: `test`
- Completion proof: every required parity phase is implemented, verified by the phase acceptance criteria in the parity plan, reviewed through PRs with green CI or documented replacement validation, merged into the target branch, and final audit confirms no required parity discrepancy remains.
- Likely misfire: GoalBuddy could treat the markdown plan as complete work, or create one oversized PR that is hard to review, verify, and merge safely.
- Blind spots considered: PR branch topology, CI monitoring, flaky macOS UI tests, preserving the existing experimental Mac sidebar branch, native Mac UX differences from iOS, per-Desktop state risks, local dogfood requirements, and backend/API contract drift.
- Existing plan facts: `docs/specs/2026-05-14-mac-ios-parity-plan.md` is the authoritative parity plan; phases 1-11 and their acceptance criteria must be preserved unless a Judge task records a better evidence-backed split.

## Goal Kind

`existing_plan`

## Current Tranche

Prepare and execute the parity plan as a sequence of manageable implementation PRs. The first tranche should validate the plan, choose the branch/PR cadence, and then implement Phase 1, Native Mac Repository Management, unless validation identifies a safer prerequisite.

The expected cadence is:

1. Keep `docs/specs/2026-05-14-mac-ios-parity-plan.md` as the source plan and `docs/goals/mac-ios-parity/state.yaml` as board truth.
2. For each phase or coherent subphase, create a branch from the current integration target.
3. Open a draft PR early with the phase acceptance criteria copied into the PR body.
4. Implement the largest safe vertical slice for that PR.
5. Run local validation before marking the PR ready.
6. Monitor GitHub CI, fix failures on the same PR branch, and record the outcome in the task receipt.
7. Merge only when green or when an explicit documented non-CI validation substitute is accepted.
8. Rebase or retarget the next PR onto the updated integration target before continuing.

## Non-Negotiable Constraints

- Do not implement outside an active Worker or PM task with explicit write scope.
- Keep code changes PR-sized and reviewable; split a phase when risk, test runtime, or file ownership makes one PR too large.
- Do not merge red CI unless the board records a specific accepted exception and replacement validation.
- Preserve user changes and existing branch work; never reset or revert unrelated work.
- Use `rg` for source search and `apply_patch` for manual edits.
- Prefer existing shared IssueCTL APIs and iOS implementation patterns over new Mac-only behavior.
- Mac parity means workflow parity, not pixel-for-pixel iOS cloning.
- Keep Mac-specific behavior, especially menu-bar/sidebar operation and per-Desktop sidebar state.
- Use dogfood verification for macOS status items, Spaces, terminal windows, and local `issuectl web` behavior when automated tests cannot fully cover them.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice: usually one phase from the parity plan, or a vertical subphase when that phase crosses unrelated surfaces or has high UI-test risk.

Each implementation PR should include the feature code, focused tests, acceptance criteria evidence, and a short dogfood note when the feature touches macOS-only behavior.

## Canonical Board

Machine truth lives at:

`docs/goals/mac-ios-parity/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/mac-ios-parity/goal.md.
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
10. When a PR is opened, monitored, merged, or blocked, record the PR URL, branch, CI state, and merge decision in the relevant task receipt.
11. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries; do not review every small Worker by habit.
12. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.

Issue and PR handoffs are supporting artifacts. `state.yaml` remains authoritative, and every external artifact decision must be recorded in a task receipt.
