# T007 Instance Pane for Issue Sessions

Result: done

Summary: Implemented the repo-scoped active session pane for issue deployments, including running-first/recent/kind sorting, preview status cards, error and unavailable states, reconnect, end confirmation, optimistic row removal, and terminal focus selection. Folded in review fixes for first-render subpath mode and server-side running-first deployment ordering.

Changed files:
- `packages/web/components/workbench/InstancePane.tsx`
- `packages/web/components/workbench/TerminalFocus.tsx`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/components/workbench/WorkbenchShell.module.css`
- `packages/web/components/workbench/workbench-state.ts`
- `packages/web/components/workbench/workbench-api.ts`
- `packages/web/components/workbench/workbench.test.ts`
- `packages/web/e2e/workbench.spec.ts`
- `packages/web/app/workbench/page.tsx`
- `packages/web/app/workbench/[mode]/page.tsx`
- `packages/web/lib/workbench-data.ts`
- `docs/goals/workbench/state.yaml`

Acceptance evidence:
- Preview error state: Playwright asserts `Session #486` has `data-status="error"` and visible `Error: preview failed` text.
- Reconnect endpoint: Playwright intercepts `POST /api/v1/deployments/103/ensure-ttyd`, verifies bearer auth, returns `{ "alive": true, "port": 7799 }`, and asserts terminal iframe `src` contains `/api/terminal/7799`.
- End endpoint: Playwright intercepts `POST /api/v1/deployments/102/end`, verifies bearer auth and request body, confirms `End session?`, and asserts the `#498` row is removed.
- Sorting: component tests assert default `running first` order `[101, 103, 102]`, `recent` order `[103, 102, 101]`, and deterministic `kind` ordering.

Verification:
- `pnpm --filter @issuectl/web test -- components/workbench/workbench.test.ts` passed, 5 tests.
- `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium` passed, 12 tests.
- `pnpm --filter @issuectl/web typecheck` passed.
- `pnpm --filter @issuectl/web test -- app/api/v1/workbench/route.test.ts` passed, 3 tests.
- `pnpm --filter @issuectl/web lint` passed with the existing 6 warnings in unrelated files.

Remaining blockers: none for this task.

Full outcome complete: false

Next task: T008
