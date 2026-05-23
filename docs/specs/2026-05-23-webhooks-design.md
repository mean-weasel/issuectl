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
```

## Out of Scope

- Launching agents from intents.
- PR review sessions.
- Direct pushes.
- Comment commands.
- Completion notifications.
