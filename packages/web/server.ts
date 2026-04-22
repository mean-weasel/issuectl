import { createServer, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import next from "next";
import { handleUpgrade } from "./lib/terminal-proxy.js";

const TERMINAL_WS_RE = /^\/api\/terminal\/(\d+)\/ws/;

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT ?? 3847);

const app = next({ dev, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
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

const origOn = server.on.bind(server);
const origAddListener = server.addListener.bind(server);

function wrapUpgradeListener(
  fn: (req: IncomingMessage, socket: Duplex, head: Buffer) => void,
) {
  return function wrappedUpgrade(
    req: IncomingMessage,
    socket: Duplex & { [HANDLED]?: boolean },
    head: Buffer,
  ) {
    if (socket[HANDLED]) return;
    fn(req, socket, head);
  };
}

server.on = function (event: string, listener: (...args: unknown[]) => void) {
  if (event === "upgrade") {
    return origOn(event, wrapUpgradeListener(listener as Parameters<typeof wrapUpgradeListener>[0]));
  }
  return origOn(event, listener);
} as typeof server.on;

server.addListener = function (event: string, listener: (...args: unknown[]) => void) {
  if (event === "upgrade") {
    return origAddListener(event, wrapUpgradeListener(listener as Parameters<typeof wrapUpgradeListener>[0]));
  }
  return origAddListener(event, listener);
} as typeof server.addListener;

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

server.listen(port, () => {
  console.log(`> issuectl dashboard on http://localhost:${port} (${dev ? "dev" : "prod"})`);
});

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
