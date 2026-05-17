# T008 Terminal Focus

Result: done

Summary: Terminal focus was implemented as part of the T007 vertical slice because reconnect success and session selection both needed a real center terminal surface. Selecting an issue session now replaces the repo overview with `TerminalFocus`, showing session metadata and an iframe pointing at `/api/terminal/[port]`.

Changed files:
- `packages/web/components/workbench/TerminalFocus.tsx`
- `packages/web/e2e/workbench.spec.ts`

Acceptance evidence:
- Playwright test `shows sorted session previews and opens terminal focus` selects `Session #447` and asserts `iframe[title="Terminal for issue 447"]` has `src` ending in `/api/terminal/7701`.
- Playwright test `reconnects a session through the deployment endpoint` asserts reconnecting `#486` updates focus to `/api/terminal/7799`.

Verification:
- `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium` passed, 12 tests.
- `pnpm --filter @issuectl/web typecheck` passed.

Remaining blockers: none for this task.

Full outcome complete: false

Next task: T009
