# Issue 506/507 Gap Fixes

## Original Request

Use GoalBuddy goal-prep to comprehensively plan fixes for the remaining gaps between the current repository state and the plans in GitHub issues #506 and #507.

## Interpreted Outcome

Close the verified residual gaps from the independent #506/#507 audit while preserving the large implemented surface already present: webhook receiver/session lifecycle, PR review automation, daemon-mediated mutations, repo onboarding/settings, sessions/reviews navigation, webhook logs, diagnostics, and tests.

## Input Shape

`existing_plan`

The plan source is the already completed three-agent read-only audit. Do not restart broad discovery from scratch. Use Scout and Judge only to sharpen evidence, prioritize safely, and prevent the PM from fixing the wrong thing.

## Goal Oracle

The goal is complete only when a final Judge audit maps every audited gap to one of:

- fixed with passing focused verification;
- intentionally deferred with updated repo-native documentation and a clear reason;
- invalidated by source evidence.

Required proof:

- targeted core/web/cli tests for the files changed;
- `pnpm --dir packages/core typecheck`, `pnpm --dir packages/web typecheck`, and `pnpm --dir packages/cli typecheck` when touched surfaces require them;
- route or unit coverage for web-server boot reconciliation if implemented;
- final docs consistency check for `docs/specs/2026-05-23-webhooks-design.md`;
- `git diff --check`;
- final Judge receipt with `full_outcome_complete: true`.

## Known Gap Backlog

The previous audit identified these candidate gaps:

1. PR auto-review launch does not reject protected PR head branches before launching. Push mutation denies protected branches later, but #506 asked for launch-time safety gates.
2. `review_hard_timeout_minutes` and hard-timeout enforcement/recovery for PR reviews are missing or unproven.
3. `issuectl web` boot does not appear to reconcile stored webhook URLs for tunnel drift; reconciliation exists only through explicit repo webhook API/configuration paths.
4. Webhook issue sessions do not appear to receive completion tokens, so issue-session completion/check-in is not wired like PR review completion.
5. Agent action budgets are seeded only for PR sessions, not webhook issue sessions; decide whether that is a product gap or an intentional scope boundary, then fix or document it.
6. CLI onboarding preflight warns instead of fail-fast behavior for hook scope/cloudflared/start-tunnel described in #507; decide whether this is a required fix or a deliberately softened UX.
7. `docs/specs/2026-05-23-webhooks-design.md` contradicts implementation for webhook replay and PR push support.
8. Some #507 UI details are lighter than the plan, including sessions row actions, trigger icon/chip fidelity, and webhook log expansion detail. Decide which are acceptance gaps versus acceptable design simplifications.

## Constraints

- Follow `AGENTS.md` and `CLAUDE.md`.
- Do not revert unrelated user changes.
- Keep implementation slices bounded and reversible.
- Prefer existing core/web/cli patterns and tests.
- Use diagnostics-first reasoning for launch/session/webhook behavior.
- Do not treat planning or discovery as completion.
- Do not make broad UI redesigns unless Judge decides a specific #507 acceptance gap requires it.
- Avoid destructive GitHub or local state operations unless a task explicitly allows them and verification can be local/mocked.

## Likely Misfire

The PM could overfit to cosmetic #507 fidelity work while leaving high-risk lifecycle gaps unresolved, or could mark the issue complete after updating docs without proving webhook/PR session behavior. The board should prioritize safety/lifecycle correctness first, then docs and UX fidelity.

## Current Tranche Definition

Complete all safe local fixes and documentation corrections for the audited #506/#507 gaps, with tests proving behavior. If a gap needs a product decision or live credential/tunnel access, block that exact task with a receipt and continue with all safe local work.

## Starter Command

`/goal Follow docs/goals/issue-506-507-gap-fixes/goal.md.`
