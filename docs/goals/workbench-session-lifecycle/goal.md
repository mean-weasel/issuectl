# Workbench Session Lifecycle Hardening

## Objective

Make Workbench session lifecycle behavior reliable and fully verified for real issue-backed terminal sessions: create, return to, reconnect, end, stale-cleanup, refresh, and web-app restart flows.

## Original Request

Use `$goalbuddy:goal-prep` to extensively plan rigorous QA and implementation for Workbench sessions after dogfooding exposed that issue #152 could remain in the left panel while reconnect failed with "Deployment not found or already ended."

## Intake Summary

- Input shape: `recovery`
- Audience: Jeremy dogfooding Workbench as the main desktop web surface for managing repo-scoped issue sessions.
- Authority: `requested`
- Proof type: `test | demo | artifact`
- Completion proof: Workbench has markdown manual workflows and automated Playwright/API coverage proving real and mocked session lifecycle paths work: launch, open after refresh, reconnect stopped ttyd, end/cancel without page reload, reconcile stale deployments, survive web app restart, and remove/update cards consistently.
- Likely misfire: adding superficial UI tests that mock happy-path launches while still missing real stale deployment, tmux/ttyd, refresh, restart, and failed-reconnect behavior.
- Blind spots considered: real ttyd/tmux process state can diverge from DB state; Workbench payload may include stale deployments; end/cancel interactions can trigger unwanted navigation; reconnect errors need UI reconciliation; tests must avoid destructive changes to non-test repos.
- Existing plan facts: create markdown workflows first; drive each one one at a time; pause, reflect, and fix before continuing; prefer safe test-repo issues; use Playwright CLI/headless where possible; verify both backend lifecycle APIs and visible Workbench behavior.

## Goal Kind

`recovery`

## Current Tranche

Complete a verified session-lifecycle hardening tranche for `/workbench`. The tranche includes discovery, workflow artifact creation, automated coverage, implementation fixes based on evidence, manual Playwright-driven QA, and a final audit. It is not complete until stale-session behavior is deterministic and the real dogfood scenario that produced issue #152 reconnect failure is covered by tests and manual workflow receipts.

## Non-Negotiable Constraints

- Do not run destructive lifecycle actions against non-test repos unless the operator explicitly approves.
- Preserve existing Workbench functionality and current app architecture unless evidence shows a root-cause design flaw.
- Do not patch symptoms before identifying which boundary failed: UI state, Workbench payload, deployment API, database state, tmux process, ttyd process, or browser navigation.
- Manual workflows must be safe, repeatable, and written in markdown before they are driven with Playwright.
- Automated acceptance must include measurable assertions, not visual inspection alone.
- Existing dogfood session state may be stale; cleanup or destructive action requires explicit task authority and must be recorded.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if safe Worker tasks remain.

Do not stop after one verified Worker package if the broader lifecycle remains unverified.

Do not mark the goal complete while any queued Worker task is still required for the original outcome.

## Slice Sizing

Use the largest safe useful slice. Scout/Judge tasks are read-only and should produce concrete allowed files and verification commands. Worker slices should be vertical where possible: a workflow plus the test/implementation that proves it, not isolated helper changes.

## Canonical Board

Machine truth lives at:

`docs/goals/workbench-session-lifecycle/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/workbench-session-lifecycle/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Work only on the active board task.
4. Use Scout/Judge/Worker roles according to the task.
5. Write compact receipts directly in `state.yaml`; use `notes/` only for long evidence.
6. Keep advancing through safe local work until final audit proves the tranche complete.
