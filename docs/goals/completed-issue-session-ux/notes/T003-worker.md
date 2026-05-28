# T003 Worker Receipt

## Result

Implemented completed issue session evidence on the issue detail page.

## Changes

- `packages/web/components/detail/LaunchCard.tsx` now keeps live deployments on the existing active banner path and renders the latest ended deployment only when no live deployment exists.
- `packages/web/components/detail/CompletedSessionTerminalButton.tsx` opens a read-only completed terminal transcript when the retained tmux session is still available.
- `packages/web/lib/actions/completed-terminal.ts` validates the deployment target and captures the retained tmux pane without treating the deployment as live.
- The completed summary shows agent, deployment ID, result status, branch, ended date, duration, workspace, and completion summary.
- The completed-session action links to filtered Sessions history for the issue.
- `packages/web/components/detail/IssueDetail.module.css` adds responsive styling for the completed-session record.
- `packages/web/components/detail/LaunchCard.test.ts` covers live, completed, and never-launched states.
- `packages/web/lib/actions/completed-terminal.test.ts` covers transcript capture, missing tmux sessions, and active-session rejection.

## Verification

- `pnpm --dir packages/web test -- components/detail/LaunchCard.test.ts lib/actions/completed-terminal.test.ts lib/actions/launch.test.ts` passed.
- `pnpm --dir packages/web typecheck` passed.
- `pnpm --dir packages/web lint` passed.
- `git diff --check -- packages/web/components/detail docs/workflows docs/goals/completed-issue-session-ux` passed.

## Notes

Ended deployments are not treated as live. The completed terminal action is read-only tmux capture instead of `OpenTerminalButton`, because live terminal attach/auth still requires `endedAt === null`.
