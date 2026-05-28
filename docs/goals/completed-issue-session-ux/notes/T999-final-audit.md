# T999 Final Audit

## Decision

complete

`full_outcome_complete: true`

## Requirement Audit

- Issue detail page shows completed deployment/session history for the issue.
  - Proven by `LaunchCard` completed-state rendering and Playwright on `mean-weasel/issuectl-test-repo-2#35`, which showed `Completed session #151` with result metadata.
- A user can distinguish prior completed agent work from a never-worked issue.
  - Proven by `LaunchCard.test.ts`: completed deployments render a completed session record, while no deployments render nothing.
- If a completed terminal/transcript is available, issue detail offers a way to view it.
  - Proven by `CompletedSessionTerminalButton`, `getCompletedSessionTranscript`, `completed-terminal.test.ts`, and Playwright click-through on issue #35 showing the retained tmux transcript for `issuectl-issuectl-test-repo-2-35`.
- Live deployment behavior is unchanged.
  - Proven by `LaunchCard.test.ts`: live deployments still render the active banner path with `Open Terminal`, and completed deployments do not render `Open Terminal`.
- New launch behavior remains available and clearly separate.
  - Proven by Playwright on issue #35: `Launch with Codex` button count was `1` while the completed terminal button and session-history link were separate.
- Focused web tests exist for ended deployment rendering and live-vs-completed action behavior.
  - Proven by `LaunchCard.test.ts` and `completed-terminal.test.ts`; affected tests passed.
- Webhook QA docs include the completed issue-session check.
  - Proven by updates to `docs/workflows/webhook-label-manual-qa.md` and `docs/workflows/webhook-qa-ladder.md`.

## Verification Receipts

- `pnpm --dir packages/web test -- components/detail/LaunchCard.test.ts lib/actions/completed-terminal.test.ts lib/actions/launch.test.ts` passed.
- `pnpm --dir packages/web typecheck` passed.
- `pnpm --dir packages/web lint` passed.
- `git diff --check -- packages/web/components/detail packages/web/lib/actions/completed-terminal.ts packages/web/lib/actions/completed-terminal.test.ts packages/web/lib/actions/launch.ts packages/web/lib/actions/launch.test.ts docs/workflows docs/goals/completed-issue-session-ux` passed.
- Browser QA against `http://localhost:3847/issues/mean-weasel/issuectl-test-repo-2/35` passed.
- DB and diagnostics for issue #35 confirmed deployment `151` ended with `terminal_reason=completed` and completion status `no_changes`.

## Residual Risk

The completed terminal transcript is available only while the tmux session still exists on the local machine. When it is gone, the UI reports that the completed terminal is no longer available and still preserves completed session history.
