# Webhook Auto-Sessions Runbook

This runbook covers the v1 GitHub webhook auto-session flow for issue launches and PR review sessions.

## Receiver URL

The local web server handles GitHub deliveries before Next.js request parsing so HMAC verification can use the raw request body.

```text
POST /api/webhook/github/<repo_id>
```

The singular `/api/webhook/...` route is intentional and matches the backend receiver contract. Some UX planning notes used plural wording for related event-stream routes, but repository webhooks should point at the singular receiver URL.

## Public Tunnel

`issuectl` does not manage a bundled tunnel. Use any public HTTPS endpoint that forwards to the dashboard port, usually `3847`.

```bash
cloudflared tunnel --url http://localhost:3847
ngrok http 3847
tailscale funnel 3847
```

Save the public base URL with either the CLI or the dashboard settings surface:

```bash
issuectl repo set mean-weasel/issuectl --webhook-base-url https://example.trycloudflare.com
```

Then install or rotate the GitHub hook:

```bash
issuectl webhook create mean-weasel/issuectl
issuectl webhook rotate mean-weasel/issuectl --yes
```

`issuectl repo add --webhook` performs advisory checks for `gh` hook scope and `cloudflared`, but missing `cloudflared` is not fatal. Operators may use ngrok, Tailscale Funnel, a reverse proxy, or another public endpoint.

## Opt-In Model

Automatic work requires both a repo flag and a target label.

| Target | Repo flag | GitHub label |
| --- | --- | --- |
| Issue | `auto_launch_issues` | `issuectl:auto-launch` |
| PR | `auto_review_prs` | `issuectl:auto-review` |

Useful setup commands:

```bash
issuectl repo add mean-weasel/issuectl --auto-launch-issues --auto-review-prs --issue-agent codex --review-agent codex
issuectl repo show mean-weasel/issuectl
issuectl webhook status mean-weasel/issuectl
```

Disabling a repo automation flag ends matching active webhook sessions and records diagnostics with affected session ids.

## Debugging

Start with the diagnostics journal for launch, terminal, and session failures:

```bash
pnpm --dir packages/cli exec issuectl diag list --limit 50
pnpm --dir packages/cli exec issuectl diag show --deployment <deployment-id>
pnpm --dir packages/cli exec issuectl diag tail --issue mean-weasel/issuectl#506
```

For webhook intake and debounce state:

```bash
issuectl webhook tail --repo mean-weasel/issuectl --target issue#506
issuectl webhook intents --repo mean-weasel/issuectl --status active
issuectl webhook intent fire 42 --yes
issuectl webhook intent drop 42 --reason operator_dropped --yes
```

Use the dashboard routes for operator inspection:

```text
/logs/webhooks
/sessions?tab=reviews
/reviews/<review_id>
/repos/<owner>/<repo>/settings
```

## Security Notes

- Webhook signatures are verified before JSON parsing or event writes.
- `webhook_secret`, raw signatures, and raw request bodies are not printed in CLI status, diagnostics, logs, or the webhook log UI.
- The webhook log can show invalid-signature diagnostics and delivery metadata, but it intentionally does not display `X-Hub-Signature-256`.
- Payload storage defaults to metadata-only. Raw payload mode is for short debugging windows and the dashboard redacts retained payload previews.
- Webhook/comment-command agents must use the daemon-mediated `issuectl agent mutate` policy gateway for GitHub writes.

## Deferred Product Scope

The current gap-closure work intentionally does not add `issuectl issue create --auto-launch` or `issuectl pr create --auto-review`. Those flags require dedicated issue/PR creation command modules and are tracked as future product scope, separate from webhook auto-session setup and operation.
