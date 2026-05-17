# T017 Pull Requests Mode

Result: done

Implemented `/workbench/prs` as a repo-scoped pull request surface.

## Changed Files

- `packages/web/components/workbench/PullRequestsFocus.tsx`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/e2e/workbench.spec.ts`

## Summary

Added a focused PR panel for the selected repo. It loads PRs with checks, displays check status and linked issue hints, opens PR detail in the center focus pane, and supports review approval, squash merge, and comment actions using the existing API routes. Empty state is repo-specific.

## Verification

Passed:

```sh
pnpm --filter @issuectl/web typecheck
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium
```

Playwright result: 21 tests passed on `desktop-chromium`.

## Acceptance Evidence

- `PRs` top nav opens `/workbench/prs`.
- `GET /api/v1/pulls/mean-weasel/issuectl?checks=true` loads rows.
- PR rows show check state and linked issue text.
- Opening `#501` calls `GET /api/v1/pulls/mean-weasel/issuectl/501` and renders detail.
- Review action calls `POST /api/v1/pulls/mean-weasel/issuectl/501/review` with `{ "event": "APPROVE", "body": "Looks good" }`.
- Merge action calls `POST /api/v1/pulls/mean-weasel/issuectl/501/merge` with `{ "mergeMethod": "squash" }`.
- Comment action calls `POST /api/v1/pulls/mean-weasel/issuectl/501/comments` with `{ "body": "Workbench PR comment" }`.
- Selecting `mean-weasel/web` then opening PRs shows the repo-specific empty state.

Full outcome complete: false.

Next task: T018.
