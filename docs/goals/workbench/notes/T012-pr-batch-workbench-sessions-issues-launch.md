# T012 PR Batch: workbench-sessions-issues-launch

Result: done

Prepared the local PR batch for Tasks 4-8 on branch `workbench-aggregate-and-shell`. No GitHub PR was opened, CI was not run, and no merge was attempted because this board is still progressing as local unpushed GoalBuddy work.

## Review

Final review command:

```sh
~/.codex/skills/codex-review/scripts/codex-review --full-access
```

Result: clean. The reviewer reported no accepted or actionable findings after the focused fixes below.

The review reran local checks and also attempted `pnpm --filter @issuectl/web build`; build remains blocked by environment/network failure fetching Google Fonts from `fonts.googleapis.com`, with the existing unrelated `next.config.ts` `serverActions` warning still present. The review also attempted an unscoped Playwright command that could not bind a dev server in the nested review environment (`listen EPERM`); the scoped desktop Playwright verifier below passed in the main environment.

## Accepted Findings Fixed

- Stale issue detail is cleared when switching issues.
- Local issue updates are scoped by repository instead of issue number alone.
- End-session success clears the issue running status and removes the session row.
- Terminal iframes are tokenized with `terminalToken` returned by ensure-ttyd.
- Launch context is seeded from loaded issue detail instead of fixture defaults.
- Issue focus detail state stays synchronized after title, state, priority, label, assignee, and reassign mutations.
- Mutation controls were tightened: title save waits for loaded detail and sends only `{ title }`, reopen does not send close text, and reassign requires an explicit visible target.
- Ensure-ttyd success shape now matches the real endpoint: `{ port, terminalToken }`.
- Queue `Launch` selects the issue and opens issue focus before launch.
- Assignment uses the authenticated workbench user and labels the action as `Assign me`.
- Selecting an issue from global modes returns to `/workbench` so side panes and issue/session context are visible.
- Reassign locally closes the source issue, inserts the reassigned issue in the target repo, and selects the target issue.
- Issue-scoped transient state such as worktree status and reassigned issue result resets when issue/repo changes.

## Verification

Passed:

```sh
pnpm --filter @issuectl/web typecheck
pnpm --filter @issuectl/web test -- app/api/v1/workbench/route.test.ts components/workbench/workbench.test.ts
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium
pnpm --filter @issuectl/web lint
```

Focused unit result: 2 files / 9 tests passed.

Focused Playwright result: 15 tests passed on `desktop-chromium`.

Lint passed with 6 existing warnings:

- `packages/web/components/list/List.tsx` max-lines
- `packages/web/components/settings/SettingsForm.tsx` max-lines
- `packages/web/lib/actions/issues.ts` max-lines
- `packages/web/lib/api-auth.test.ts` two `@typescript-eslint/no-explicit-any` warnings
- `packages/web/lib/terminal-proxy.ts` max-lines

Review also observed the full web Vitest suite passing: 27 files / 250 tests.

Build was not accepted as proof because `next build` failed while fetching Google Fonts from `fonts.googleapis.com` with `getaddrinfo ENOTFOUND`.

## Playwright Coverage Rows

The batch covers these workbench rows in `packages/web/e2e/workbench.spec.ts`:

1. Production shell renders without prototype controls.
2. Rail width stays stable across loading and loaded states.
3. Compact rail width applies at 1100px.
4. Server-loaded workbench content can be refreshed.
5. Top nav modes collapse side panes for global modes.
6. Deep links for workbench subpaths avoid 404s.
7. Repo selection updates overview focus and persists across modes.
8. Sorted session previews open tokenized terminal focus.
9. Reconnect calls ensure-ttyd and updates the tokenized iframe.
10. End session calls the endpoint, removes the row, and updates running counts.
11. Issue filters, details, and jump-to-session are wired.
12. Issue detail mutation endpoints are asserted, including safe patch, reassign, authenticated assignment, and source close behavior.
13. Worktree status, reset/cleanup, queue launch, exact launch payload, duplicate handling, and tokenized launched terminal are covered.
14. Empty repositories `Add repository` action opens repo setup.
15. Empty repositories `Open settings` action opens settings.

## Outcome

Full outcome complete: false.

Next task: T013.
