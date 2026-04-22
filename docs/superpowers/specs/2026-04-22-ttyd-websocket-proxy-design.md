# ttyd WebSocket Proxy Design

**Date:** 2026-04-22
**Status:** Approved
**Problem:** ttyd terminals don't work through the Cloudflare tunnel. The dashboard at `issuectl.neonwatty.com` loads over HTTPS, but terminal iframes point to `http://localhost:{port}`, which is blocked by mixed content. The ttyd ports (7700-7799) are not individually tunneled.

## Approach

A Next.js WebSocket proxy route that tunnels all ttyd traffic (HTML, JS, CSS, WebSocket) through the existing dashboard port (3847). The iframe switches from `http://localhost:{port}` to `/api/terminal/{port}/`, making everything same-origin.

### Alternatives considered

- **Wildcard DNS + per-port tunnel routes** — Would require dynamic cloudflared config updates on every launch and 100 DNS entries. Fragile and operationally complex.
- **Embedded xterm.js replacing ttyd** — Large scope increase: rebuild terminal multiplexing, process management, and resize handling that ttyd already provides. Not worth it for a proxy problem.

## Section 1: Route Structure

| Route | Purpose |
|---|---|
| `/api/terminal/[port]/` | Proxy ttyd's HTML page |
| `/api/terminal/[port]/ws` | WebSocket upgrade — handled by `server.ts` upgrade listener, not a Route Handler |
| `/api/terminal/[port]/[...path]/` | Catch-all for ttyd sub-assets (`/token`, JS, CSS) |

Port is validated against active deployments in the DB. Invalid ports get 404.

The iframe `src` changes from `http://{host}:{port}` to `/api/terminal/{port}/`.

## Section 2: WebSocket Proxying

The custom `server.ts` listens for the HTTP `upgrade` event. When the URL matches `/api/terminal/{port}/ws`:

1. Validate port against active deployments in DB
2. Open a WebSocket connection to `ws://127.0.0.1:{port}/ws`
3. Pipe frames bidirectionally between client and upstream

**Security boundary is the proxy, not ttyd.** The `-O` (check-origin) flag is removed from ttyd spawn flags. Origin checking is browser-enforced and spoofable; the proxy's DB-backed port validation is the real gate.

## Section 3: Next.js Integration Point — Custom `server.ts`

A custom `server.ts` in `packages/web/` that:

1. Creates a Node `http.Server`
2. Attaches the WebSocket `upgrade` handler
3. Delegates all non-upgrade HTTP requests to Next.js via `app.getRequestHandler()`

```typescript
// packages/web/server.ts (sketch)
import { createServer } from "node:http";
import next from "next";
import { handleUpgrade } from "./lib/terminal-proxy.js";

const dev = process.argv.includes("--dev");
const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => handle(req, res));

server.on("upgrade", (req, socket, head) => {
  const match = req.url?.match(/^\/api\/terminal\/(\d+)\/ws/);
  if (match) {
    handleUpgrade(req, socket, head, Number(match[1]));
  } else {
    socket.destroy();
  }
});

server.listen(3847, () => {
  console.log("> issuectl dashboard on http://localhost:3847");
});
```

**CLI change:** `issuectl web` changes from spawning `next start` to spawning `node server.js`. Turbo's `dev` script also changes to use `node server.js --dev`.

**Dev mode:** Same server code, `next({ dev: true })` enables HMR and fast refresh.

## Section 4: HTTP Asset Proxying

ttyd serves HTML, JavaScript, and CSS that the iframe needs to load. The proxy handles this through standard Next.js Route Handlers:

- **`/api/terminal/[port]/route.ts`** — Validates port against DB, proxies `GET` to `http://127.0.0.1:{port}/`, rewrites root-relative URLs in the HTML response body (e.g., `href="/token"` becomes `href="/api/terminal/{port}/token"`, `src="/auth_token.js"` becomes `src="/api/terminal/{port}/auth_token.js"`) so subsequent asset fetches route through the proxy. The WebSocket URL that ttyd's JS constructs from `window.location` will naturally resolve to `/api/terminal/{port}/ws` since the iframe's origin is the dashboard.
- **`/api/terminal/[port]/[...path]/route.ts`** — Catch-all for sub-paths. Same pattern: validate, proxy, stream back with correct `Content-Type`.

Responses are streamed, not buffered.

## Section 5: iframe and Frontend Changes

**`TerminalPanel.tsx`:**
- iframe `src` changes from `http://${ttydHost}:${ttydPort}` to `/api/terminal/${ttydPort}/`
- Remove `ttydHost` logic (no longer needed — always same-origin)
- Reconnect/health-check polling switches to the proxied URL

**`next.config.ts`:**
- Tighten or remove `frame-src http://*:*` CSP directive (frames are now same-origin)
- Update comments documenting ttyd security mitigations

**No changes to:** terminal UI behavior, styling, resize handling, ttyd process lifecycle.

## Section 6: ttyd Spawn Flag Changes

**Before:** `-W -p {port} -q`
**After:** `-W -i 127.0.0.1 -p {port} -q`

| Change | Reason |
|---|---|
| Add `-i 127.0.0.1` | Only the local proxy connects; binding to loopback prevents direct external access to ttyd |

Unchanged: `-W` (write mode), `-p {port}`, `-q` (quiet).

Binding to loopback is enforced by the OS network stack — stronger than any application-level origin check.

## Section 7: Error Handling and Edge Cases

**Proxy errors:**
- **ttyd not running (`ECONNREFUSED`):** Return 502 with "Terminal not available" message
- **Port not in DB:** Return 404, no information leakage
- **WebSocket upgrade fails:** Destroy client socket; ttyd's JS shows built-in "connection closed" overlay

**Lifecycle:**
- **Deployment ends while open:** ttyd process is killed, upstream socket closes, proxy propagates close to client. No special teardown logic.
- **Server restart:** `server.ts` handles `SIGTERM` — stop accepting connections, drain WebSocket frames (short timeout), exit. pm2 handles restart.

**Performance:**
- Streaming, no buffering. One local-loopback hop (~0.1ms).
- 1:1 proxy — one WebSocket per iframe per ttyd process. No multiplexing.

**Not building:**
- No auth layer on proxy routes — dashboard-level auth (Cloudflare Access, VPN) is the gate
- No rate limiting — long-lived WebSocket connections, not high-frequency requests
- No TLS termination — Cloudflare handles HTTPS/HTTP boundary
