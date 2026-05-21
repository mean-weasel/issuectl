# Live Codex Workbench E2E Coverage

## Objective

Add a guarded live end-to-end test tranche that proves an issue can be created in an approved issuectl test repo, launched with Codex through the workbench, kept reachable while navigating away and back, and cleaned up without touching non-test repositories.

## Original Request

Make a detailed GoalBuddy prep plan for live Codex workbench E2E coverage, restricted to the two issuectl test repos for issue creation, terminal session launch, and cleanup.

## Intake Summary

- Input shape: `specific`
- Audience: issuectl maintainers and future agents debugging launch/session regressions
- Authority: `requested`
- Proof type: `test`
- Completion proof: A checked-in live E2E spec or equivalent verified test harness exists, is guarded by an explicit allowlist of only `mean-weasel/issuectl-test-repo` and `mean-weasel/issuectl-test-repo-2`, and demonstrates issue creation, Codex launch, terminal persistence across navigation, return-to-session, and cleanup.
- Goal oracle: A live or safely skippable test command proves the guarded workflow end to end, plus static assertions prove no non-allowlisted repo can be used for create/launch/cleanup.
- Likely misfire: Adding more mocked workbench tests or isolated ttyd tests while still missing the real integrated path that failed manually.
- Blind spots considered: GitHub side effects, stale service workers, local server lifecycle, real Codex prerequisites, cleanup on failure, accidental repo targeting, CI suitability, and flaky timing around ttyd/tmux.
- Existing plan facts: The test should be restricted to the two issuectl test repos; it should cover issue creation, terminal session launch, navigating away to another issue/view, returning to the session, and closing/cleanup.

## Goal Oracle

The oracle for this goal is:

`A guarded live E2E command creates a uniquely-marked issue only in an allowlisted issuectl test repo, launches Codex, verifies the workbench terminal/session remains reachable across navigation and reload/return, ends the session, closes the created issue, and leaves no live deployment/tmux/ttyd residue; if prerequisites are absent, the test skips before side effects.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing mocked UI test, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`specific`

## Current Tranche

Implement the missing integrated coverage safely. Start by validating the current test harness and selecting the lowest-risk insertion point. Then add the guarded live E2E path, run the strongest feasible local verification, and audit the cleanup and allowlist protections.

## Non-Negotiable Constraints

- Issue creation, Codex terminal launch, cleanup, and issue closing may target only `mean-weasel/issuectl-test-repo` or `mean-weasel/issuectl-test-repo-2`.
- The test must fail or skip before side effects when a repo is outside the allowlist.
- Created issues must use a unique test marker and cleanup must only close allowlisted issues with that marker.
- Cleanup must be best-effort in `afterEach`/`afterAll` style paths so failures do not leave active sessions or open test issues.
- The test must not run against production or arbitrary repos by default.
- The implementation must preserve existing unit, integration, and mocked workbench coverage rather than replacing it.
- No implementation work should proceed without a bounded Worker task with explicit allowed files and verification commands.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Tiny tasks are allowed when the failure is isolated, the risk is high, the scope is unknown, or the tiny task unlocks a larger slice.

## Canonical Board

Machine truth lives at:

`docs/goals/codex-workbench-live-e2e/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/codex-workbench-live-e2e/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the allowlist, side-effect boundaries, cleanup proof, and live-test oracle before making changes.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
