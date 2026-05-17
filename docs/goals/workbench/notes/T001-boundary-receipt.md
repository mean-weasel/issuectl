# T001 Boundary Receipt

## Summary

Validated the current repository boundary against `docs/superpowers/plans/2026-05-16-workbench.md` and `docs/mockups/workbench.html`.

The plan is broadly aligned with current APIs and reusable components, but there is one material execution drift before Worker tasks begin: Playwright specs currently live under `packages/web/e2e`, while the plan and board repeatedly reference `packages/web/tests/workbench.spec.ts`. The current Playwright project name is `desktop-chromium`, not `chromium`.

## Evidence

Plan anchors verified:

- `docs/superpowers/plans/2026-05-16-workbench.md:80` defines the shared fixture contract.
- `docs/superpowers/plans/2026-05-16-workbench.md:114` defines the traceability matrix.
- `docs/superpowers/plans/2026-05-16-workbench.md:151` defines Playwright E2E and CLI coverage.
- `docs/superpowers/plans/2026-05-16-workbench.md:270` begins Task 1, Workbench Aggregate API.
- `docs/superpowers/plans/2026-05-16-workbench.md:1263` begins GoalBuddy Execution Board.

Mockup anchors verified:

- `docs/mockups/workbench.html:1380` `renderRepoRail`
- `docs/mockups/workbench.html:1396` `renderInstances`
- `docs/mockups/workbench.html:1484` `renderIssues`
- `docs/mockups/workbench.html:1515` `renderFocus`
- `docs/mockups/workbench.html:1687` `renderRepoSetup`
- `docs/mockups/workbench.html:1730` `renderQuickCreate`
- `docs/mockups/workbench.html:1772` `renderSettings`
- `docs/mockups/workbench.html:1809` `renderGlobalIssues`
- `docs/mockups/workbench.html:1834` `renderIssueBoard`
- `docs/mockups/workbench.html:1895` `renderPullRequests`
- `docs/mockups/workbench.html:1923` `renderShellFlow`

Current API routes present:

- Repos/settings/user/health: `packages/web/app/api/v1/repos/route.ts`, `repos/[owner]/[repo]/route.ts`, `repos/github/route.ts`, `settings/route.ts`, `user/route.ts`, `health/route.ts`.
- Issues/actions: `issues/[owner]/[repo]/route.ts`, `issues/[owner]/[repo]/[number]/route.ts`, `comments/route.ts`, `state/route.ts`, `labels/route.ts`, `assignees/route.ts`, `priority/route.ts`, `priorities/route.ts`, `reassign/route.ts`.
- Launch/deployments/terminal support: `launch/[owner]/[repo]/[number]/route.ts`, `deployments/route.ts`, `deployments/[id]/ensure-ttyd/route.ts`, `deployments/[id]/end/route.ts`, `sessions/previews/route.ts`.
- Worktrees: `worktrees/route.ts`, `worktrees/status/route.ts`, `worktrees/reset/route.ts`, `worktrees/cleanup/route.ts`.
- Parse/drafts/images: `parse/route.ts`, `parse/create/route.ts`, `drafts/route.ts`, `drafts/[id]/route.ts`, `drafts/[id]/assign/route.ts`, `images/upload/route.ts`.
- PRs: `pulls/[owner]/[repo]/route.ts`, `pulls/[owner]/[repo]/[number]/route.ts`, `review/route.ts`, `merge/route.ts`, `comments/route.ts`.

Current API routes absent as expected:

- No `packages/web/app/api/v1/workbench/route.ts`.
- No `packages/web/app/api/v1/shells/...` routes.

Current `/workbench` UI files absent as expected:

- No `packages/web/app/workbench`.
- No `packages/web/components/workbench`.

Reusable components present:

- Terminal: `packages/web/components/terminal/TerminalPanel.tsx`, `OpenTerminalButton.tsx`.
- Launch: `packages/web/components/launch/LaunchModal.tsx`, `AgentSelector.tsx`, `WorkspaceModeSelector.tsx`, `BranchInput.tsx`, `ContextToggles.tsx`, `DirtyWorktreeBanner.tsx`, `FileSelector.tsx`, `PreambleInput.tsx`, `EndSessionButton.tsx`.
- Detail/issue: `packages/web/components/detail/IssueDetail.tsx`, `IssueDetailContent.tsx`, `EditableTitle.tsx`, `EditableBody.tsx`, `CommentComposer.tsx`, `PriorityPicker.tsx`, `IssueReassignSheet.tsx`; `packages/web/components/issue/DeploymentTimeline.tsx`, `LabelManager.tsx`, `ReferencedFiles.tsx`.
- Parse: `packages/web/components/parse/ParseFlow.tsx`, `ParseInput.tsx`, `ParseResults.tsx`, `ParseReview.tsx`.
- Settings: `packages/web/components/settings/SettingsForm.tsx`, `TrackedRepos.tsx`, `RepoPicker.tsx`, `RepoRow.tsx`, `WorktreeCleanup.tsx`, `AuthStatus.tsx`.
- PR: `packages/web/components/detail/PrDetail.tsx`, `ReviewPanel.tsx`, `MergeButton.tsx`; `packages/web/components/pr/*`.

Core/schema evidence:

- `packages/core/src/db/schema.ts` schema version is `14`.
- `deployments.issue_number` is `NOT NULL`, confirming named plain shells remain unsupported by current deployment schema.
- `packages/core/src/types.ts` `Deployment` requires `issueNumber`, confirming Task 15 needs a separate schema/API decision.

Test/verification drift:

- `packages/web/playwright.config.ts` has `testDir: "./e2e"`.
- Existing e2e specs live under `packages/web/e2e/*.spec.ts`.
- `packages/web/tests` does not exist.
- Current Playwright projects are `desktop-chromium` and `mobile-chromium`; the plan's commands use `--project=chromium`.

## Drift and Recommendations for T002 Judge

1. Revise planned e2e file paths from `packages/web/tests/workbench.spec.ts` to `packages/web/e2e/workbench.spec.ts`, unless the Judge intentionally approves adding a new `packages/web/tests` directory and updating Playwright config.
2. Revise Playwright commands from `--project=chromium` to `--project=desktop-chromium`, unless the Judge approves changing Playwright project names.
3. Keep named plain shells behind the planned Judge gate. Current schema/API evidence confirms they are not feasible without Task 15.
4. Task 1 can proceed after the e2e path/project-name decision because no aggregate workbench API currently exists and the plan's existing API dependencies are present.
