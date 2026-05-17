# T004 Route Shell and Production Navigation Receipt

## Result

Done.

## Changed Files

- `packages/web/app/workbench/page.tsx`
- `packages/web/app/workbench/loading.tsx`
- `packages/web/app/workbench/error.tsx`
- `packages/web/app/workbench/WorkbenchPage.module.css`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/components/workbench/WorkbenchShell.module.css`
- `packages/web/components/workbench/workbench-api.ts`
- `packages/web/e2e/workbench.spec.ts`

## Acceptance Evidence

- `/workbench` renders the `issuectl` brand, repo rail, side panes, and center focus surface.
- Top nav labels are exactly `Issues`, `Board`, `PRs`, `Workbench`, `Quick Create`, `Settings`.
- Production shell does not render prototype controls: `Mock state`, `Terminal selected`, `Issue selected`, `Repo selected`, `Repo setup`, or top-level `New shell`.
- `fetchWorkbench` centralizes aggregate loading, auth header lookup, JSON parsing, and error handling.
- Loading, loaded, and error states keep the repo rail at `76px`; Playwright asserts no width drift.
- Error state renders `Retry workbench load`; clicking it issues one additional aggregate request and replaces the error with loaded content.
- Empty repo state renders `No tracked repositories` with accessible `Add repository` and `Open settings` actions.
- Nav mode clicks update URLs to `/workbench`, `/workbench/issues`, `/workbench/board`, `/workbench/prs`, `/workbench/quick-create`, and `/workbench/settings`.
- Global Issues, Board, and Settings collapse instance and issue panes; PRs and Quick Create keep panes visible for this slice.

## Verification

- `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium` passed: 5 tests.
- `pnpm --filter @issuectl/web typecheck` passed.
- `pnpm --filter @issuectl/web lint` passed with existing warnings in unrelated files.

## Notes

- First Playwright attempt found a selector ambiguity between top-nav `Settings` and rail `Open settings`; the spec was tightened to query inside `Workbench navigation`.
- Failed-first trace path: `packages/web/test-results/workbench-supports-top-nav-9fda5-side-panes-for-global-modes-desktop-chromium/trace.zip`.
