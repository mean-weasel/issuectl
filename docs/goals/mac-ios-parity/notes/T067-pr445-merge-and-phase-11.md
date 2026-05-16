# T067 PR #445 Merge And Phase 11

Date: 2026-05-14

## Decision

Decision: `merge_ready`

Full outcome complete: `false`

## PR

- PR: https://github.com/mean-weasel/issuectl/pull/445
- Branch: `mac-parity-phase-10a-notification-copy`
- Base: `mac-sidebar-spaces-option-a`
- Head SHA: `22343f1fd74956dd89b358e57619607e6eaf7a75`
- Merge commit: `8cb5bda00aa8020bfceeb488b050433056e3669e`
- Merged at: `2026-05-14T22:53:40Z`

## Merge Gate

GitHub checks: no status checks reported for the PR branch.

Replacement validation accepted:

- `git diff --check`
- `pnpm typecheck`
- `pnpm lint` with existing warnings only
- `IssueCTLMacTests/MacIssueFilterStateTests`: 28 tests passed
- Focused notification unit/UI tests: 2 tests passed

## Acceptance Review

- Mac Settings exposes a Notifications section with clear iOS-only/deferred copy.
- Backend/platform follow-up is linked to issue #444.
- No Mac notification preference toggles are exposed.
- Unit projection coverage locks title, body, icon, issue reference, and accessibility text.
- UI coverage verifies Settings visibility and absence of notification toggles.

## Next Slice

Selected task: `T068`

Selected slice: Phase 11 Today Dashboard / Attention Surface decision gate.

Rationale: Phase 11 is broad enough to need a decision before implementation. A full Today clone risks a large PR, while a compact Mac-native attention surface may close the user workflow gap with a smaller vertical slice. The next task should decide the shape, first Worker scope, allowed files, and validation.
