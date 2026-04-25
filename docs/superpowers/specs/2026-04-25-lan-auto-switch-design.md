# LAN Auto-Switch — Design Spec

**Date:** 2026-04-25
**Status:** Approved
**Issue:** #228

## Summary

When a user accesses the issuectl dashboard through the Cloudflare tunnel
(`issuectl.neonwatty.com`) while on the same home network as the server, the
server detects this and issues a 302 redirect to the LAN IP
(`http://{lanIp}:3847`). This gives the user a direct, low-latency connection
without manually switching URLs.

The feature is one-directional: tunnel → LAN only. There is no automatic
LAN → tunnel fallback — the user re-opens the tunnel URL manually if they
leave the home network.

## Motivation

The dashboard runs on a home server and is exposed via a Cloudflare Tunnel.
When the user is at home on the same Wi-Fi, requests still round-trip through
Cloudflare's edge — unnecessarily slow for a device that's on the same LAN.
Split DNS would solve this at the router level, but requires router
configuration and doesn't adapt to LAN IP changes from DHCP.

A server-side redirect is transparent, automatic, and self-contained.

## Detection Logic

### Public IP detection

On server startup, fetch the server's public IP from `https://api.ipify.org`
(plain text response, no API key). Cache in memory. Refresh every 30 minutes
via a `.unref()`'d `setInterval` to handle dynamic ISP IPs without blocking
graceful shutdown.

If the fetch fails (no internet, API down), log a warning and disable
auto-switch gracefully — the middleware checks for `null` and passes through.

Timeout: 5 seconds on the fetch to avoid blocking startup.

### LAN IP detection

Use `os.networkInterfaces()` to find the first non-internal IPv4 address.
Filter out loopback (`127.0.0.1`), link-local (`169.254.x.x`), and IPv6.
Refresh alongside the public IP every 30 minutes.

### "Same network" detection (per request)

Cloudflare sets the `CF-Connecting-IP` header on every request that traverses
the tunnel. The value is the client's real public IP.

When a request arrives:

1. Check for `CF-Connecting-IP` — if absent, this is a direct/LAN request → pass through
2. Compare `CF-Connecting-IP` against the cached public IP
3. Match → client is on the home network → redirect to LAN
4. Mismatch → client is genuinely remote → pass through

Direct LAN requests never have the `CF-Connecting-IP` header, so there is no
risk of redirect loops.

## Redirect Mechanism

### Next.js Middleware (`packages/web/middleware.ts`)

A new middleware file that runs before route handlers.

**What gets redirected:**

- Document navigations (HTML pages) — yes
- API calls, `_next/` assets, static files — no

Once the browser follows the redirect and loads the page from the LAN origin,
all subsequent requests use relative URLs and go to the LAN origin
automatically. Redirecting sub-resources would be wasteful.

**Redirect target:**

```
http://{lanIp}:3847{pathname}{search}
```

302 (temporary) redirect, not 301, so the browser doesn't cache it
permanently — the user's network context changes.

### Middleware matcher

```typescript
export const config = {
  matcher: [
    // Only document navigations — skip _next, api, static assets
    "/((?!_next|api|favicon|icon|apple-touch-icon|manifest|sw|offline).*)",
  ],
};
```

## IP Resolution Module

### New file: `packages/web/lib/network-info.ts`

Server-side only module. Never exposed to the client.

```
getPublicIp()          → string | null
getLanIp()             → string | null
refreshNetworkInfo()   → Promise<void>
```

### Startup integration (`server.ts`)

1. Import and call `refreshNetworkInfo()` before `server.listen()`
2. Set up 30-minute refresh interval (`.unref()`'d)
3. Log discovered IPs at `info` level alongside the existing startup message

## Configuration

| Env var | Required | Purpose |
|---|---|---|
| `ISSUECTL_TUNNEL_URL` | No | Tunnel URL (e.g., `https://issuectl.neonwatty.com`). When unset, auto-switch is disabled entirely. |

No other configuration is needed. Public IP and LAN IP are detected
automatically.

## Edge Cases

| Scenario | Behavior |
|---|---|
| Server can't reach `api.ipify.org` on startup | Auto-switch disabled, tunnel works normally |
| Public IP changes mid-session | Next refresh cycle (≤30 min) picks it up |
| Multiple LAN interfaces (Ethernet + Wi-Fi) | Pick first non-internal IPv4 |
| VPN active on client device | Client's public IP differs → no redirect → stays on tunnel (correct) |
| VPN active on server | Server's ipify IP differs from LAN clients' public IP → no redirect (safe) |
| `ISSUECTL_TUNNEL_URL` not set | Feature is off — middleware does nothing |
| E2E tests | Don't set `ISSUECTL_TUNNEL_URL` → no interference |

## What This Feature Does NOT Do

- No LAN → tunnel fallback (user re-opens tunnel URL manually)
- No client-side changes (no hooks, components, or service worker modifications)
- No database changes (configuration via env var only)
- No changes to CSP or security headers (LAN requests are same-origin)

## Files Changed

| File | Change |
|---|---|
| `packages/web/lib/network-info.ts` | New — IP resolution + caching |
| `packages/web/middleware.ts` | New — redirect logic |
| `packages/web/server.ts` | Call `refreshNetworkInfo()` on startup, set up refresh interval |
