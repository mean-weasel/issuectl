# T006 PR Batch: workbench-aggregate-and-shell

## Branch / PR

- Local branch: `workbench-aggregate-and-shell`
- PR: not opened yet; the batch remains local and uncommitted while the GoalBuddy board continues into the next implementation slice.
- Merge: not attempted.

## Review

- Required review command: `codex review --uncommitted`
- Accepted findings fixed before closeout:
  - Added real `/workbench/*` subpath routes for production navigation.
  - Wired empty-repository setup/settings actions.
  - Removed the need for real `gh auth` in the workbench E2E server startup path.
  - Reworked workbench loading so the browser does not receive the shared API token and `/api/v1/workbench` remains bearer-protected.
- Final review result: no actionable correctness issues found.
- Review caveat: the review sandbox could not bind a Next server and production build could not fetch Google Fonts; local workspace verification below passed.

## Verification

- `pnpm --filter @issuectl/web test -- app/api/v1/workbench/route.test.ts components/workbench/workbench.test.ts` passed.
- `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium` passed.
- `pnpm --filter @issuectl/web typecheck` passed.
- `pnpm --filter @issuectl/web lint` passed with the existing warning set.
- `pnpm -C packages/web test` passed during review.

## Decision

- Continue to T007 on the local branch.
- CI and merge remain pending until a PR is opened from the accumulated batch.
