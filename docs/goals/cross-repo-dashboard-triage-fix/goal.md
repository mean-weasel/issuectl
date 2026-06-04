# Cross-Repo Dashboard Triage Fix

## Objective

Fix the cross-repo dashboard experience so users can confidently scan, search, prioritize, and act on GitHub issues across tracked repositories from one coherent dashboard/workbench flow.

## Original Request

"make a detailed plan with goalbuddy prep to fix all"

## Intake Summary

- Input shape: `existing_plan`
- Audience: issuectl users who track and operate on issues across multiple GitHub repositories.
- Authority: `requested`
- Proof type: `test`
- Completion proof: focused unit/component/e2e checks plus a final source-backed audit prove that the dashboard and workbench surfaces address the three-agent audit findings without regressions.
- Goal oracle: run the focused dashboard/workbench verification suite and inspect the final UI/data behavior against the audit checklist: unambiguous repo identity, repo-aware search, global filters/sort/actions, visible issue-load errors/cache state, clear mobile state, safe action/offline semantics, and realistic viewport/accessibility coverage.
- Likely misfire: polishing one surface while leaving the other contradictory, or passing simple fixtures while realistic cross-repo cases still fail.
- Blind spots considered: duplicate repo names across owners, long labels/titles, mobile hidden state, stale/cache/error states, offline workbench mutation safety, high-impact action confirmations, and tests that seed too-simple data.
- Existing plan facts: three independent read-only analyses identified concrete fixes across IA/search, workflow/actions, and visual/accessibility; preserve those findings as the initial validated plan.

## Goal Oracle

The oracle for this goal is:

`A final Judge/PM audit maps completed receipts and verification evidence to every finding in the three-agent dashboard audit, with passing focused tests and at least one realistic cross-repo viewport/workflow proof.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Complete the dashboard/workbench cross-repo triage fixes as a continuous execution tranche. Validate the audit, choose the largest safe useful implementation packages, implement them with bounded file scopes, verify each package, and continue until the full audit checklist is either fixed or explicitly blocked with evidence.

## Non-Negotiable Constraints

- Follow `CLAUDE.md` and `AGENTS.md`.
- Do not revert unrelated local changes.
- Use Server Components for reads and Server Actions/API paths for mutations according to existing conventions.
- Preserve both existing surfaces unless a Judge explicitly approves consolidation or redirect behavior.
- Keep visual changes consistent with CSS Modules and existing paper/workbench design tokens.
- For UI changes, verify with Playwright CLI checks, not browser MCP or the Claude Chrome extension.
- For launch/terminal/workbench lifecycle claims, include diagnostics or targeted workbench evidence where relevant.
- Before final handoff, identify realistic failure modes and collect evidence that would have exposed them.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader dashboard audit still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

Worker packages should produce coherent user-visible behavior: for example, a repo-aware searchable dashboard, a more actionable global issues view, or realistic regression coverage.

## Canonical Board

Machine truth lives at:

`docs/goals/cross-repo-dashboard-triage-fix/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/cross-repo-dashboard-triage-fix/goal.md.
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
