# T026 Responsive Desktop QA Receipt

Status: done
Date: 2026-05-17

## Summary

Implemented Task 16 responsive desktop QA for `/workbench`: Playwright now covers the desktop viewport matrix, high-DPI screenshot capture, side-pane collapse modes, board column sizing, and horizontal overflow checks. The QA report records the coverage matrix, CLI screenshot pass, screenshot artifacts, API surfaces exercised, known deviations, and named-shell v1 status.

The QA pass found a real 1100px top-nav overflow. Fixed it in `WorkbenchShell.module.css` by tightening the top bar below 1160px and hiding lower-priority labels/actions so the nav remains one row and clickable.

## Changed Files

- `packages/web/e2e/workbench.spec.ts`
- `packages/web/components/workbench/WorkbenchShell.module.css`
- `docs/qa/workbench-validation.md`
- `docs/qa/workbench-artifacts/workbench-terminal-1440.png`
- `docs/qa/workbench-artifacts/workbench-issue-1440.png`
- `docs/qa/workbench-artifacts/workbench-settings-1440.png`
- `docs/qa/workbench-artifacts/workbench-board-1440.png`
- `docs/qa/workbench-artifacts/workbench-terminal-1100.png`
- `docs/qa/workbench-artifacts/cli-workbench-overview-1440.png`
- `docs/qa/workbench-artifacts/cli-workbench-settings-1440.png`
- `docs/qa/workbench-artifacts/cli-workbench-board-1440.png`
- `docs/qa/workbench-artifacts/cli-workbench-overview-1100.png`

## Verification

- Passed: `pnpm --filter @issuectl/web typecheck`
- Passed: `pnpm --filter @issuectl/web lint`
  - Existing warnings remain in unrelated max-lines/no-explicit-any files.
- Passed: `pnpm --filter @issuectl/web test`
  - 27 files, 255 tests.
- Passed: `pnpm --filter @issuectl/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "responsive QA|captures workbench QA"`
- Passed: `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium`
  - 23 passed, 1 skipped.
- Passed: `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium --trace=on`
  - 23 passed, 1 skipped.
- Passed: Playwright CLI screenshot pass for `/workbench`, `/workbench/settings`, `/workbench/board`, and `/workbench` at 1100px.
- Passed: `~/.codex/skills/codex-review/scripts/codex-review --full-access`
  - No accepted/actionable findings.

## Caveats

- Named plain shells remain intentionally unavailable for v1 per T020. The QA report records `Named shells 0` and the disabled v1 status.
- The empty-repository setup action test passed in an isolated grep run but is skipped in the long full spec because repeated empty-state navigation can deadlock the Next dev server. The skip is documented in the QA report as a follow-up test-harness issue, not a product acceptance gap.
- `pnpm --dir packages/web build` remains blocked outside T026 by the known `next.config.ts` `serverActions` warning and external `fonts.googleapis.com` DNS failure.

Next task: T027.
