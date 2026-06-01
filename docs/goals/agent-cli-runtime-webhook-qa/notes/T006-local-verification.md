# T006: Local Verification

Task: `T006`
Kind: `worker`
Status: `current`

## Summary

Ran the local verification suite for the runtime hardening and focused docs changes under Node 24.14.1. Core launch behavior, GitHub client behavior, CLI agent/web helpers, package typechecks, and package lints all passed.

## Commands

- `pnpm --dir packages/core test -- launch` passed: 16 files, 179 tests.
- `pnpm --dir packages/core test -- github/client` passed: 1 file, 9 tests.
- `pnpm --dir packages/cli test -- agent web` passed: 5 files, 29 tests.
- `pnpm --dir packages/core typecheck` passed.
- `pnpm --dir packages/cli typecheck` passed.
- `pnpm --dir packages/core lint` passed.
- `pnpm --dir packages/cli lint` passed.

All commands were run through `nvm use 24.14.1`.

## Board Receipt Snippet

```yaml
receipt:
  result: done
  summary: "Node 24 local verification passed for core launch/GitHub client and CLI agent/web surfaces."
  changed_files:
    - "docs/goals/agent-cli-runtime-webhook-qa/state.yaml"
    - "docs/goals/agent-cli-runtime-webhook-qa/notes/T006-local-verification.md"
  commands:
    - command: "pnpm --dir packages/core test -- launch"
      status: pass
    - command: "pnpm --dir packages/core test -- github/client"
      status: pass
    - command: "pnpm --dir packages/cli test -- agent web"
      status: pass
    - command: "pnpm --dir packages/core typecheck"
      status: pass
    - command: "pnpm --dir packages/cli typecheck"
      status: pass
    - command: "pnpm --dir packages/core lint"
      status: pass
    - command: "pnpm --dir packages/cli lint"
      status: pass
  note: notes/T006-local-verification.md
```
