# T027 PR Batch: workbench-layout-qa

Result: done

Prepared the local PR batch for Tasks 14 and 16 on branch `workbench-aggregate-and-shell`.

No GitHub PR was opened, CI was not run, and no merge was attempted because the GoalBuddy board remains local uncommitted work accumulated across the `/workbench` implementation slices. The branch is ready for a final audit before deciding whether to commit/push as one PR or split into smaller PRs.

## Scope

- Task 14: width adjustability and collapsible sections.
- Task 16: responsive desktop QA, Playwright coverage matrix, CLI screenshots, and QA report.
- Named shells: explicitly disabled for v1 by T020; no named-shell PR batch exists.

## Review

Required review workflow used: `superpowers:requesting-code-review`.

Final review command:

```sh
~/.codex/skills/codex-review/scripts/codex-review --full-access
```

Result: clean. The review reported no accepted/actionable findings.

Review caveats:

- The review runner could not bind a nested Next dev server for its own unscoped e2e attempt (`listen EPERM`), but the scoped Playwright commands passed in the PM thread.
- `pnpm --dir packages/web build` remains blocked by the known `next.config.ts` `serverActions` warning and external `fonts.googleapis.com` DNS failure.

## Verification

Passed:

```sh
pnpm --filter @issuectl/web typecheck
pnpm --filter @issuectl/web lint
pnpm --filter @issuectl/web test
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium --trace=on
```

Also passed:

- Focused responsive QA Playwright grep for the viewport matrix and screenshot capture.
- Playwright CLI screenshots for `/workbench`, `/workbench/settings`, `/workbench/board`, and 1100px `/workbench`.

## Playwright Coverage Rows

- Desktop viewport matrix: 1440x1000, 1280x900, and 1100x850.
- Top nav remains one row and clickable at each tested width.
- Workbench, Issues, Settings, and Board modes do not introduce horizontal document overflow.
- Board columns keep usable minimum widths at 1440px and 1100px.
- High-DPI screenshots are captured for terminal, issue detail, settings, board, and 1100px terminal states.
- CLI screenshots provide independent browser artifact coverage for overview, settings, board, and 1100px overview routes.

## PR / CI / Merge

- Branch: `workbench-aggregate-and-shell`.
- PR: not opened.
- CI: not run.
- Merge: not attempted.
- Follow-up decision: run T029 final audit, then decide whether to commit/push one accumulated branch or split the local changes into smaller PRs.

Full outcome complete: false.

Next task: T029.
