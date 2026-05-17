# T010 Issue Detail Focus and Mutations

Result: done

Summary: Implemented center-pane issue detail loading and mutation controls. Issue details load from the existing detail API, render markdown through the existing `BodyText`, show cached/detail metadata, linked PRs, deployments, and comments, and expose controls for title edit, comments, state, priority, labels, assignees, reassign, and image upload.

Changed files:
- `packages/web/components/workbench/IssueFocus.tsx`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/components/workbench/WorkbenchShell.module.css`
- `packages/web/components/workbench/workbench-api.ts`
- `packages/web/e2e/workbench.spec.ts`
- `docs/goals/workbench/state.yaml`

Endpoint assertions:
- `GET /api/v1/issues/mean-weasel/issuectl/512`
- `PATCH /api/v1/issues/mean-weasel/issuectl/512`
- `POST /api/v1/issues/mean-weasel/issuectl/512/comments`
- `POST /api/v1/issues/mean-weasel/issuectl/512/state`
- `PUT /api/v1/issues/mean-weasel/issuectl/512/priority`
- `POST /api/v1/issues/mean-weasel/issuectl/512/labels`
- `PUT /api/v1/issues/mean-weasel/issuectl/512/assignees`
- `POST /api/v1/issues/mean-weasel/issuectl/512/reassign`
- `POST /api/v1/images/upload`

Acceptance evidence:
- Playwright asserts loading text, markdown bold/link/list rendering, visible linked PR `#501 terminal-reconnect-fix`, visible deployment `101`, and visible `Cached`.
- Playwright asserts priority change updates the right queue, close removes the issue from open work and moves it to closed, and reassign shows `#612 Reassigned issue #612`.
- Each mutation endpoint above has a Playwright method, route, bearer auth, and required-body assertion.

Verification:
- `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium` passed, 14 tests.
- `pnpm --filter @issuectl/web typecheck` passed.
- `pnpm --filter @issuectl/web lint` passed with the existing 6 unrelated warnings.

Remaining blockers: none for this task.

Full outcome complete: false

Next task: T011
