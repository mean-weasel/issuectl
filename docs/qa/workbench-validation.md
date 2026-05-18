# Workbench Validation

Date: 2026-05-17

## Summary

Task 16 responsive QA is complete for production `/workbench`.

Named plain shells are intentionally unavailable in v1 per T020: the UI keeps the `Named shells 0` / `Named shells are not available yet` state and does not fake named shells as issue deployments.

Follow-up scope decision on 2026-05-18: the next Workbench quality run is desktop-scoped.
The supported Workbench body layout matrix for that run is `1440x1000`, `1280x900`, and
`1100x850`. Narrow `768px`/`390px` checks may cover header/control reachability, but mobile
or narrow multi-pane body usability is not an acceptance criterion for that run.

## Commands

| Command | Status | Notes |
| --- | --- | --- |
| `pnpm --filter @issuectl/web typecheck` | pass | TypeScript passed. |
| `pnpm --filter @issuectl/web lint` | pass | 8 existing warnings: max-lines and two `any` warnings in existing files. |
| `pnpm --filter @issuectl/web test` | pass | 27 files, 255 tests. |
| `pnpm --filter @issuectl/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "responsive QA\\|captures workbench QA"` | pass | Targeted Task 16 QA tests passed. |
| `pnpm --filter @issuectl/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "No tracked repositories\\|Add repository\\|repo setup"` | pass | Empty-repository first-run path passed with the full-suite-safe test enabled. |
| `pnpm --filter @issuectl/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium` | pass | Full Workbench suite exited 0 with empty-repository coverage enabled; one stale-terminal navigation case passed on the configured retry after a worker-boundary `page.goto` abort. |
| `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium --trace=on` | stale | Previous run passed before this follow-up; rerun only if trace evidence is needed. |

## Screenshot Artifacts

Required high-DPI screenshots:

| Artifact | Size | Source |
| --- | ---: | --- |
| `docs/qa/workbench-artifacts/workbench-terminal-1440.png` | 317 KB | Playwright e2e click-through terminal focus. |
| `docs/qa/workbench-artifacts/workbench-issue-1440.png` | 620 KB | Playwright e2e click-through issue detail focus. |
| `docs/qa/workbench-artifacts/workbench-settings-1440.png` | 38 KB | Playwright e2e repo setup/settings focus. |
| `docs/qa/workbench-artifacts/workbench-board-1440.png` | 46 KB | Playwright e2e board focus. |
| `docs/qa/workbench-artifacts/workbench-terminal-1100.png` | 299 KB | Playwright e2e click-through terminal focus at 1100px. |

CLI screenshot pass:

| Artifact | Source |
| --- | --- |
| `docs/qa/workbench-artifacts/cli-workbench-overview-1440.png` | `playwright screenshot http://localhost:3848/workbench` |
| `docs/qa/workbench-artifacts/cli-workbench-settings-1440.png` | `playwright screenshot http://localhost:3848/workbench/settings` |
| `docs/qa/workbench-artifacts/cli-workbench-board-1440.png` | `playwright screenshot http://localhost:3848/workbench/board` |
| `docs/qa/workbench-artifacts/cli-workbench-overview-1100.png` | `playwright screenshot http://localhost:3848/workbench` at 1100x850 |

Terminal and issue focus states are URL-addressable with `repo`, `issue`, and `deployment`
query parameters; the required screenshots are still produced by the e2e screenshot test after
selecting fixture sessions/issues so the artifacts cover the fully rendered focus panes.

## Coverage Matrix

| Mockup state | Status | Evidence |
| --- | --- | --- |
| Initial terminal focus | pass | URL focus, launch, screenshot tests assert terminal iframe rendering plus readable terminal fixture text; `workbench-terminal-1440.png`; `workbench-terminal-1100.png`. |
| Issue detail focus | pass | `loads issue detail and calls issue mutation endpoints`; labels/title-edit/status feedback are asserted; `workbench-issue-1440.png`. |
| Repo overview | pass | `selects repos, updates overview focus, and preserves selection across modes`. |
| Direct subpath auth | pass | `direct-load workbench settings bootstraps the API token before client actions` covers fresh `/workbench/settings` authenticated settings/health/user/save requests. |
| Keyboard focus management | pass | `moves focus into workbench focus after repo issue session and mode changes` covers repo, issue, terminal, and mode focus transitions. |
| Instance sorting | pass | Final terminal/reconnect coverage asserts session ordering before opening terminal focus. |
| Preview error state | pass | `Session #486` asserts `data-status="error"` and error text. |
| Issue queue filters | pass | `filters repo issues and links details and running sessions`; queue action label is `Prepare launch` and real launch remains guarded by `Launch issue`. |
| Launch options/worktree | pass | `checks worktree status and launches an issue with selected context`. |
| Global Issues | pass | `shows global issues by repo and opens the selected repo issue`; side panes hidden. |
| Board | pass | `shows cross-repo board columns and reversible running filter`; card status/priority chips are asserted; `workbench-board-1440.png`. |
| PRs | pass | `pull requests mode loads repo PRs and calls detail review merge comment endpoints`. |
| Quick Create | pass | `quick create parses, creates accepted issues, and uses draft endpoints`. |
| Settings | pass | `renders settings mode with health and saves settings through APIs`; `workbench-settings-1440.png`. |
| Resize/collapse | pass | `resizes workbench columns, persists widths, and resets them`; `collapses instance sections and preserves collapse state across repo changes`. |
| Empty repository actions | pass | `empty repositories add action opens repo setup` covers `No tracked repositories` -> `Add repository` -> `/workbench/settings?repoSetup=1`. |

## APIs Exercised

The Workbench e2e suite exercises the aggregate API, deployment ensure/end APIs, issue detail and mutation APIs, launch API, worktree status/reset/cleanup APIs, repo add/update/delete/GitHub-list APIs, settings/health/user APIs, parse/create/draft APIs, PR list/detail/review/merge/comment APIs, and session preview rendering through seeded tmux output.

## Layout Acceptance

- 1440x1000, 1280x900, and 1100x850 viewports pass the responsive QA layout matrix.
- Top navigation stays one row; at 1100px all nav buttons remain visible and clickable.
- Any 768px or 390px checks are limited to compact header/control reachability and do not certify the Workbench body as mobile-ready.
- Focus pane does not overlap side panes in visible-side-pane modes.
- Visible desktop panes must fit within the viewport; the responsive QA assertion checks each visible pane's right edge at the supported desktop widths.
- Collapsed drawer restore controls must not overlap issue or terminal headers at `1440x1000` or `1100x850`.
- Screenshot capture must assert loaded route-specific content and no Workbench loading splash before writing artifacts.
- Settings, Issues, and Board modes collapse side panes.
- Board columns meet the minimum width assertions.
- No prototype mock-state controls render.

## Deviations

- `New named shell` remains unavailable in v1 by T020 decision.
- Issue and terminal focus are URL-addressable query states; deterministic e2e screenshots also cover those states.
- Empty-repository first-run coverage is enabled in the long Workbench spec.
- The long Workbench spec has one configured retry for a reproducible Playwright/Next dev-server navigation abort after a stale terminal boundary; the retried test passes and the command exits 0.
- `pnpm -C packages/web build` was not part of Task 16 verification and remains blocked by external `fonts.googleapis.com` DNS resolution plus the existing `next.config.ts` `serverActions` warning.
