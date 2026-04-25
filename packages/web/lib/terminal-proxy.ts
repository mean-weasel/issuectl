import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { getDb, getActiveDeploymentByPort } from "@issuectl/core";
import log from "./logger.js";

const PORT_MIN = 7700;
const PORT_MAX = 7799;

/**
 * Validate that a port number is in the ttyd range and belongs to an
 * active deployment. This is the security boundary — only ports with
 * a live deployment row are proxied.
 */
export function isValidTerminalPort(port: number): boolean {
  if (!Number.isFinite(port) || port < PORT_MIN || port > PORT_MAX) {
    return false;
  }
  const db = getDb();
  return getActiveDeploymentByPort(db, port) !== undefined;
}

/**
 * Proxy an HTTP request to a local ttyd instance and return the response.
 * Used by the Route Handlers to forward HTML/JS/CSS asset requests.
 */
export async function proxyHttpRequest(
  port: number,
  path: string,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const url = `http://127.0.0.1:${port}${path}`;
  const res = await fetch(url);
  const body = Buffer.from(await res.arrayBuffer());
  const headers = Object.fromEntries(res.headers.entries());
  return { status: res.status, headers, body };
}

/**
 * Rewrite root-relative URLs in ttyd's HTML so asset requests route
 * back through the proxy. ttyd serves paths like `/token`,
 * `/auth_token.js`, etc. that need to become
 * `/api/terminal/{port}/token`, etc.
 */
export function rewriteHtml(html: string, port: number): string {
  const prefix = `/api/terminal/${port}`;
  return html
    .replace(/(href|src|action)="\/(?!\/)/g, `$1="${prefix}/`)
    .replace(/(href|src|action)='\/(?!\/)/g, `$1='${prefix}/`);
}

const wss = new WebSocketServer({ noServer: true });
wss.on("error", (err) => {
  log.error({ err, msg: "wss_error" });
});

// ---------------------------------------------------------------------------
// Active connection tracking
// ---------------------------------------------------------------------------

let _activeWsCount = 0;

/** Number of currently active WebSocket proxy connections. */
export function activeWsCount(): number {
  return _activeWsCount;
}

// ---------------------------------------------------------------------------
// Back-pressure threshold
// ---------------------------------------------------------------------------

// When the client WebSocket's send buffer exceeds this, we drop frames
// from ttyd rather than queueing unboundedly. 1 MB is generous — a
// typical terminal frame is under 4 KB, so this accommodates ~250
// queued frames before shedding. This prevents OOM when ttyd produces
// fast output over a slow tunnel (e.g. Cloudflare → mobile).
const BACKPRESSURE_BYTES = 1024 * 1024;

// ---------------------------------------------------------------------------
// Safe send helper
// ---------------------------------------------------------------------------

function safeSend(
  ws: WebSocket,
  data: Buffer | ArrayBuffer | Buffer[],
  opts: { binary: boolean },
  label: string,
  port: number,
): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(data, opts);
    return true;
  } catch (err) {
    log.error({ err, msg: "ws_send_error", label, port });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Per-connection frame stats (logged every TICK_INTERVAL_MS at debug level)
// ---------------------------------------------------------------------------
const TICK_INTERVAL_MS = 5_000;

interface WsStats {
  readonly clientIp: string;
  readonly port: number;
  framesFromTtyd: number;
  framesToClient: number;
  bytesToClient: number;
  peakBufferedAmount: number;
  droppedFrames: number;
  backpressureDrops: number;
  backpressureShedding: boolean;
  readonly connectedAt: number;
}

/**
 * Handle an HTTP upgrade request for a terminal WebSocket. Called from
 * `server.ts`'s `upgrade` event listener.
 */
export function handleUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  port: number,
): void {
  if (!isValidTerminalPort(port)) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    _activeWsCount++;

    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress
      ?? "unknown";

    const stats: WsStats = {
      clientIp,
      port,
      framesFromTtyd: 0,
      framesToClient: 0,
      bytesToClient: 0,
      peakBufferedAmount: 0,
      droppedFrames: 0,
      backpressureDrops: 0,
      backpressureShedding: false,
      connectedAt: Date.now(),
    };

    log.info({ msg: "ws_connect", port, clientIp, activeWs: _activeWsCount });

    const tickTimer = setInterval(() => {
      log.debug({
        msg: "ws_tick",
        port,
        clientIp,
        uptimeSec: ((Date.now() - stats.connectedAt) / 1000).toFixed(1),
        framesIn: stats.framesFromTtyd,
        framesOut: stats.framesToClient,
        bytesOut: stats.bytesToClient,
        peakBuffered: stats.peakBufferedAmount,
        dropped: stats.droppedFrames,
        backpressureDrops: stats.backpressureDrops,
      });
    }, TICK_INTERVAL_MS);

    // Forward the subprotocol (ttyd requires "tty") so the upstream
    // handshake succeeds and the terminal session initializes.
    const protocols = req.headers["sec-websocket-protocol"]?.split(",").map((s) => s.trim());
    const upstream = new WebSocket(`ws://127.0.0.1:${port}/ws`, protocols);

    // Buffer client messages that arrive before upstream is ready.
    // ttyd's client-side JS sends the handshake (token + terminal size)
    // immediately on open, which often arrives while upstream is still
    // CONNECTING.
    const pendingClientMsgs: { data: Buffer | ArrayBuffer | Buffer[]; isBinary: boolean }[] = [];
    clientWs.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) {
        safeSend(upstream, data, { binary: isBinary }, "client_to_upstream", port);
      } else if (upstream.readyState === WebSocket.CONNECTING) {
        pendingClientMsgs.push({ data, isBinary });
      }
      // CLOSING/CLOSED: silently drop — the close/error handlers will
      // clean up the connection.
    });

    upstream.on("open", () => {
      for (const msg of pendingClientMsgs) {
        if (!safeSend(upstream, msg.data, { binary: msg.isBinary }, "flush_buffered", port)) break;
      }
      pendingClientMsgs.length = 0;

      upstream.on("message", (data, isBinary) => {
        stats.framesFromTtyd++;

        if (clientWs.readyState !== WebSocket.OPEN) {
          stats.droppedFrames++;
          return;
        }

        // Back-pressure: if the client's send buffer is full (slow
        // tunnel), drop this frame rather than queueing unboundedly.
        const buffered = clientWs.bufferedAmount;
        if (buffered > stats.peakBufferedAmount) {
          stats.peakBufferedAmount = buffered;
        }
        if (buffered > BACKPRESSURE_BYTES) {
          if (!stats.backpressureShedding) {
            stats.backpressureShedding = true;
            log.warn({ msg: "ws_backpressure_start", port, clientIp, bufferedBytes: buffered });
          }
          stats.backpressureDrops++;
          return;
        }
        if (stats.backpressureShedding) {
          stats.backpressureShedding = false;
          log.warn({ msg: "ws_backpressure_clear", port, clientIp, droppedDuringEpisode: stats.backpressureDrops });
        }

        const len = data instanceof Buffer ? data.length
          : data instanceof ArrayBuffer ? data.byteLength
          : (data as Buffer[]).reduce((acc, b) => acc + b.length, 0);

        if (safeSend(clientWs, data, { binary: isBinary }, "upstream_to_client", port)) {
          stats.bytesToClient += len;
          stats.framesToClient++;
        } else {
          stats.droppedFrames++;
        }
      });
    });

    let cleanedUp = false;
    function cleanup(reason: string) {
      if (cleanedUp) return;
      cleanedUp = true;
      _activeWsCount--;
      clearInterval(tickTimer);

      const uptimeSec = ((Date.now() - stats.connectedAt) / 1000).toFixed(1);
      log.info({
        msg: "ws_close",
        reason,
        port,
        clientIp,
        uptimeSec,
        framesIn: stats.framesFromTtyd,
        framesOut: stats.framesToClient,
        bytesOut: stats.bytesToClient,
        peakBuffered: stats.peakBufferedAmount,
        dropped: stats.droppedFrames,
        backpressureDrops: stats.backpressureDrops,
        activeWs: _activeWsCount,
      });
    }

    clientWs.on("close", () => {
      cleanup("client_close");
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
    });

    upstream.on("close", () => {
      cleanup("upstream_close");
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    upstream.on("error", (err) => {
      log.error({
        err,
        msg: "ws_upstream_error",
        port,
        clientIp,
        bufferedMsgs: pendingClientMsgs.length,
      });
      cleanup("upstream_error");
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
      upstream.terminate();
    });

    clientWs.on("error", (err) => {
      log.error({ err, msg: "ws_client_error", port, clientIp });
      cleanup("client_error");
      upstream.terminate();
    });
  });
}
