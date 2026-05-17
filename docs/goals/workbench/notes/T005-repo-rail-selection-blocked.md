# T005 Repo Rail and Repo Selection Receipt

## Result

Blocked on the exact unit-test verification command.

## Implemented Before Blocker

- Extracted `RepoRail` with accessible repo labels, compact initials, live deployment badges, selected repo state, and rail add/settings actions.
- Added `RepoOverviewFocus` for repo-only focus state with repo full name, selection prompt, disabled `New shell unavailable`, `Refresh`, health summary, local-path setup prompt, and issue-fetch failure state.
- Added `workbench-state.ts` with reducer helpers for default repo selection, repo selection clearing issue/session state, submode persistence, and rail badge counts.
- Extended Playwright coverage for:
  - IC/BD/API/WEB rail labels.
  - `76px` rail at desktop and `68px` rail at `1100px`.
  - repo click focus changes.
  - selected repo persistence through Settings and Board back to Workbench.
  - issue-error and missing-local-path overview states.

## Changed Files

- `packages/web/components/workbench/RepoRail.tsx`
- `packages/web/components/workbench/RepoOverviewFocus.tsx`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/components/workbench/WorkbenchShell.module.css`
- `packages/web/components/workbench/workbench-state.ts`
- `packages/web/components/workbench/workbench.test.ts`
- `packages/web/e2e/workbench.spec.ts`

## Verification

- `pnpm --filter @issuectl/web test -- components/workbench/workbench.test.ts` failed before running tests because the existing Vitest config only includes `app/**/*.test.ts` and `lib/**/*.test.ts`.
- `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium` passed: 7 tests.
- `pnpm --filter @issuectl/web typecheck` passed.
- `pnpm --filter @issuectl/web lint` passed with existing warnings in unrelated files.

## Blocker

Making the exact required unit-test command discover `components/workbench/workbench.test.ts` needs a file outside T005 allowed files, likely `packages/web/vitest.config.ts`, or a board-approved relocation of the unit test. T005 stop condition applies: need files outside `allowed_files`.
