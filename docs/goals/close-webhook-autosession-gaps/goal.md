# Close Webhook Auto-Session Gaps

## Original Request

Use GoalBuddy to make a detailed plan to close the verified implementation gaps for GitHub issues #506 and #507, while treating the CLI `repo add` end-to-end installer as product polish/follow-up rather than a blocking correctness gap.

## Interpreted Outcome

The issuectl repo should be brought to a state where the remaining webhook auto-session and operator UX gaps are fixed, verified, and audited against the original issue requirements. The next `/goal` run should execute the plan, not merely re-plan it.

## Input Shape

specific / existing-plan hybrid

The user supplied a prior three-agent audit and accepted one scope decision: CLI `repo add` not performing full webhook installation is not blocking issue #507 completion, but should be tracked as a follow-up/polish item.

## Goal Oracle

The goal is complete when a final Judge or PM audit verifies all required gaps are either fixed with passing tests or explicitly recorded as non-blocking follow-up:

- PR review fix-push behavior is implemented end to end through the daemon-mediated mutation gateway, or the product/spec is updated with an explicit non-goal accepted by the operator.
- Disabling/removing repo automation ends active webhook PR sessions and also marks linked `pr_reviews` terminal so future reviews are not locked.
- Webhook log links from repo settings correctly filter by repo and delivery.
- `repo.automation_disabled` diagnostics include affected session IDs.
- Review detail exposes the required metadata/link-outs that are supported by persisted data, or the unsupported fields are recorded as follow-up with evidence.
- Relevant core/web/cli tests, typecheck/lint as appropriate, and a final local dirty-diff audit pass.

## Constraints

- Follow `CLAUDE.md` and `AGENTS.md`.
- Do not revert unrelated user changes.
- Keep edits narrowly scoped to the affected webhook, repo settings, review detail, diagnostics, and tests.
- Use diagnostics-first reasoning for launch/session/workbench failures.
- Keep the CLI `repo add` full installer as follow-up/polish unless the operator changes scope.
- Prefer existing project patterns: ESM, strict TypeScript, no classes, Server Actions for mutations, Server Components for reads, CSS Modules.
- Worker tasks must be bounded by explicit allowed files and verification commands.

## Likely Misfire

The run could declare success after adding tests or UI affordances while leaving the daemon-mediated push path or stale PR-review lock behavior incomplete. The board must keep pressure on actual behavioral proof, not just surface-level coverage.

## Current Tranche

Close the verified blockers from the audit, preserve the accepted non-blocking CLI follow-up decision, and finish with a final audit that maps code, tests, and issue requirements.

