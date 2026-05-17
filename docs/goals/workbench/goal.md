# Workbench Implementation Goal

## Objective

Implement the new desktop-first `/workbench` web dashboard from `docs/superpowers/plans/2026-05-16-workbench.md`, preserving the existing app while adding a repo-scoped issue/session manager verified by tests, Playwright, CLI screenshots, PR review, and CI.

## Original Request

Use `docs/superpowers/plans/2026-05-16-workbench.md` to prepare a GoalBuddy board for implementing `/workbench`.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Jeremy as the primary operator of issuectl, plus future Codex/GoalBuddy workers implementing the plan.
- Authority: `requested`
- Proof type: `test`
- Completion proof: `/workbench` is implemented through the plan's verified PR batches; final QA shows the mockup-backed workflows pass automated Playwright, CLI screenshot artifact checks, local verification, PR review, and green CI.
- Likely misfire: GoalBuddy could produce another issue-list page or partial dashboard polish while missing the core repo-scoped instance manager and mockup-specific side-pane behavior.
- Blind spots considered: named plain shells are not currently API-backed; PR/CI workflow must be explicit; Playwright CLI screenshots must be acceptance evidence; global modes must collapse side panes; existing dashboard routes must remain intact.
- Existing plan facts: The source artifact is `docs/superpowers/plans/2026-05-16-workbench.md`, including its mockup map, fixture contract, traceability matrix, objective UI standards, Playwright requirements, task list, named-shell decision gate, and PR/CI workflow.

## Goal Kind

`existing_plan`

## Current Tranche

Complete the `/workbench` implementation described by the plan through successive safe verified PR batches. Start by validating the plan against current route/component/API boundaries, then execute one bounded Worker card at a time. Named plain shells require a Judge decision before implementation and may become a separate follow-up goal.

## Non-Negotiable Constraints

- Preserve existing dashboard routes and behavior.
- Use `docs/mockups/workbench.html` and `docs/superpowers/plans/2026-05-16-workbench.md` as the controlling product references.
- Do not add prototype/mock-state navbar controls to production.
- Board, Settings, and global Issues modes must collapse both side panes.
- Running sessions sort before idle sessions by default.
- Do not fake named plain shells as issue deployments.
- Every visible slice must include Playwright acceptance coverage or artifact proof as specified by the plan.
- Use PR-sized batches with review, CI monitoring, and merge-only-when-green criteria.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package while the broader `/workbench` outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A Worker should complete the whole assigned slice and return a receipt with changed files, verification commands, Playwright evidence where applicable, API request assertions for mutations, and any mockup deviations.

## Canonical Board

Machine truth lives at:

`docs/goals/workbench/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/workbench/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Re-check the plan artifact and current active task.
4. Work only on the active board task.
5. Assign Scout, Judge, Worker, or PM according to the task.
6. Write a compact task receipt.
7. Update the board.
8. Continue to the next safe Worker task unless a phase/risk/final Judge boundary is active.
9. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original outcome and records `full_outcome_complete: true`.
