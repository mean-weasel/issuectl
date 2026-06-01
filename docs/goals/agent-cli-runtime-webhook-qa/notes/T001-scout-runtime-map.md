# T001: Scout Runtime Map

Task: `T001`
Kind: `scout`
Status: `current`

## Summary

Webhook issue and PR launches already seed completion tokens, deployment IDs, repo IDs, target IDs, mutation budgets, and scrubbed credentials into the tmux-launched agent environment, but the generated instructions tell agents to run bare `issuectl agent ...`. Because webhook-launched agents run in target repo worktrees, not in the issuectl monorepo, bare `issuectl` is not deterministic and matches the observed `issuectl: command not found` failure. The coherent fix is to provide a deterministic `ISSUECTL_CLI` executable path and `ISSUECTL_SERVER_URL`, then update generated instructions and tests to use that command.

## Evidence

- `packages/core/src/launch/context.ts:78` builds the issue/PR agent control instructions and currently hard-codes `issuectl agent mutate` and `issuectl agent complete`.
- `packages/core/src/launch/launch-contexts.ts:110` builds agent environment variables only when a completion token exists. It currently includes `ISSUECTL_AGENT_TOKEN`, `ISSUECTL_DEPLOYMENT_ID`, `ISSUECTL_REPO_ID`, `ISSUECTL_TARGET_TYPE`, `ISSUECTL_TARGET_NUMBER`, and optional expected PR head metadata, but no CLI path or server URL.
- `packages/core/src/launch/launch.ts:208` passes `buildAgentEnvironment(...)` to both ttyd and PTY bridge launch paths.
- `packages/core/src/launch/tmux-session.ts:19` resets inherited npm/pnpm script environment, and `packages/core/src/launch/tmux-session.ts:53` exports only the explicit `extraEnv` keys into the tmux session.
- `packages/core/src/launch/tmux-session.ts:58` runs the agent after `cd` into the prepared target workspace, so the agent is not naturally in the issuectl source tree.
- `packages/cli/src/commands/agent.ts:27` registers the `issuectl agent complete` and `issuectl agent mutate` commands. The CLI defaults to `http://localhost:3847` unless `--server-url` is passed.
- `packages/cli/src/commands/web.ts:48` starts the web server as a child process and can pass deterministic env values into the server process.
- `packages/core/src/launch/context.test.ts:5` already checks that issue context includes agent controls.
- `packages/core/src/launch/launch-execute-precheck.test.ts:446` already checks webhook issue env, and `packages/core/src/launch/launch-execute-precheck.test.ts:265` already checks webhook PR env.
- `packages/core/src/launch/ttyd-spawn.test.ts:95` already checks that scrubbed webhook sessions remove ambient GitHub/SSH credentials while exporting allowed `extraEnv` values through tmux.

## Recommended Design

1. Set `ISSUECTL_CLI` in the web server environment when launched from `issuectl web`.
2. Set `ISSUECTL_SERVER_URL` to the active local server URL so non-default ports do not break agent check-ins.
3. Have core include `ISSUECTL_CLI` and `ISSUECTL_SERVER_URL` in webhook/comment-command `extraEnv` when a completion token exists, falling back to a sibling monorepo CLI dist path when the server was launched directly.
4. Update generated context to instruct agents to invoke `"$ISSUECTL_CLI" agent ...` when the environment is present and never print `ISSUECTL_AGENT_TOKEN`.
5. Update focused tests in core and CLI to prove env propagation and prompt text.

## Dirty Worktree Hazards

The worktree has unrelated dirty Apple/client files, prior webhook docs, web label-health files, and GitHub client changes from earlier work. This goal should only touch the runtime hardening files and the new GoalBuddy goal files unless a later Judge explicitly activates docs/QA updates.

## Board Receipt Snippet

```yaml
receipt:
  result: done
  note: notes/T001-scout-runtime-map.md
  summary: "Bare `issuectl` in generated agent controls is the fragile runtime gap; seed ISSUECTL_CLI/ISSUECTL_SERVER_URL into launched sessions and update instructions/tests."
  evidence:
    - "packages/core/src/launch/context.ts:78"
    - "packages/core/src/launch/launch-contexts.ts:110"
    - "packages/core/src/launch/launch.ts:208"
    - "packages/core/src/launch/tmux-session.ts:53"
    - "packages/cli/src/commands/web.ts:48"
    - "packages/cli/src/commands/agent.ts:27"
```
