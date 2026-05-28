# Intake: Agent CLI Runtime And Webhook QA Completion

Task: `T001`
Kind: `scout`
Status: `current`

## Summary

This goal starts after the webhook health and manual QA workflow work. The next outcome is not another launch-only proof; it is a completion-capable webhook automation proof where spawned issue and PR agents can call the documented `issuectl agent` mutation/completion commands from their auto-launched environment and where the test tunnel/hook are shut down after QA.

## Existing Evidence To Preserve

- PR #536 merged stale webhook tunnel detection, webhook health surfacing in settings and label editors, and the GitHub client `_nc` cache-busting fix for webhook delivery APIs.
- Local verification for that work passed under Node 24.14.1:
  - `pnpm --dir packages/web test -- webhook-health route-rendering`
  - `pnpm --dir packages/web typecheck`
  - `pnpm --dir packages/web lint`
  - `pnpm --dir packages/core test -- github/client`
  - `pnpm --dir packages/core typecheck`
  - `pnpm --dir packages/core lint`
  - `pnpm turbo build`
- Manual QA passed for healthy webhook state and simulated stale webhook state, and the test repo webhook base URL was restored.
- Follow-up Markdown QA workflows were created for basic issue labels, PR auto-review, and full chained issue-to-PR webhook QA.
- Chrome extension backend was available and was used for live QA.
- Chrome-driven QA previously proved:
  - issue `mean-weasel/issuectl-test-repo-2#45` accepted `issuectl:auto-launch` through the UI,
  - webhook events included `issues.opened` and `issues.labeled`,
  - issue intent `78` launched a local deployment,
  - issue follow-up intent `79` resolved `skipped_optout`,
  - PR `mean-weasel/issuectl-test-repo-2#46` accepted `issuectl:auto-review` through the UI,
  - webhook events included `pull_request.opened` and `pull_request.labeled`,
  - PR intent `80` launched a local review deployment,
  - PR review row `14` was recorded,
  - PR follow-up intent `81` resolved `skipped_optout`.
- Cleanup from that QA closed the test issue/PR, deleted the temporary branch, disabled/restored the hook, stopped tunnel/server processes, and left zero active webhook deployments.

## Known Runtime Gap

The live QA surfaced that spawned agents may see `issuectl: command not found` when trying to follow the documented `issuectl agent mutate` or `issuectl agent complete` commands. This means the launch path can be healthy while the completion/reporting path is still fragile. The goal should fix the command availability at the launched-agent runtime layer and update instructions/tests so future agents use a deterministic command.

## Expected Design Direction

Scout and Judge should verify the exact local code before selecting the implementation, but the likely direction is:

- expose a deterministic command such as `ISSUECTL_CLI` to tmux-launched agents,
- resolve it to a workspace-owned command or absolute executable that does not depend on an interactive shell profile,
- update generated agent context to use that command for `agent mutate`, `agent complete`, and related reporting,
- test both the environment and the generated instruction text.

## Cleanup Policy

Webhook tunnels and GitHub hooks should be on only during active QA windows. Final QA receipts must include cleanup proof:

- hook disabled or restored to an inert URL,
- tunnel stopped,
- local server stopped if no longer needed,
- no active webhook deployments,
- no leftover automation labels on test targets unless intentionally documented,
- temporary test branch/issue/PR cleaned up when created solely for QA.
