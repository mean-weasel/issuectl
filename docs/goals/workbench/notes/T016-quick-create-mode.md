# T016 Quick Create Mode

Result: done

Implemented `/workbench/quick-create` as a real workbench surface.

## Changed Files

- `packages/web/components/workbench/QuickCreateFocus.tsx`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/e2e/workbench.spec.ts`

## Summary

Added a focused Quick Create flow with parse input, candidate issue cards, accept/reject toggles, destination repo selection defaulting to the selected repo, accepted issue creation, result display, and draft fallback actions for save, update, and assign. The top nav now renders this surface at `/workbench/quick-create`.

## Verification

Passed:

```sh
pnpm --filter @issuectl/web typecheck
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium
```

Playwright result: 20 tests passed on `desktop-chromium`.

## Acceptance Evidence

- `Quick Create` top nav opens `/workbench/quick-create`.
- `POST /api/v1/parse` receives `{ "input": "Fix login timeout and add workbench keyboard shortcuts" }`.
- Parsed candidates render as accepted cards and can be rejected.
- Destination repo defaults to `mean-weasel/issuectl`.
- `POST /api/v1/parse/create` sends both candidates with `owner`, `repo`, and `accepted` flags.
- Create result renders `1 created, 0 drafted, 0 failed` and issue `#901`.
- `POST /api/v1/drafts` saves draft title/body/priority.
- `PATCH /api/v1/drafts/[id]` updates draft title/body/priority.
- `POST /api/v1/drafts/[id]/assign` assigns to selected repo id with parsed labels.

Full outcome complete: false.

Next task: T017.
