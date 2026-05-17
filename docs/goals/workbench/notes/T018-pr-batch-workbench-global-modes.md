# T018 PR Batch: workbench-global-modes

Result: done

Prepared the local PR batch for Tasks 9-13 on branch `workbench-aggregate-and-shell`.

No GitHub PR was opened, CI was not run, and no merge was attempted because this GoalBuddy board is still accumulating local, unpushed work.

## Review

Final review command:

```sh
~/.codex/skills/codex-review/scripts/codex-review --full-access
```

Result: clean. The final review reported no accepted or actionable findings.

Accepted findings fixed during T018:

- Removed undefined `react-hooks/exhaustive-deps` lint disables from `RepoSetupFocus.tsx` and `SettingsFocus.tsx`.
- Deleting the active repo now replaces the selected repo with the first remaining repo, while preserving settings mode for the repo setup flow.
- Selecting or reconnecting a session from PRs or Quick Create now normalizes the browser URL to `/workbench`.
- PR list loads now use `AbortController` so stale list responses cannot overwrite the current repo's PR state after repo changes.

Review-run caveats:

- `pnpm --filter @issuectl/web build` failed in the review runner because `next/font` could not resolve `fonts.googleapis.com`; this is the known local DNS/network build blocker, not a patch regression.
- The review runner's unscoped e2e command `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts` hit a dev-server timeout. The scoped project command below passed in the PM thread.

## Verification

Passed:

```sh
pnpm --filter @issuectl/web typecheck
pnpm --filter @issuectl/web test -- components/workbench/workbench.test.ts
pnpm --filter @issuectl/web test
pnpm --filter @issuectl/web lint
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium
```

Results:

- Unit suite: 27 files passed, 251 tests passed.
- Workbench reducer test: 7 tests passed.
- Workbench Playwright suite: 21 tests passed on `desktop-chromium`.
- Lint: 0 errors, 8 warnings. Warnings are file length in existing/large files and existing `no-explicit-any` warnings in `lib/api-auth.test.ts`.

## Playwright Coverage Rows

- Global Issues: side panes collapse, repo headings render, running issue status appears, selecting a global issue returns to `/workbench`, restores side panes, selects the repo, and opens issue focus.
- Board: four repo columns render, running-only filter is reversible, priority sort is asserted, and opening a board card restores `/workbench` side panes and issue focus.
- Settings and repo setup: settings side panes collapse, health/user/tracked repo count render, settings PATCH is asserted, repo setup PATCH/add/delete/refresh endpoints are asserted, and deleting the active repo falls back to `mean-weasel/issuectl`.
- Quick Create: parse, accepted create, draft create, draft update, and draft assign endpoints are asserted.
- PRs: list loads with `checks=true`, detail opens, review/merge/comment endpoints are asserted, merged state updates, and repo-specific empty state renders.
- Session URL normalization: opening a session from Quick Create returns the URL to `/workbench` before the terminal iframe opens.

## PR / CI / Merge

- PR: not opened.
- CI: not run.
- Merge: not attempted.

Full outcome complete: false.

Next task: T019.
