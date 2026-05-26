# GitHub Webhook Receiver Foundation

Phase 1 installs a local GitHub webhook receiver in `issuectl web`.

## Endpoint

`POST /api/webhook/github/:repo_id`

The custom Node server handles this route before Next.js so the receiver can verify the raw request body for HMAC validation. Next's request parsing must not run before signature verification.

## Tunnel Examples

```bash
cloudflared tunnel --url http://localhost:3847
ngrok http 3847
tailscale funnel 3847
```

Set the public tunnel base URL in Settings so CLI/API surfaces can show
copyable repository webhook URLs:

Then configure each GitHub webhook to:

```text
https://example-tunnel.trycloudflare.com/api/webhook/github/<repo_id>
```

## Security Invariants

- HMAC verification happens before JSON parsing and before any DB write.
- `X-GitHub-Delivery` is required and deduped before creating event records for repeated deliveries.
- The signed payload repository identity must match the configured repo bound by `:repo_id`.
- Raw payload storage is metadata-only by default; raw payload retention must be explicitly configured.
- `webhook_secret` is never printed by CLI status, diagnostics, or logs.

## CLI

```bash
issuectl webhook status
issuectl webhook tail --limit 20
issuectl webhook tail --repo mean-weasel/issuectl --target issue#506
issuectl webhook intents --repo mean-weasel/issuectl --status active
issuectl webhook intent fire 42 --yes
issuectl webhook intent drop 42 --reason operator_dropped --yes
issuectl webhook create mean-weasel/issuectl
issuectl webhook rotate mean-weasel/issuectl --yes
issuectl repo add mean-weasel/issuectl --auto-launch-issues --issue-agent codex
issuectl repo update mean-weasel/issuectl --auto-review-prs --review-agent claude --webhook-payload-mode metadata
issuectl repo set mean-weasel/issuectl --auto-launch-issues true --auto-review-prs false --webhook-base-url https://example-tunnel.trycloudflare.com
issuectl repo show mean-weasel/issuectl
```

`webhook status` reports whether a secret is set, but never prints the secret
value. When `public_webhook_base_url` is set, it also prints the derived
`/api/webhook/github/<repo_id>` URL.
`webhook create` and `webhook rotate` use the current `gh` authenticated user,
require confirmation unless `--yes` is passed, generate a fresh receiver secret,
store the GitHub hook id, and do not print the secret.
`repo add` performs advisory local preflight checks when webhook automation is
enabled. Missing `gh`, missing hook scope, missing `cloudflared`, or first-ping
timeout warn and preserve saved repo automation settings rather than failing;
operators can use any public tunnel provider and finish installation with
`issuectl webhook create` or repo settings.
`webhook intents` lists the persisted debounce/launch queue. `webhook intent
fire` schedules a pending or deferred intent immediately, and `webhook intent
drop` expires an active intent with an operator reason. `webhook replay` can
replay retained, target-bearing, replayable deliveries into immediate intents
and records replay diagnostics. Metadata-only pruned deliveries still cannot be
replayed safely, and richer replay-count lineage remains a later schema/UX
extension.

Webhook issue/comment-command sessions use bounded daemon mutation budgets:
comment actions are limited to one, label actions are limited to two, and
`create_issue`, `create_pr`, and `push` actions have zero budget for issue
sessions in v1. The daemon-mediated mutation gateway enforces these budgets
before any GitHub write.

The dashboard settings and workbench repo setup surfaces expose the same
repo-level automation flags, issue/review agent selectors, payload mode, stored
webhook id status, and copyable webhook URL. Workbench repo setup can create a
GitHub webhook or rotate its receiver secret using the current `gh`
authenticated user; the generated secret is stored locally and never returned to
the browser.

On dashboard startup, `issuectl web` also performs a non-blocking webhook URL
reconciliation pass after the HTTP server is listening. The pass uses the
configured `public_webhook_base_url` and each repo's stored GitHub webhook id to
compare the remote hook URL with the derived `/api/webhook/github/<repo_id>`
receiver URL. Drifted URLs are patched in GitHub without rotating the stored
secret. Missing base URL, repos without stored hook ids, and per-repo GitHub
errors do not block dashboard boot; failures are logged and recorded as
diagnostics for manual follow-up.

Raw payload storage should remain `metadata` unless a short-lived debugging
session requires `raw`.

## Retention

Delivery tombstones are retained after raw payload pruning so replay dedupe and
event history continue to work. Raw payload storage is disabled by default; when
enabled, payload bodies are pruned by the worker after the recorded
`retained_until` deadline while delivery metadata remains.

## Session Visibility

Workbench session rows show the deployment target (`issue` or `pr`), launch
agent, trigger source (`manual`, `webhook`, or comment command), runtime status,
and terminal reason when one is recorded. This keeps webhook-created sessions
distinguishable from manual sessions and makes control events such as label
removal or issue closure visible without opening raw diagnostics.

Automatic PR review launch fails closed unless the PR head is same-repo,
non-default, and unprotected. Protected branch heads are denied before launch so
webhook review automation cannot mutate protected refs by default.

The repo overview also shows recent webhook events, recent terminal completion
summaries, and PR review history with the reviewed SHA range. This is the
dashboard-level audit trail for webhook intake, auto-review runs, and agent
completion check-ins.

Active webhook PR reviews have a hard runtime cap controlled by
`review_hard_timeout_minutes`. The default is 30 minutes, `0` disables the cap,
and invalid values fall back to the default. When the cap is exceeded, the
deployment ends with terminal reason `timeout` and the linked active PR review
is marked failed with result reason `timeout`; missing tmux liveness still wins
when both conditions are detected in the same pass.

## Completion Notifications

Deployment completion stores a structured terminal reason and optional result
JSON. Notification senders must claim `notification_sent_at` before publishing a
terminal notification; only the first claimant is allowed to send. Duplicate
workers or retries observe the existing timestamp and skip the external send.
For v1, webhook and comment-command issue/PR sessions publish APNs-backed
terminal outcome notifications through the existing push device preference
surface. Skipped, denied, and rate-limited command outcomes are diagnostic-only
unless they also end a real deployment row.

## Out of Scope

- Direct, ambient-credential agent pushes. Webhook/comment-command agents must
  route GitHub mutations, including allowed PR pushes, through the
  daemon-mediated `issuectl agent mutate` policy gateway.
- Agent-owned PR pushes that bypass daemon mediation. The daemon verifies
  same-repo, non-default, unprotected PR head state, local workspace
  branch/SHA/remote metadata, expected-head ancestry, performs the local
  `git push`, and verifies the remote ref resolves to the pushed commit.
- New push platforms or preference schema beyond the existing APNs/iOS device
  registration surface.
