# T040 Next Slice Decision

## Decision

Approved the next worker slice as Phase 7B: Mac PR detail actions.

## Rationale

Phase 7A landed read-only PR browse/detail. The largest safe next slice is to add the shared mutating PR actions from the Mac detail surface:

- Comment on PR.
- Approve PR.
- Request changes with a required body.
- Merge using merge, squash, or rebase.

This keeps the work in one existing Mac PR detail surface and uses shared API methods that already exist. It excludes list-row/swipe merge actions and linked issue navigation so the next PR remains bounded.

## Branch Plan

- Integration branch: `mac-sidebar-spaces-option-a`
- Worker branch: `mac-parity-phase-7b-pr-actions`
- PR base: `mac-sidebar-spaces-option-a`

## Verification Focus

- Mac unit tests for action request state and failure preservation if helper state is introduced.
- Mac UI tests for comment, approve, request changes, merge method selection, success refresh, and failure preserving typed text.
- Deterministic fixture endpoints for PR comment, review, and merge routes.
- Existing local validation and PR/check receipt workflow.
