# issuectl Agent Instructions

This repository is a pnpm/Turborepo monorepo for the issuectl dashboard, CLI, core library, and Apple clients. Follow the project conventions in `CLAUDE.md`; this file exists as the repo-level Codex `/init` instructions entry point.

## Diagnostics-first debugging

When debugging launch, terminal, ttyd, tmux, session, or workbench failures, check the diagnostics journal before digging through raw web logs. The journal records structured launch lifecycle events in `~/.issuectl/issuectl.db`.

Use the CLI through the workspace package:

```bash
pnpm --dir packages/cli exec issuectl diag list --limit 50
pnpm --dir packages/cli exec issuectl diag show --deployment <deployment-id>
pnpm --dir packages/cli exec issuectl diag tail --issue <owner>/<repo>#<issue-number>
pnpm --dir packages/cli exec issuectl diag show --issue <owner>/<repo>#<issue-number>
```

For a failed launch, start with `diag show --deployment <id>` when the UI or API returned a deployment ID. If no deployment ID is available, use `diag list --limit 50` and look for the newest launch lifecycle events.

Important events:

- `launch.requested` means the launch request reached core.
- `workspace.prepared` means checkout/clone/worktree setup completed.
- `deployment.recorded` means a pending deployment row was created.
- `ttyd.spawned` means ttyd was spawned and initially alive.
- `deployment.activated` means the deployment became visible to the UI.
- `launch.spawn_failed` means ttyd or tmux setup failed before activation.
- `launch.activation_failed` means the terminal opened but the DB row could not be activated.
- `reconcile.tmux_missing` or `liveness.tmux_missing` means the tmux session was missing and the deployment was marked ended.
- `ensure_ttyd.failed` means the UI could not attach or respawn ttyd for an active deployment.

Read diagnostics from top to bottom and identify the first failure or impossible transition. For example, `ttyd.spawned` followed immediately by `reconcile.tmux_missing` means the launch API got past ttyd spawn and DB activation, but the tmux session disappeared before the UI could attach.

Raw web logs are still useful after diagnostics identify the failure area:

```bash
tail -f ~/.issuectl/logs/web.log
cat ~/.issuectl/logs/web.log | jq 'select(.level >= 50)'
```

## Acceptance evidence

Do not finish agent work with only a generic "tests pass" claim. Before handing
off, identify the top realistic failure modes for the changed surface and collect
evidence that would have exposed those failures.

Prefer the smallest proof that exercises the real contract:

- Core, CLI, or data changes: run focused package tests plus typecheck/lint for
  the touched package.
- Launch, terminal, ttyd, tmux, session, or workbench changes: include
  diagnostics journal evidence from `issuectl diag ...`; use web logs only after
  diagnostics identify the failure area.
- Web UI changes: use Playwright CLI checks for the affected flow and viewport.
  Follow `CLAUDE.md`: do not use browser MCP or the Claude Chrome extension for
  UI verification.
- Webhook automation changes: use the smallest applicable rung from
  `docs/workflows/webhook-qa-ladder.md` and record the runbook, target, and
  pass/fail evidence.
- iOS or macOS client changes: use the relevant build, smoke, preview-device,
  runner preflight, or performance commands documented in `CLAUDE.md`.
- Performance, lifecycle, or reliability claims: include the observed timing,
  diagnostic events, logs, screenshots, or SQL/API output that directly supports
  the claim.

In final handoffs and PRs, report:

- What changed surfaces were touched.
- The top failure modes considered.
- Exact commands, runbooks, diagnostics, logs, or artifacts used as evidence.
- Any checks intentionally skipped, with the reason and residual risk.

## Common verification

Run focused checks for the packages you touched:

```bash
pnpm --dir packages/core test
pnpm --dir packages/web test
pnpm --dir packages/core typecheck
pnpm --dir packages/web typecheck
pnpm --dir packages/core lint
pnpm --dir packages/web lint
```

Before opening a PR, run the broader checks requested in `CLAUDE.md`.

## Burden Of Proof

Before declaring work complete, try to disprove the change. Identify the
strongest realistic failure mode, verify it with a command, test, trace,
screenshot, audit record, diff, or direct inspection, and include that evidence
in the final handoff.

Treat `done`, `tests passed`, worker claims, passing happy-path tests, generated
summaries, and optimistic UI as claims, not proof. Treat unverified assumptions
as blockers or explicit follow-ups.

Keep this section synchronized with `CLAUDE.md` whenever either file changes.
