# T003: Runtime Hardening

Task: `T003`
Kind: `worker`
Status: `current`

## Summary

Implemented deterministic issuectl agent command availability for webhook/comment-command sessions. `issuectl web` now passes `ISSUECTL_CLI` and `ISSUECTL_SERVER_URL` to the web server, core includes those values in completion-token launch environments, generated issue/PR context tells agents to use `"$ISSUECTL_CLI" agent ...`, and the CLI agent commands read `ISSUECTL_SERVER_URL` as their default daemon URL.

## Verification

- `source ~/.nvm/nvm.sh && nvm use 24.14.1 >/dev/null && pnpm --dir packages/core test -- context launch-execute-precheck ttyd-spawn` passed.
- `source ~/.nvm/nvm.sh && nvm use 24.14.1 >/dev/null && pnpm --dir packages/cli test -- agent web` passed.
- `source ~/.nvm/nvm.sh && nvm use 24.14.1 >/dev/null && pnpm --dir packages/core typecheck` passed.
- `source ~/.nvm/nvm.sh && nvm use 24.14.1 >/dev/null && pnpm --dir packages/cli typecheck` passed.
- Extra sanity checks:
  - `source ~/.nvm/nvm.sh && nvm use 24.14.1 >/dev/null && pnpm --dir packages/core lint` passed.
  - `source ~/.nvm/nvm.sh && nvm use 24.14.1 >/dev/null && pnpm --dir packages/cli lint` passed.

An initial core test attempt under Node 22.22.3 failed before exercising this patch because `better-sqlite3` was built for Node ABI 137; rerunning under the expected Node 24.14.1 passed.

## Board Receipt Snippet

```yaml
receipt:
  result: done
  summary: "Seeded ISSUECTL_CLI/ISSUECTL_SERVER_URL into launched agent sessions and updated generated controls/tests."
  changed_files:
    - "packages/cli/src/commands/web.ts"
    - "packages/cli/src/commands/web.test.ts"
    - "packages/cli/src/commands/agent.ts"
    - "packages/cli/src/commands/agent.test.ts"
    - "packages/core/src/launch/context.ts"
    - "packages/core/src/launch/context.test.ts"
    - "packages/core/src/launch/launch-contexts.ts"
    - "packages/core/src/launch/launch-execute-precheck.test.ts"
    - "packages/core/src/launch/ttyd-spawn.test.ts"
    - "docs/goals/agent-cli-runtime-webhook-qa/state.yaml"
    - "docs/goals/agent-cli-runtime-webhook-qa/notes/T003-runtime-hardening.md"
  commands:
    - command: "pnpm --dir packages/core test -- context launch-execute-precheck ttyd-spawn"
      status: pass
    - command: "pnpm --dir packages/cli test -- agent web"
      status: pass
    - command: "pnpm --dir packages/core typecheck"
      status: pass
    - command: "pnpm --dir packages/cli typecheck"
      status: pass
  note: notes/T003-runtime-hardening.md
```
