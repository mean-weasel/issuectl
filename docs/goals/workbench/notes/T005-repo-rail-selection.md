# T005 Repo Rail and Repo Selection Receipt

## Result

Done.

## Changed Files

- `packages/web/components/workbench/RepoRail.tsx`
- `packages/web/components/workbench/RepoOverviewFocus.tsx`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/components/workbench/WorkbenchShell.module.css`
- `packages/web/components/workbench/workbench-state.ts`
- `packages/web/components/workbench/workbench.test.ts`
- `packages/web/e2e/workbench.spec.ts`
- `packages/web/vitest.config.ts`

## Acceptance Evidence

- Default repo selection is the first repo in the aggregate payload.
- Selecting a repo clears selected issue/session state and returns to Workbench mode.
- Selected repo persists across Settings and Board before returning to Workbench.
- Repo rail badges use live deployment counts only: IC `3`, BD `1`, API no badge, WEB no badge.
- Repo rail uses accessible labels like `mean-weasel/issuectl` and compact readable initials.
- Rail width is `76px` at desktop and `68px` at `1100px`.
- Add repository opens repo setup URL state; Settings opens `/workbench/settings`.
- Repo overview shows full repo name, session/issue prompt, disabled `New shell unavailable`, `Refresh`, health summary, issue-load failures, and missing-local-path setup prompt.
- No fake terminal renders for repo-only state.

## Verification

- `pnpm --filter @issuectl/web test -- components/workbench/workbench.test.ts` passed: 1 file, 4 tests.
- `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium` passed: 7 tests.
- `pnpm --filter @issuectl/web typecheck` passed.
- `pnpm --filter @issuectl/web lint` passed with existing warnings in unrelated files.

## Notes

- `packages/web/vitest.config.ts` was added to this task's allowed files by PM amendment because the existing Vitest include pattern excluded `components/**/*.test.ts`, preventing the required T005 verifier from discovering the reducer test.
