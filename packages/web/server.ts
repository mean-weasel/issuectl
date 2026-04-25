import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import next from "next";
import log, { logPath } from "./lib/logger";
import { handleUpgrade, activeWsCount } from "./lib/terminal-proxy";

const TERMINAL_WS_RE = /^\/api\/terminal\/(\d+)\/ws/;

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT ?? 3847);

const app = next({ dev, port });
const handle = app.getRequestHandler();

await app.prepare();

// ---------------------------------------------------------------------------
// HTTP request logging
// ---------------------------------------------------------------------------

function logRequest(req: IncomingMessage, res: ServerResponse): void {
  const start = Date.now();
  const { method, url } = req;

  // `close` fires on every response (including aborted ones), unlike
  // `finish` which only fires when the response was fully sent.
  res.on("close", () => {
    log.debug({
      msg: "http_request",
      method,
      url,
      status: res.statusCode,
      ms: Date.now() - start,
      aborted: !res.writableFinished,
    });
  });
}

const server = createServer((req, res) => {
  logRequest(req, res);
  handle(req, res).catch((err) => {
    log.error({ err, msg: "next_request_handler_error", url: req.url });
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    res.end("Internal Server Error");
  });
});

// ---------------------------------------------------------------------------
// WebSocket upgrade handling
// ---------------------------------------------------------------------------

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
    const terminalPort = Number(match[1]);
    socket[HANDLED] = true;
    try {
      handleUpgrade(req, socket, head, terminalPort);
    } catch (err) {
      log.error({ err, msg: "terminal_upgrade_failed", port: terminalPort });
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
    }
  }
});

// ---------------------------------------------------------------------------
// Process health heartbeat
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 30_000;

function heartbeat(): void {
  const mem = process.memoryUsage();
  log.debug({
    msg: "heartbeat",
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    rssMB: Math.round(mem.rss / 1024 / 1024),
    activeWs: activeWsCount(),
  });
}

const heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
heartbeatTimer.unref();

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

server.listen(port, () => {
  log.info({
    msg: "server_start",
    port,
    mode: dev ? "dev" : "prod",
    logFile: logPath,
  });
  console.log(`> issuectl dashboard on http://localhost:${port} (${dev ? "dev" : "prod"})`);
  console.log(`> logs: ${logPath}`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ msg: "server_shutdown" });
  server.close(() => {
    log.flush(() => process.exit(0));
  });
  // Force exit after 5s if connections don't drain; unref so a clean
  // shutdown before the deadline doesn't hold the event loop open.
  setTimeout(() => {
    log.flush(() => process.exit(1));
  }, 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ---------------------------------------------------------------------------
// Crash handlers
// ---------------------------------------------------------------------------
// Pino's flush() is async (callback-based). Use the callback to
// delay process.exit() until the buffer drains, with a safety-net
// timeout in case the callback never fires. The console.error
// fallback guarantees the crash is visible on stderr regardless.

function crashExit(label: string, err: Error): void {
  console.error(`FATAL ${label}:`, err);
  log.fatal({ err, msg: label });
  try {
    log.flush(() => process.exit(1));
  } catch (flushErr) {
    console.error("Failed to flush logs during crash:", flushErr);
    process.exit(1);
  }
  setTimeout(() => process.exit(1), 1000).unref();
}

process.on("uncaughtException", (err) => {
  crashExit("uncaught_exception", err);
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  crashExit("unhandled_rejection", err);
});
