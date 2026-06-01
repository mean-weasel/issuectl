# T002: Judge Runtime Design

Task: `T002`
Kind: `judge`
Status: `current`

## Decision

Use explicit launch environment and generated instructions. The Worker should make `ISSUECTL_CLI` and `ISSUECTL_SERVER_URL` available to webhook/comment-command sessions, update issue/PR agent control instructions to use the deterministic CLI variable, and add focused tests. This is the largest safe useful slice because the env and prompt text are one behavior: agents need both the command and the instruction to use it.

## Approved Worker Slice

Objective:

Implement deterministic issuectl agent command availability for auto-launched issue and PR agents.

Allowed files:

- `packages/cli/src/commands/web.ts`
- `packages/cli/src/commands/web.test.ts`
- `packages/cli/src/commands/agent.ts`
- `packages/cli/src/commands/agent.test.ts`
- `packages/core/src/launch/context.ts`
- `packages/core/src/launch/context.test.ts`
- `packages/core/src/launch/launch-contexts.ts`
- `packages/core/src/launch/launch-execute-precheck.test.ts`
- `packages/core/src/launch/ttyd-spawn.test.ts`
- `docs/goals/agent-cli-runtime-webhook-qa/state.yaml`
- `docs/goals/agent-cli-runtime-webhook-qa/notes/**`

Verify:

- `pnpm --dir packages/core test -- context launch-execute-precheck ttyd-spawn`
- `pnpm --dir packages/cli test -- agent web`
- `pnpm --dir packages/core typecheck`
- `pnpm --dir packages/cli typecheck`

Stop if:

- A required implementation file is outside the approved allowlist.
- The CLI path cannot be made executable without relying on interactive shell profile PATH.
- The change would expose `ISSUECTL_AGENT_TOKEN` in prompt text or logs.
- Focused verification fails twice for the same root cause.

## Deferred Items

QA Markdown updates are deferred to T004/T005. If the runbooks already describe deterministic command evidence and cleanup after this implementation, T005 should be skipped; otherwise it should update only the approved workflow docs.

## Board Receipt Snippet

```yaml
receipt:
  result: done
  decision: "Use explicit ISSUECTL_CLI/ISSUECTL_SERVER_URL launch env plus generated instruction updates."
  note: notes/T002-judge-runtime-design.md
  summary: "Activate T003 to implement deterministic CLI env/context and focused tests."
```
