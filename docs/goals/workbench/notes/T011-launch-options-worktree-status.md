# T011 Launch Options and Worktree Status

Result: done

Summary: Added launch and worktree controls to the workbench issue focus. The focus reuses existing launch form pieces for agent, workspace, branch, context, and preamble controls; checks worktree status; supports reset/cleanup; handles duplicate launch errors; and adds/selects the launched session on success.

Changed files:
- `packages/web/components/workbench/IssueFocus.tsx`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/components/workbench/workbench-api.ts`
- `packages/web/e2e/workbench.spec.ts`
- `docs/goals/workbench/state.yaml`

Acceptance evidence:
- Playwright asserts agent options `Codex` and `Claude Code`, workspace options `Existing repo`, `Git worktree`, and `Fresh clone`, and default branch `issue-512-desktop-instance-manager-workbench`.
- Playwright asserts `GET /api/v1/worktrees/status?owner=mean-weasel&repo=issuectl&issueNumber=512`, dirty warning, `POST /api/v1/worktrees/reset`, and `POST /api/v1/worktrees/cleanup`.
- Playwright asserts exact launch body except nonce value: `agent: codex`, `branchName: issue-512-desktop-instance-manager-workbench`, `workspaceMode: worktree`, `selectedCommentIndices: [0]`, `selectedFilePaths: ["packages/web/app/workbench/page.tsx"]`, `preamble: "Investigate workbench implementation"`, `forceResume: false`, and valid `idempotencyKey`.
- Playwright asserts duplicate `409 already in progress` does not create a `#512` session row, then success with deployment `409` and port `7790` adds `Session #512` and selects terminal focus `/api/terminal/7790`.

Verification:
- `pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium` passed, 15 tests.
- `pnpm --filter @issuectl/web test -- components/workbench/workbench.test.ts` passed, 6 tests.
- `pnpm --filter @issuectl/web typecheck` passed.
- `pnpm --filter @issuectl/web lint` passed with the existing 6 unrelated warnings.

Remaining blockers: none for this task.

Full outcome complete: false

Next task: T012
