# T004 Docs Receipt

## Result

Updated repeatable webhook QA documentation to include completed issue-session behavior.

## Changes

- `docs/workflows/webhook-label-manual-qa.md` now checks that completed issue sessions show on issue detail after agent completion, retained tmux sessions expose a read-only transcript, and a separate new launch remains available.
- `docs/workflows/webhook-qa-ladder.md` now includes completed issue-session history and completed terminal transcript proof in Rung 7 completion and cleanup proof.

## Verification

- `git diff --check -- packages/web/components/detail docs/workflows docs/goals/completed-issue-session-ux` passed.
