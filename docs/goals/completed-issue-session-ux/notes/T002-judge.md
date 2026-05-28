# T002 Judge Receipt

## Decision

Approved Worker slice: implement a completed-session summary on issue detail by extending the existing `LaunchCard` path.

## Rationale

This slice satisfies the product gap without redefining live terminal state. It makes completed work visible on the primary issue detail page, keeps `Launch with Codex` available for new work, and uses the existing sessions page as the completed session/history affordance until a dedicated terminal transcript exists.

## Allowed Files

- `packages/web/components/detail/LaunchCard.tsx`
- `packages/web/components/detail/IssueDetail.module.css`
- `packages/web/components/detail/LaunchCard.test.ts`
- `docs/workflows/webhook-label-manual-qa.md`
- `docs/workflows/webhook-qa-ladder.md`
- `docs/workflows/webhook-auto-sessions.md`
- `docs/workflows/webhook-issue-to-pr-review-qa.md`
- `docs/goals/completed-issue-session-ux/state.yaml`
- `docs/goals/completed-issue-session-ux/notes/**`

## Verify

- `pnpm --dir packages/web test -- components/detail/LaunchCard.test.ts`
- `pnpm --dir packages/web typecheck`
- `git diff --check -- packages/web/components/detail docs/workflows docs/goals/completed-issue-session-ux`

## Stop If

- The implementation needs a live terminal attach for ended deployments.
- The new UI hides or disables the new launch action after completion.
- Existing live `Open Terminal` behavior changes.
