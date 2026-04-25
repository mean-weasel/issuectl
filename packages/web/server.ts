import { createServer, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import next from "next";
import { handleUpgrade } from "./lib/terminal-proxy.js";
import { refreshNetworkInfo, getPublicIp, getLanIp, getLanRedirectUrl } from "./lib/network-info.js";

const TERMINAL_WS_RE = /^\/api\/terminal\/(\d+)\/ws/;

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT ?? 3847);

const app = next({ dev, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  // LAN auto-switch: redirect tunnel requests from same-network clients.
  const clientIp = req.headers["cf-connecting-ip"] as string | undefined;
  const parsed = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const redirectUrl = getLanRedirectUrl(clientIp, parsed.pathname, parsed.search, port);
  if (redirectUrl) {
    res.writeHead(302, { Location: redirectUrl });
    res.end();
    return;
  }

  handle(req, res);
});

// Next.js attaches its HMR upgrade listener lazily (after the first
// request, not at app.prepare() time). We can't capture it at startup.
// Instead, intercept server.on/addListener so that whenever Next.js
// (or anything else) registers an upgrade listener, we wrap it to skip
// sockets already handled by us. Our handler runs first via
// prependListener, marks the socket with a Symbol, and wrapped
// listeners check that Symbol to no-op.
const HANDLED = Symbol("terminalHandled");

type UpgradeListener = (req: IncomingMessage, socket: Duplex, head: Buffer) => void;

function wrapUpgradeListener(fn: UpgradeListener): UpgradeListener {
  return function wrappedUpgrade(req, socket: Duplex & { [HANDLED]?: boolean }, head) {
    if (socket[HANDLED]) return;
    fn(req, socket, head);
  };
}

function interceptUpgradeRegistrations(
  method: "on" | "addListener",
): void {
  const orig = server[method].bind(server);
  server[method] = function (event: string, listener: (...args: unknown[]) => void) {
    if (event === "upgrade") {
      return orig(event, wrapUpgradeListener(listener as UpgradeListener));
    }
    return orig(event, listener);
  } as typeof server.on;
}

interceptUpgradeRegistrations("on");
interceptUpgradeRegistrations("addListener");

// Our terminal handler runs first (prepend). It marks the socket so
// any later upgrade listeners (Next.js HMR, etc.) are no-ops.
server.prependListener("upgrade", (req: IncomingMessage, socket: Duplex & { [HANDLED]?: boolean }, head: Buffer) => {
  const match = req.url?.match(TERMINAL_WS_RE);
  if (match) {
    socket[HANDLED] = true;
    try {
      handleUpgrade(req, socket, head, Number(match[1]));
    } catch (err) {
      console.error("[issuectl] terminal upgrade handler failed:", err);
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
    }
  }
});

// Detect network IPs for LAN auto-switch (non-blocking — failure disables the feature).
await refreshNetworkInfo();

server.listen(port, () => {
  const lanIp = getLanIp();
  const publicIp = getPublicIp();
  console.log(`> issuectl dashboard on http://localhost:${port} (${dev ? "dev" : "prod"})`);
  if (lanIp && publicIp) {
    console.log(`> LAN auto-switch: public=${publicIp}, lan=${lanIp}`);
  } else {
    console.log("> LAN auto-switch: disabled (could not detect IPs)");
  }
});

// Refresh IPs every 30 minutes to handle DHCP/ISP changes.
const IP_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
setInterval(refreshNetworkInfo, IP_REFRESH_INTERVAL_MS).unref();

// Graceful shutdown
function shutdown() {
  console.log("[issuectl] shutting down...");
  server.close(() => {
    process.exit(0);
  });
  // Force exit after 5s if connections don't drain; unref so a clean
  // shutdown before the deadline doesn't hold the event loop open.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
