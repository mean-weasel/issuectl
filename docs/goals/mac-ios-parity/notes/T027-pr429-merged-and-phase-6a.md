# T027 PR 429 Merged And Phase 6A

## Decision

`merge_ready`.

PR #429 satisfied the Phase 5C acceptance map for Mac issue-detail markdown image presentation and lightbox behavior. GitHub reported no combined statuses and no workflow runs for head `25ebe446adaed58e65b6c7aa0bd2160492ed964e`, so the documented local validation set was accepted as the replacement merge gate.

## PR Status

- PR: https://github.com/mean-weasel/issuectl/pull/429
- Branch: `mac-parity-phase-5c-markdown-lightbox`
- Base: `mac-sidebar-spaces-option-a`
- Head SHA: `25ebe446adaed58e65b6c7aa0bd2160492ed964e`
- Merge commit: `dacf3fdd1a08b9337bf1b7e9224ba0d555aa64fa`
- Merged at: `2026-05-14T17:33:15Z`
- Checks: no configured checks reported

## Accepted Replacement Validation

- `git diff --check`: pass
- Mac build: pass
- `IssueCTLMacUITests/MacSidebarSmokeTests`: pass, 11 tests
- `IssueCTLMacTests`: pass, 29 tests
- `IssueCTLTests/APIClientExtensionTests`: pass, 37 tests
- `pnpm typecheck`: pass
- `pnpm lint`: pass with existing warnings
- Focused markdown/lightbox UI retest: pass

## Acceptance Coverage

- Issue body image markdown renders as a visually identifiable image attachment and opens a loaded-image lightbox.
- Comment image markdown renders as a visually identifiable image attachment.
- Broken image URLs open a recoverable lightbox error state and can be dismissed.
- Existing Phase 5A/5B detail actions remained covered by the full Mac smoke suite.

## Next Slice

Phase 6 should start with the existing Mac draft surface: assign an existing local draft to a tracked repo with label selection, refresh issues/drafts after success, and cover failure-preserves-input behavior. Keep direct quick create, image attachment insertion, and AI parse/batch-create as later Phase 6 slices unless this first draft-assignment slice exposes a small reusable component.
