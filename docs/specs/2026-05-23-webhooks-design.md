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
issuectl webhook create mean-weasel/issuectl
issuectl webhook rotate mean-weasel/issuectl --yes
issuectl repo add mean-weasel/issuectl --auto-launch-issues --issue-agent codex
issuectl repo update mean-weasel/issuectl --auto-review-prs --review-agent claude --webhook-payload-mode metadata
issuectl repo show mean-weasel/issuectl
```

`webhook status` reports whether a secret is set, but never prints the secret
value. When `public_webhook_base_url` is set, it also prints the derived
`/api/webhook/github/<repo_id>` URL.
`webhook create` and `webhook rotate` use the current `gh` authenticated user,
require confirmation unless `--yes` is passed, generate a fresh receiver secret,
store the GitHub hook id, and do not print the secret.

The dashboard settings page exposes the same repo-level automation flags and
agent selectors. Raw payload storage should remain `metadata` unless a
short-lived debugging session requires `raw`.

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

- Direct pushes.
- New push platforms or preference schema beyond the existing APNs/iOS device
  registration surface.
