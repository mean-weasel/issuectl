# T019 Width Adjustability And Collapsible Sections

## Result

Done. Task 14 is implemented for `/workbench`: repo side columns are resizable, widths persist and reset, global modes ignore side-pane widths, and the main repo/session/issue/settings sections can collapse and expand.

## Scope Notes

- Added `SettingsFocus.tsx` to T019 allowed files because Task 14 acceptance criteria explicitly included collapsible settings groups.
- Codex review found PR action buttons in `PullRequestsFocus` were calling missing `review`, `merge`, and `comments` endpoints. I added the real API routes and fixed review-reported regressions in those routes:
  - merge rejection returns non-2xx instead of marking a failed merge as merged
  - manual checks refresh uses `refresh=true`
  - direct merges send merged-PR notifications
  - empty `COMMENT` reviews and oversized review bodies return local 400s
  - PR mode clears stale rows/detail on repo-scoped reload
- Codex review also found issue metadata updates could reset launch context; `IssueFocus` now resets launch state only when the selected repo/issue identity changes, with Playwright coverage for preserving preamble after priority change.

## Files Changed

- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/components/workbench/WorkbenchShell.module.css`
- `packages/web/components/workbench/InstancePane.tsx`
- `packages/web/components/workbench/IssueFocus.tsx`
- `packages/web/components/workbench/SettingsFocus.tsx`
- `packages/web/components/workbench/workbench-state.ts`
- `packages/web/components/workbench/workbench.test.ts`
- `packages/web/e2e/workbench.spec.ts`
- `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/review/route.ts`
- `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/merge/route.ts`
- `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/comments/route.ts`

## Acceptance Proof

- Width persistence key: `issuectl.workbench.columnWidths`.
- Drag proof: Playwright verifies stored JSON becomes `{"instances":360,"issues":420}` after dragging both handles.
- Reset proof: Playwright verifies reset returns stored JSON to `{"instances":284,"issues":348}`.
- Clamp proof: unit tests verify instance width clamps to `220..360` and issue width clamps to `260..420`.
- Layout proof: Playwright `assertVisibleWorkbenchLayout` checks rail, instance pane, focus pane, and issue pane ordering without overlap at `1440x1000` and `1100x850`; focus width remains at least `440px`.
- Collapse proof: Playwright verifies `Issue sessions`, `Named shells`, issue comments, and settings health collapse via `aria-expanded=false` and hidden bodies, with instance counts preserved across repo changes.
- Global mode proof: unit and e2e tests verify Issues, Board, and Settings collapse side panes while Workbench, PRs, and Quick Create keep repo side panes.

## Verification

- `pnpm --filter @issuectl/web typecheck` passed.
- `pnpm --filter @issuectl/web test -- components/workbench/workbench.test.ts` passed.
- `pnpm --filter @issuectl/web test -- app/api/v1/workbench/route.test.ts components/workbench/workbench.test.ts` passed.
- `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium` passed: 23 tests.
- `pnpm --filter @issuectl/web test` passed: 27 files, 255 tests.
- `pnpm --filter @issuectl/web lint` passed with 8 existing warnings.
- `~/.codex/skills/codex-review/scripts/codex-review --full-access` passed: clean, no accepted/actionable findings.

## Caveats

- `pnpm -C packages/web build` remains blocked by `getaddrinfo ENOTFOUND fonts.googleapis.com` for `next/font` in `app/layout.tsx`; this is the same known local network/font-fetch caveat.
- Build also reports an existing invalid `next.config.ts` `serverActions` key warning.
- Goal outcome is not complete; T020 is next and must decide named plain shell scope.
