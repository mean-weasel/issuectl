# T013 Global Issues Mode

Result: done

Implemented global Issues mode as the collapsed-side-pane destination for `/workbench/issues`.

## Changed Files

- `packages/web/components/workbench/GlobalIssuesFocus.tsx`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/e2e/workbench.spec.ts`

## Summary

Added a global issue focus that renders all aggregate payload issues grouped by repository, including fixture headings for `mean-weasel/issuectl`, `mean-weasel/bugdrop`, `mean-weasel/api`, and `mean-weasel/web`. Running issues render with `data-status="running"` and visible `running` text. Selecting an issue from global Issues mode selects that repository, returns to `/workbench`, restores the session and repo issue panes, and opens issue focus for the selected issue.

## Verification

Passed:

```sh
pnpm --filter @issuectl/web typecheck
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium
```

Playwright result: 16 tests passed on `desktop-chromium`.

The worker had one initial Playwright failure from an over-broad strict locator, fixed it, and reran the full workbench spec successfully before PM verification repeated the required checks.

## Acceptance Evidence

- Issues nav URL and active mode are `/workbench/issues`.
- `Active sessions` and `Repo issues` panes are hidden in Issues mode.
- `Repositories` rail remains visible.
- Center focus shows grouped global issues by repo.
- Global running issue row for `mean-weasel/issuectl #447` has `data-status="running"` and visible `running` text.
- Clicking `mean-weasel/bugdrop #440` returns to `/workbench`, selects the bugdrop repo rail item, restores both side panes, and opens `#440 bugdrop issue 1`.

Full outcome complete: false.

Next task: T014.
