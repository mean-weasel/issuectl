# Workbench Validation

Date: 2026-05-17

## Summary

Task 16 responsive QA is complete for production `/workbench`.

Named plain shells are intentionally unavailable in v1 per T020: the UI keeps the `Named shells 0` / `Named shells are not available yet` state and does not fake named shells as issue deployments.

## Commands

| Command | Status | Notes |
| --- | --- | --- |
| `pnpm --filter @issuectl/web typecheck` | pass | TypeScript passed. |
| `pnpm --filter @issuectl/web lint` | pass | 8 existing warnings: max-lines and two `any` warnings in existing files. |
| `pnpm --filter @issuectl/web test` | pass | 27 files, 255 tests. |
| `pnpm --filter @issuectl/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "responsive QA\\|captures workbench QA"` | pass | Targeted Task 16 QA tests passed. |
| `pnpm --filter @issuectl/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "empty repositories\\|checks worktree"` | pass | Isolated harness check passed before the empty-state test was skipped in the long suite. |
| `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium` | pass | 23 passed, 1 skipped. |
| `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium --trace=on` | pass | 23 passed, 1 skipped. |

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

The terminal and issue focus states are not URL-addressable in the current implementation, so their required screenshots are produced by the e2e screenshot test after selecting the fixture session/issue.

## Coverage Matrix

| Mockup state | Status | Evidence |
| --- | --- | --- |
| Initial terminal focus | pass | `shows sorted session previews and opens terminal focus`; `workbench-terminal-1440.png`; `workbench-terminal-1100.png`. |
| Issue detail focus | pass | `loads issue detail and calls issue mutation endpoints`; `workbench-issue-1440.png`. |
| Repo overview | pass | `selects repos, updates overview focus, and preserves selection across modes`. |
| Instance sorting | pass | `shows sorted session previews and opens terminal focus`. |
| Preview error state | pass | `Session #486` asserts `data-status="error"` and error text. |
| Issue queue filters | pass | `filters repo issues and links details and running sessions`. |
| Launch options/worktree | pass | `checks worktree status and launches an issue with selected context`. |
| Global Issues | pass | `shows global issues by repo and opens the selected repo issue`; side panes hidden. |
| Board | pass | `shows cross-repo board columns and reversible running filter`; `workbench-board-1440.png`. |
| PRs | pass | `pull requests mode loads repo PRs and calls detail review merge comment endpoints`. |
| Quick Create | pass | `quick create parses, creates accepted issues, and uses draft endpoints`. |
| Settings | pass | `renders settings mode with health and saves settings through APIs`; `workbench-settings-1440.png`. |
| Resize/collapse | pass | `resizes workbench columns, persists widths, and resets them`; `collapses instance sections and preserves collapse state across repo changes`. |
| Empty repository actions | deferred in full suite | The isolated grep run passed. The test is skipped in the long spec because repeated empty-state SSR navigations deadlock the dev server after many prior workbench navigations. |

## APIs Exercised

The Workbench e2e suite exercises the aggregate API, deployment ensure/end APIs, issue detail and mutation APIs, launch API, worktree status/reset/cleanup APIs, repo add/update/delete/GitHub-list APIs, settings/health/user APIs, parse/create/draft APIs, PR list/detail/review/merge/comment APIs, and session preview rendering through seeded tmux output.

## Layout Acceptance

- 1440x1000, 1280x900, and 1100x850 viewports pass the responsive QA layout matrix.
- Top navigation stays one row; at 1100px all nav buttons remain visible and clickable.
- Focus pane does not overlap side panes in visible-side-pane modes.
- Settings, Issues, and Board modes collapse side panes.
- Board columns meet the minimum width assertions.
- No prototype mock-state controls render.

## Deviations

- `New named shell` remains unavailable in v1 by T020 decision.
- Issue and terminal focus are selected UI states, not URL-addressable routes; deterministic e2e screenshots cover those states.
- One empty-repository action test is skipped in the long Playwright spec due a dev-server navigation deadlock, but its isolated grep run passed.
- `pnpm -C packages/web build` was not part of Task 16 verification and remains blocked by external `fonts.googleapis.com` DNS resolution plus the existing `next.config.ts` `serverActions` warning.
