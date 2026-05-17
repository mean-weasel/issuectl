# T014 Cross-Repo Board Mode

Result: done

Implemented `/workbench/board` as a collapsed-side-pane cross-repo issue board.

## Changed Files

- `packages/web/components/workbench/BoardFocus.tsx`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/e2e/workbench.spec.ts`

## Summary

Added a board focus with one column per tracked repository in aggregate payload order. Cards show issue number/title, status, priority, updated age, and active-session indicator. The board supports payload-order and priority sorting, a reversible `Show running only` filter, empty-column messages, and issue card selection that returns to `/workbench`, selects the repo, restores side panes, and opens issue focus.

The worker initially blocked because the running-only proof rendered 3 cards. PM fixed the E2E fake tmux fixture to expose the active `issuectl-bugdrop-440` session, aligning the fixture with the plan expectation of four running issues.

## Verification

Passed:

```sh
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium
pnpm --filter @issuectl/web typecheck
```

Playwright result: 17 tests passed on `desktop-chromium`.

## Acceptance Evidence

- Board mode keeps `Active sessions` and `Repo issues` hidden.
- `Repositories` rail remains visible.
- `Cross-repo board` renders four repo columns: `mean-weasel/issuectl`, `mean-weasel/bugdrop`, `mean-weasel/api`, and `mean-weasel/web`.
- Running-only filter reduces visible cards to four running issues and keeps all four columns present.
- Toggling running-only again restores seven open issue cards.
- Empty repos/columns show `No matching issues.`
- Priority sort places high-priority `#512` before normal-priority `#447` in the issuectl column.
- Clicking `#512` returns to `/workbench`, restores both side panes, selects the issuectl repo, and opens issue focus.

Full outcome complete: false.

Next task: T015.
