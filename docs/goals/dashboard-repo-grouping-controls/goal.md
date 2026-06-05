# Dashboard Repo Grouping Controls

## Objective

Implement repo collapse/expand controls for the issuectl dashboard so users can scan issues across many repositories without losing repo-level context.

## Original Request

"plan out with goalbuddyprep and implement" for repo grouping controls.

## Intake Summary

- Input shape: `specific`
- Audience: issuectl dashboard users scanning issues across multiple repos
- Authority: `requested`
- Proof type: `test`
- Completion proof: focused Playwright coverage and web package checks prove repo sections can be collapsed/expanded, counts remain visible, and state persists per surface.
- Goal oracle: a browser/E2E flow proves Global Issues and Board repo grouping controls work across single-repo toggle, collapse all, expand all, reload persistence, and filter/search changes without hiding summary context.
- Likely misfire: adding cosmetic toggles that hide cards but break counts, search/filter behavior, accessibility, or board/global consistency.
- Blind spots considered: persistent vs temporary state, per-surface storage keys, accessibility labels, board column behavior, empty filtered repos, mobile/compact layout, and max-lines lint constraints in the focus components.
- Existing plan facts: use chevron-style repo-level controls, add Collapse all / Expand all toolbar controls, keep repo summary counts visible while collapsed, persist collapsed state per surface in localStorage, verify with E2E and web checks.

## Goal Oracle

The oracle for this goal is:

`Playwright evidence on the dashboard proves Global Issues and Board support repo-level collapse/expand, collapse all, expand all, persisted per-surface state after reload, visible summary counts while collapsed, hidden issue-card content while collapsed, and no regressions in existing cross-repo dashboard behavior.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`specific`

## Current Tranche

Complete one coherent dashboard grouping slice: discover the exact component/test shape, implement persisted repo collapse/expand controls for Global Issues and Board, verify with focused E2E plus web package checks, then publish through the normal PR/merge queue path when green.

## Non-Negotiable Constraints

- Follow `AGENTS.md` and `CLAUDE.md`; use Playwright CLI for formal web UI verification.
- Preserve existing dashboard filters, saved defaults, operational views, and repo ordering behavior.
- Keep repo summary counts, repo health, and headers visible when a repo is collapsed.
- Persist collapsed state per surface, not globally across unrelated dashboard modes.
- Do not exceed existing lint constraints such as max-lines in focus components.
- Keep edits scoped to dashboard components, supporting hooks/helpers/styles, and E2E tests unless Scout/Judge proves a broader file is necessary.
- Before final handoff, identify realistic failure modes and provide acceptance evidence, not just "tests pass."

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

A Worker should finish the whole assigned slice. A Judge should judge the whole assigned slice. A PM should reorient the board when tasks are safe but not moving the outcome.

## Canonical Board

Machine truth lives at:

`docs/goals/dashboard-repo-grouping-controls/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/dashboard-repo-grouping-controls/goal.md.
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
11. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
