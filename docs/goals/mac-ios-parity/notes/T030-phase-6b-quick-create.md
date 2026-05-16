# T030 Phase 6B Quick Create

## Result

`done`.

Implemented direct Mac issue creation from the Drafts sidebar surface on PR #431.

## PR

- PR: https://github.com/mean-weasel/issuectl/pull/431
- Branch: `mac-parity-phase-6b-quick-create`
- Base: `mac-sidebar-spaces-option-a`

## Changes

- Added a Mac "New Issue" flow that creates a draft through the shared API and immediately assigns it to the selected tracked repository, so the user does not first manage a visible draft.
- Added repo, title, body, priority, and multi-label controls to the direct create sheet.
- Added label loading for the selected repo and preservation of form state when creation fails.
- Refreshed sidebar data after successful creation so the created issue is visible in the issue list.
- Extended the Mac UI fixture with successful and failed quick-create responses.
- Added UI tests for successful label-backed quick create and recoverable failure preservation.

## Acceptance Coverage

- Direct creation without first creating or assigning a visible draft: covered by `testQuickCreateIssueWithLabelsRefreshesIssues`.
- Tracked repo, title/body, priority, and label entry: covered by the quick-create UI flow and fixture label endpoint.
- Successful creation refreshes issues and shows the created issue: covered by created issue `org/alpha#89` appearing after create.
- Creation failure is recoverable and preserves input/selection: covered by `testQuickCreateFailurePreservesInput`.
- Existing draft create/edit/delete and assignment behavior remains covered by the full `MacSidebarSmokeTests` suite.

## Validation

- `git diff --check`: pass
- Mac build: pass
- Focused quick-create UI tests: pass, 2 tests
- Full `MacSidebarSmokeTests`: pass, 15 tests
- `IssueCTLMacTests`: pass, 29 tests
- `IssueCTLTests/APIClientExtensionTests`: pass, 37 tests
- `pnpm typecheck`: pass
- `pnpm lint`: pass with existing warnings

## Notes

This slice intentionally uses the existing shared draft-create plus assign API contract under a direct Mac UI. Image upload and AI parse/batch creation remain separate Phase 6 slices.
