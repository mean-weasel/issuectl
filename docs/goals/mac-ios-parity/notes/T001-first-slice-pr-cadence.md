# T001 Judge Receipt: First Slice And PR Cadence

## Decision

Approved. The parity plan is suitable for execution as written, and Phase 1, Native Mac Repository Management, is the correct first implementation slice.

## Evidence

- `docs/specs/2026-05-14-mac-ios-parity-plan.md` identifies repository management as Phase 1 and explicitly says it blocks first-run usefulness and sidebar filtering.
- Current branch is `mac-sidebar-spaces-option-a`, pushed to `origin/mac-sidebar-spaces-option-a`.
- Current PR is `#422`, draft, head `mac-sidebar-spaces-option-a`, base `mac-sidebar-display-state`, merge state clean, no status checks in rollup.
- `apple/IssueCTLMac/Views/MacSettingsView.swift` currently says tracked repositories are managed in web settings and only exposes `Open Web Settings`.
- iOS already has usable references in `SettingsView.swift`, `AddRepoSheet.swift`, and `EditRepoSheet.swift`.
- Shared API support already exists in `APIClient+Settings.swift` for list, add, browse, update, and remove repo operations.

## PR Cadence

- Treat `mac-sidebar-spaces-option-a` / PR `#422` as the current experimental integration branch for this Mac sidebar parity stream.
- Create the first implementation branch from `mac-sidebar-spaces-option-a`, named `mac-parity-phase-1-repos`.
- Open a draft PR from `mac-parity-phase-1-repos` into `mac-sidebar-spaces-option-a` early, before large product edits.
- Copy Phase 1 acceptance criteria into the PR body.
- Keep subsequent parity slices as separate child PRs into the active integration branch until that branch is merged upstream.
- After each child PR merge, rebase or recreate the next branch from the updated integration branch.

## CI And Merge Gates

- Before marking a child PR ready, run the relevant local validation from the parity plan.
- Monitor PR checks with `gh pr checks <number> --watch` when checks exist.
- If GitHub reports no checks configured, record that explicitly and rely on local validation plus dogfood evidence.
- Do not merge a child PR with red CI.
- If macOS UI automation is unstable, record the failure mode and add deterministic replacement evidence plus a narrower UI test where feasible.
- A child PR can merge only after the task receipt records PR URL, local validation commands, CI state, acceptance criteria coverage, and any dogfood note.

## First Worker Slice

Implement native Mac repository management:

- Replace the placeholder Repositories section in `MacSettingsView`.
- Add tracked repo list with path/branch/default indicators where model data exists.
- Add Mac add/edit/remove flows using shared repo APIs.
- Keep `Open Web Settings` as fallback.
- Refresh `MacSidebarStore` and reconcile per-Desktop repo filters after mutations.
- Add focused Mac tests for form normalization/state and stale filter cleanup.
- Add UI accessibility identifiers for settings, add/edit/remove, browse, and error states.

## Stop Conditions

Stop and return to Judge/PM if:

- Implementation requires backend endpoint changes.
- The Xcode project requires broad target/project restructuring.
- The child PR base cannot be created or pushed.
- Local validation fails twice for the same unexplained reason.
- UI test automation hangs in the existing status-menu path and no deterministic replacement can be added.
