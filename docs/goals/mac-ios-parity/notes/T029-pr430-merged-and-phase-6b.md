# T029 PR 430 Merged And Phase 6B

## Result

`done`.

PR #430 was marked ready and squash-merged into `mac-sidebar-spaces-option-a`.

## Decision

`merge_ready`.

## PR

- PR: https://github.com/mean-weasel/issuectl/pull/430
- Branch: `mac-parity-phase-6a-draft-assignment`
- Base: `mac-sidebar-spaces-option-a`
- Head SHA: `1b911fd1eef94053a48c85585e706f3e1f2ddb1b`
- Merge commit: `d41698432a846bdffbcb712d37d5bfbf072775ab`
- Merged at: `2026-05-14T17:51:25Z`

## Acceptance Coverage

- Existing local draft assignment to one tracked repo: covered by `testDraftAssignsToRepoWithLabelsAndRefreshesIssues`.
- Repo label loading and selected label submission: covered by the fixture labels endpoint and the successful assignment UI test.
- Successful refresh of drafts/issues: covered by the draft Assign button disappearing and created issue #88 appearing in the issue list.
- Recoverable assignment failure preserving choices: covered by `testDraftAssignmentFailurePreservesChoices`.
- Existing sidebar/draft/detail/settings workflows: covered by the full `MacSidebarSmokeTests` suite.

## CI / Gate

GitHub reported no status checks or workflow runs for the branch. The accepted replacement gate is the local validation recorded in T028:

- `git diff --check`: pass
- Mac build: pass
- `IssueCTLMacTests`: pass, 29 tests
- Focused draft assignment UI tests: pass, 2 tests
- Full `MacSidebarSmokeTests`: pass, 13 tests
- `IssueCTLTests/APIClientExtensionTests`: pass, 37 tests
- `pnpm typecheck`: pass
- `pnpm lint`: pass with existing warnings

## Next Slice

Activate Phase 6B: direct Mac quick issue creation from the sidebar. Keep this PR focused on creating an issue without first creating a draft, with repo/label/priority inputs, failure preservation, issue/draft refresh, and UI coverage. Leave image upload and AI parse/batch create to later Phase 6 slices.
