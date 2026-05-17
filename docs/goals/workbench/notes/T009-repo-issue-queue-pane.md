# T009 Repo Issue Queue Pane

Result: done

Summary: Implemented the right-side repo issue queue with open-work, running, and closed filters. Rows show issue number, title, status, priority, updated age, Launch for non-running open issues, Jump to session for running issues, and Details. Details opens a center issue focus placeholder; Jump to session selects the active terminal focus.

Changed files:
- `packages/web/components/workbench/IssueQueuePane.tsx`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/components/workbench/WorkbenchShell.module.css`
- `packages/web/components/workbench/workbench-state.ts`
- `packages/web/components/workbench/workbench.test.ts`
- `packages/web/e2e/workbench.spec.ts`
- `docs/goals/workbench/state.yaml`

Acceptance evidence:
- Component tests assert repo A counts `{ open: 4, running: 3, closed: 0 }`, open issue order `[447, 498, 486, 512]`, running issue order `[447, 498, 486]`, and closed is empty.
- Playwright asserts visible `open work 4`, four default issue rows, three running rows, zero closed rows, Details on `#512` changes the center heading to `#512 Desktop instance manager workbench`, and Jump to session on `#447` renders `/api/terminal/7701`.

Verification:
- `pnpm --filter @issuectl/web test -- components/workbench/workbench.test.ts` passed, 6 tests.
- `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium` passed, 13 tests.
- `pnpm --filter @issuectl/web typecheck` passed.
- `pnpm --filter @issuectl/web lint` passed with the existing 6 unrelated warnings.

Remaining blockers: none for this task.

Full outcome complete: false

Next task: T010
