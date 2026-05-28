# Webhook Auto-Sessions Runbook

This runbook covers the v1 GitHub webhook auto-session flow for issue launches and PR review sessions.

For repeatable hands-on QA with the two test repositories, including target creation, diagnostics, expected evidence, and reset commands, use [Webhook Label Manual QA](./webhook-label-manual-qa.md). To choose the smallest right QA workflow and understand complexity order, use [Webhook QA Ladder](./webhook-qa-ladder.md). For the higher-complexity issue-to-PR-to-review chain, use [Webhook Issue-To-PR Review QA](./webhook-issue-to-pr-review-qa.md).

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

### Tunnel Health Preflight

Run this before adding an automation label, especially when using a quick tunnel.
Quick tunnel hostnames can expire or stop resolving; GitHub then records `502`
deliveries and issuectl will not create a local webhook intent.

```bash
OWNER=mean-weasel
REPO=issuectl-test-repo-2

pnpm --dir packages/cli exec issuectl webhook status "$OWNER/$REPO"

hook_id="$(sqlite3 ~/.issuectl/issuectl.db "
select webhook_id
from repos
where owner='$OWNER' and name='$REPO';")"

gh api "repos/$OWNER/$REPO/hooks/$hook_id" \
  --jq '{id, active, url: .config.url, updated_at}'

gh api "repos/$OWNER/$REPO/hooks/$hook_id/deliveries" \
  --jq '.[0:8][] | {event, action, status_code, delivered_at, redelivery}'
```

Pass signal:

- The GitHub hook URL matches `issuectl webhook status`.
- The hostname resolves and reaches the local server.
- Recent real deliveries have `status_code=200`.

If the hook points at a stale quick tunnel or recent deliveries show `502`:

1. Start a fresh tunnel.
2. Save the new base URL:

```bash
pnpm --dir packages/cli exec issuectl repo set "$OWNER/$REPO" \
  --webhook-base-url https://fresh-example.trycloudflare.com
```

3. Rotate the stored GitHub hook so GitHub uses the new URL:

```bash
pnpm --dir packages/cli exec issuectl webhook rotate "$OWNER/$REPO" --yes
```

4. Create a fresh delivery by removing and re-adding the trigger label from the
   local UI. If your `gh` token has `admin:repo_hook`, redelivering the failed
   GitHub delivery is also acceptable.

Do not treat missing local intents as a product launch failure until GitHub has
delivered the relevant `issues.labeled` or `pull_request.labeled` event with
`status_code=200`.

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
