# T007 Live Chrome Webhook QA

## Result

Done. Fresh Chrome-extension-driven QA proved both issue auto-launch and PR auto-review from the local issuectl UI through a fresh Cloudflare tunnel, with deterministic `ISSUECTL_CLI` completion evidence and cleanup.

## Harness

- Local server: `pnpm --dir packages/cli exec issuectl web --port 3847`
- Tunnel: `https://highway-wake-boulder-officer.trycloudflare.com`
- Repo: `mean-weasel/issuectl-test-repo-2`
- Repo row: `9`
- GitHub hook: `631428815`
- Hook receiver during QA: `https://highway-wake-boulder-officer.trycloudflare.com/api/webhook/github/9`
- Chrome UI route for health: `/repos/mean-weasel/issuectl-test-repo-2/settings`

## UI Health Evidence

- Repo settings showed `WEBHOOK: OK`.
- Repo settings health card showed `GITHUB WEBHOOK DELIVERY LOOKS HEALTHY`.
- Latest health delivery after UI resend: `ping · 200`.
- Label health showed `REQUIRED LABELS ARE PRESENT`.
- Issue label editor showed healthy webhook state before applying `issuectl:auto-launch`.
- PR label editor showed healthy webhook state before applying `issuectl:auto-review`.

## Issue Auto-Launch Evidence

- Test issue: `mean-weasel/issuectl-test-repo-2#47`
- Issue URL: `https://github.com/mean-weasel/issuectl-test-repo-2/issues/47`
- UI label action: applied `issuectl:auto-launch` from `/issues/mean-weasel/issuectl-test-repo-2/47`.
- GitHub deliveries:
  - `issues.opened` guid `1e491ed8-5acc-11f1-8657-bfaa6a7fc6cd`, status `200`
  - `issues.labeled` guid `320172e0-5acc-11f1-86db-7896d3bc59f4`, status `200`
- Launch intent: `84`, status `launched`, deployment `162`
- Follow-up cleanup intent: `85`, status `skipped_optout`, reason `Auto-launch label consumed after launch`
- Deployment: `162`, target `issue#47`, agent `codex`, trigger `webhook`
- Worktree: `/Users/neonwatty/.issuectl/worktrees/issuectl-test-repo-2-issue-47`
- Terminal session: `issuectl-issuectl-test-repo-2-47`, ttyd port `7714`
- Diagnostics include:
  - `launch.requested`
  - `workspace.prepared`
  - `deployment.recorded`
  - `ttyd.spawned`
  - `deployment.activated`
  - `webhook.auto_launch_label_consumed`
  - `webhook.launched`
  - `agent.completion_recorded`
  - `webhook.completed`
- Agent evidence:
  - Spawned Codex terminal printed `ISSUECTL_CLI=set`, `ISSUECTL_SERVER_URL=set`, `ISSUECTL_DEPLOYMENT_ID=set`, `ISSUECTL_REPO_ID=set`, and `ISSUECTL_TARGET_NUMBER=set`.
  - Spawned Codex ran `"$ISSUECTL_CLI" agent complete --deployment "$ISSUECTL_DEPLOYMENT_ID" --status no_changes ...`.
  - Command returned `accepted`.
  - Deployment `162` recorded `completion_result_json`: `{"status":"no_changes","summary":"QA verified issuectl runtime environment; no repository changes made."}`.
- UI state:
  - Issue page showed `CODEX WORKED THIS ISSUE`.
  - Issue page showed `Completed session #162`.
  - Issue page showed `No Changes`.
  - Sessions page showed issue `#47` as `ENDED`, `WEBHOOK`, `COMPLETED`.

## PR Auto-Review Evidence

- Test PR: `mean-weasel/issuectl-test-repo-2#48`
- PR URL: `https://github.com/mean-weasel/issuectl-test-repo-2/pull/48`
- Temporary branch: `qa-webhook-review-20260528T193645Z`
- Head SHA: `daec0b4c479f20c247ea1f0cff6fa7b18d605f74`
- UI label action: applied `issuectl:auto-review` from `/pulls/mean-weasel/issuectl-test-repo-2/48`.
- GitHub deliveries:
  - `pull_request.opened` guid `979293f0-5acc-11f1-8c05-78fe7aa0e30a`, status `200`
  - `pull_request.labeled` guid `a16dec80-5acc-11f1-84a9-fd1d2e339d2c`, status `200`
- Launch intent: `86`, status `launched`, deployment `163`
- Follow-up cleanup intent: `87`, status `skipped_optout`, reason `Auto-review label consumed after launch`
- Review row: `15`, status `completed`, deployment `163`, completed head SHA `daec0b4c479f20c247ea1f0cff6fa7b18d605f74`
- Deployment: `163`, target `pr#48`, agent `claude`, trigger `webhook`
- Worktree: `/Users/neonwatty/.issuectl/worktrees/issuectl-test-repo-2-pr-48`
- Terminal session: `issuectl-issuectl-test-repo-2-pr-48`, ttyd port `7715`
- Diagnostics include:
  - `launch.requested`
  - `workspace.prepared`
  - `deployment.recorded`
  - `ttyd.spawned`
  - `deployment.activated`
  - `webhook.auto_review_label_consumed`
  - `webhook.launched`
  - `webhook.pr_launched`
  - `agent.completion_recorded`
  - `webhook.completed`
- Agent evidence:
  - Spawned Claude terminal printed `ISSUECTL_CLI=/Users/neonwatty/Desktop/issuectl/node_modules/@issuectl/cli/dist/index.js`.
  - Spawned Claude verified local HEAD matched `ISSUECTL_EXPECTED_HEAD_SHA`.
  - Spawned Claude ran `node "$ISSUECTL_CLI" agent complete --deployment "$ISSUECTL_DEPLOYMENT_ID" --status no_changes ...`.
  - Command returned `accepted`.
  - Deployment `163` recorded `completion_result_json` with status `no_changes`.
  - Review row `15` recorded matching `result_json`.
- UI state:
  - PR label editor showed healthy webhook state before launch and no labels after auto-review consumption.
  - Sessions page showed PR `#48` as `ENDED`, `WEBHOOK`, `COMPLETED`.
  - PR detail page itself does not surface the completed webhook review session card; the sessions view and DB state are the authoritative UI/backend evidence for review completion.

## Cleanup Evidence

- Hook `631428815` disabled after QA: `active=false`.
- Tunnel stopped.
- Local web server stopped.
- Issue `#47` closed and labels cleared.
- PR `#48` closed.
- Temporary branch `qa-webhook-review-20260528T193645Z` deleted from origin.
- Temporary clone `/tmp/issuectl-pr-qa-Tm8Y5a` removed.
- `active_webhook_deployments = 0`.
- `active_webhook_intents = 0`.
- Both QA deployments ended with `terminal_reason = completed`.

## Commands / Checks

- `pnpm --dir packages/cli exec issuectl webhook status mean-weasel/issuectl-test-repo-2`
- `gh api repos/mean-weasel/issuectl-test-repo-2/hooks/631428815`
- `gh api repos/mean-weasel/issuectl-test-repo-2/hooks/631428815/deliveries`
- `pnpm --dir packages/cli exec issuectl diag list --limit 50`
- `pnpm --dir packages/cli exec issuectl diag show --issue mean-weasel/issuectl-test-repo-2#47`
- `pnpm --dir packages/cli exec issuectl diag show --deployment 163`
- SQLite checks for `webhook_intents`, `webhook_events`, `deployments`, and `pr_reviews`
- `lsof -nP -iTCP:3847 -sTCP:LISTEN || true`
- `pgrep -fl 'cloudflared tunnel --url http://localhost:3847' || true`
- `git ls-remote --heads git@github.com:mean-weasel/issuectl-test-repo-2.git qa-webhook-review-20260528T193645Z`
