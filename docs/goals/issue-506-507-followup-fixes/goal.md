# Issue 506/507 Follow-Up Fixes

## Objective

Fix the remaining implementation gaps found in the post-release audit of issues 506 and 507, then verify the backend, CLI, and dashboard behavior with focused tests and a final completion audit.

## Original Request

"make a detailed plan to fix all using [$goalbuddy:goal-prep]"

## Intake Summary

- Input shape: `existing_plan`
- Audience: issuectl maintainers and operators using webhook automation.
- Authority: `requested`
- Proof type: `test`
- Completion proof: all four audited gaps are either implemented or explicitly rejected by a final Judge receipt, with focused core/web/cli tests passing and the final audit recording `full_outcome_complete: true`.
- Goal oracle: focused tests plus source inspection prove the four named gaps are closed:
  - `issuectl webhook replay <delivery_id>` exists, re-enqueues a retained delivery safely, records diagnostics, and is covered by CLI/core tests.
  - CLI `repo add` onboarding defaults and prompts match the accepted product decision for #507, with tests updated.
  - webhook event retention pruning exists for old `webhook_events` rows while preserving replay tombstones as intended, with tests.
  - REST repo add/update API supports `reviewPreamble` when API parity is in scope, with tests.
- Likely misfire: closing only the easiest CLI/test gaps while leaving product semantics undecided for retention or prompt defaults.
- Blind spots considered:
  - Replay can be unsafe if it bypasses repo/target gating incorrectly or destroys replay tombstones.
  - Retention must not break dedup/replay protection by deleting `webhook_deliveries`.
  - CLI prompt changes may intentionally differ from the original issue text if later product decisions changed defaults.
  - REST API parity may be optional if Apple/API clients are not expected to manage review preambles yet.
- Existing plan facts:
  - Gap 1: missing `issuectl webhook replay <delivery_id>` command.
  - Gap 2: CLI `repo add` prompts currently default automation and agents differently from #507 text.
  - Gap 3: raw payload pruning exists, but 30-day webhook event row pruning was not found.
  - Gap 4: web Server Actions support `reviewPreamble`, but REST repo add/update endpoints do not.
  - Focused tests already passed before this board: core 39, web 59, cli 30.

## Goal Oracle

The oracle for this goal is:

`A final Judge/PM audit maps each of the four audited gaps to a code path and passing verification command, with no required Worker task still queued or active.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Complete the follow-up fixes for the four gaps from the audit. The intended execution flow is: validate the gap list and product decisions, implement the largest safe coherent slices, run focused tests after each slice, then perform an integration audit against the original issue 506/507 requirements.

## Non-Negotiable Constraints

- Follow `AGENTS.md` and `CLAUDE.md`.
- Do not modify unrelated issuectl behavior or broad-refactor the webhook subsystem.
- Preserve SQLite replay tombstones unless a Judge explicitly approves a different retention model.
- Use repo-local patterns: ESM, strict TypeScript, functional style, explicit DB and Octokit parameters, Server Actions for web mutations, Server Components for reads.
- Keep Worker edits inside each task's `allowed_files`.
- Update tests with each behavior change.
- Do not create commits, push, or open a PR unless the user explicitly asks later.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

The preferred Worker slices are:

1. CLI replay as a complete vertical slice: DB helper, CLI command, diagnostics, tests.
2. CLI onboarding semantics as a complete CLI slice: prompt/default decision, implementation, tests.
3. Webhook retention as a complete persistence/worker slice: schema/settings decision if needed, prune helper, worker wiring, tests.
4. REST review preamble parity as a complete API slice: request validation, DB update wiring, response tests.

If Judge decides any slice is no longer needed, it must record why and how the goal oracle remains satisfied.

## Canonical Board

Machine truth lives at:

`docs/goals/issue-506-507-followup-fixes/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/issue-506-507-followup-fixes/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Work only on the active board task.
5. Write compact receipts into `state.yaml`.
6. Activate the next largest safe useful task until the oracle is satisfied.
7. Finish only with a Judge/PM audit receipt that maps all four gaps to code and verification, and records `full_outcome_complete: true`.
